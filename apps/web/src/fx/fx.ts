/**
 * Слой боевых эффектов на PixiJS 8: частицы, вспышки, числа урона, распад на пиксели.
 * Канвас поверх React (pointer-events: none). Тикер останавливается, когда эффектов нет,
 * поэтому в покое слой не тратит кадры.
 */
import { Application, Container, Graphics, Particle, ParticleContainer, Text, Texture, type Ticker } from 'pixi.js';
import { animScale, isReducedMotion } from '../ui/settings';
import { isLite } from './perf-mode';

interface Part {
  p: Particle;
  vx: number;
  vy: number;
  life: number;
  max: number;
  delay: number;
  g: number;
  drag: number;
  s0: number;
  s1: number;
  a0: number;
  base: number; // размер текстуры
}

interface FloatText {
  t: Text;
  vy: number;
  life: number;
  max: number;
  delay: number;
}

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

function makeTexture(kind: 'square' | 'glow'): Texture {
  const size = kind === 'square' ? 8 : 32;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d')!;
  if (kind === 'square') {
    g.fillStyle = '#fff';
    g.fillRect(0, 0, size, size);
  } else {
    const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.35, 'rgba(255,255,255,0.65)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, size, size);
  }
  return Texture.from(cv);
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

export function parseColor(css: string, fallback = 0xff2bd6): number {
  const s = css.trim();
  if (/^#([0-9a-f]{6})$/i.test(s)) return parseInt(s.slice(1), 16);
  if (/^#([0-9a-f]{3})$/i.test(s)) {
    const [r, g, b] = s.slice(1).split('');
    return parseInt(`${r}${r}${g}${g}${b}${b}`, 16);
  }
  const m = s.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
  if (m) return (Number(m[1]) << 16) | (Number(m[2]) << 8) | Number(m[3]);
  return fallback;
}

class FxEngine {
  private app: Application | null = null;
  private squares: ParticleContainer | null = null;
  private glows: ParticleContainer | null = null;
  private textLayer: Container | null = null;
  private flashG: Graphics | null = null;
  private texSquare: Texture | null = null;
  private texGlow: Texture | null = null;
  private parts: Part[] = [];
  private glowParts: Part[] = [];
  private texts: FloatText[] = [];
  private flashAlpha = 0;
  private mountToken = 0;
  private spawnSeq = 0;

  async mount(host: HTMLElement): Promise<void> {
    const token = ++this.mountToken;
    const app = new Application();
    try {
      await app.init({
        backgroundAlpha: 0,
        resizeTo: window,
        antialias: false,
        autoDensity: true,
        resolution: Math.min(window.devicePixelRatio || 1, window.innerWidth < 900 ? 1.25 : 2),
        preference: 'webgl',
        autoStart: false,
      });
    } catch (e) {
      console.warn('[fx] Pixi не инициализирован:', e);
      return;
    }
    if (token !== this.mountToken) {
      app.destroy({ removeView: true }, { children: true });
      return;
    }
    this.app = app;
    app.canvas.classList.add('fx-canvas');
    // Потеря WebGL-контекста (мало памяти GPU): прячем канвас, иначе он может залить экран белым
    app.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      app.canvas.style.visibility = 'hidden';
    });
    app.canvas.addEventListener('webglcontextrestored', () => {
      app.canvas.style.visibility = '';
    });
    app.canvas.setAttribute('aria-hidden', 'true');
    host.appendChild(app.canvas);
    this.texSquare = makeTexture('square');
    this.texGlow = makeTexture('glow');
    this.flashG = new Graphics();
    this.squares = new ParticleContainer({ dynamicProperties: { position: true, color: true, vertex: true, rotation: false, uvs: false } });
    this.glows = new ParticleContainer({ dynamicProperties: { position: true, color: true, vertex: true, rotation: false, uvs: false } });
    this.glows.blendMode = 'add';
    this.textLayer = new Container();
    app.stage.addChild(this.flashG, this.squares, this.glows, this.textLayer);
    app.ticker.add(this.tick);
    this.prewarm(token);
  }

  /**
   * Компиляция шейдеров, загрузка текстур и замер шрифта — в простое после старта,
   * а не на первом ударе в бою (иначе первый эффект подвисает на 100–200 мс).
   */
  private prewarm(token: number): void {
    const idle = (cb: () => void) => ('requestIdleCallback' in window ? requestIdleCallback(cb, { timeout: 3000 }) : setTimeout(cb, 1500));
    idle(() => {
      const app = this.app;
      if (!app || token !== this.mountToken || !this.squares || !this.glows || !this.textLayer || !this.texSquare || !this.texGlow) return;
      const a = new Particle({ texture: this.texSquare, x: -50, y: -50, alpha: 0.01 });
      const b = new Particle({ texture: this.texGlow, x: -50, y: -50, alpha: 0.01 });
      this.squares.addParticle(a);
      this.glows.addParticle(b);
      const t = this.makeText('0', 0xffffff, 30);
      t.position.set(-100, -100);
      this.textLayer.addChild(t);
      this.squares.update();
      this.glows.update();
      app.render();
      this.squares.removeParticle(a);
      this.glows.removeParticle(b);
      t.destroy();
      if (!app.ticker.started) app.render();
    });
  }

  private makeText(text: string, color: number, size: number): Text {
    const lite = isLite();
    return new Text({
      text,
      style: {
        fontFamily: 'JetBrains Mono Variable, JetBrains Mono, ui-monospace, monospace',
        fontWeight: '800',
        fontSize: size,
        fill: color,
        stroke: { color: 0x05060f, width: Math.max(3, size / 7), join: 'round' },
        // Размытая тень текста рисуется на CPU в canvas — в экономии без неё
        ...(lite ? {} : { dropShadow: { color, alpha: 0.7, blur: 10, distance: 0, angle: 0 } }),
        letterSpacing: 1,
      },
    });
  }

  unmount(): void {
    this.mountToken++;
    if (this.app) {
      this.app.ticker.remove(this.tick);
      this.app.destroy({ removeView: true }, { children: true });
    }
    this.app = null;
    this.parts = [];
    this.glowParts = [];
    this.texts = [];
  }

  get ready(): boolean {
    return this.app !== null;
  }

  private wake(): void {
    const app = this.app;
    if (app && !app.ticker.started) app.ticker.start();
  }

  private tick = (ticker: Ticker): void => {
    const app = this.app;
    if (!app) return;
    const dt = Math.min(0.05, ticker.deltaMS / 1000);
    const step = (list: Part[], pc: ParticleContainer | null) => {
      for (let i = list.length - 1; i >= 0; i--) {
        const q = list[i]!;
        if (q.delay > 0) {
          q.delay -= dt;
          continue;
        }
        q.life -= dt;
        if (q.life <= 0) {
          pc?.removeParticle(q.p);
          list[i] = list[list.length - 1]!;
          list.pop();
          continue;
        }
        const k = 1 - q.life / q.max;
        q.vy += q.g * dt;
        q.vx *= 1 - q.drag * dt;
        q.vy *= 1 - q.drag * dt;
        q.p.x += q.vx * dt;
        q.p.y += q.vy * dt;
        const s = (q.s0 + (q.s1 - q.s0) * k) / q.base;
        q.p.scaleX = q.p.scaleY = s;
        q.p.alpha = q.a0 * (1 - k * k);
      }
    };
    step(this.parts, this.squares);
    step(this.glowParts, this.glows);
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const f = this.texts[i]!;
      if (f.delay > 0) {
        f.delay -= dt;
        f.t.alpha = 0;
        continue;
      }
      f.life -= dt;
      if (f.life <= 0) {
        f.t.destroy();
        this.texts.splice(i, 1);
        continue;
      }
      const k = 1 - f.life / f.max;
      f.t.y += f.vy * dt;
      f.vy *= 0.92;
      f.t.alpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      const pop = k < 0.12 ? 0.6 + (k / 0.12) * 0.6 : k < 0.24 ? 1.2 - ((k - 0.12) / 0.12) * 0.2 : 1;
      f.t.scale.set(pop);
    }
    const fg = this.flashG;
    if (fg) {
      if (this.flashAlpha > 0) {
        this.flashAlpha = Math.max(0, this.flashAlpha - dt * 1.6);
        fg.alpha = this.flashAlpha;
      } else fg.alpha = 0;
    }
    this.squares?.update();
    this.glows?.update();
    if (!this.parts.length && !this.glowParts.length && !this.texts.length && this.flashAlpha <= 0) {
      app.render();
      app.ticker.stop();
    }
  };

  private spawn(kind: 'square' | 'glow', x: number, y: number, o: Partial<Omit<Part, 'p'>> & { color: number }): void {
    const tex = kind === 'square' ? this.texSquare : this.texGlow;
    const pc = kind === 'square' ? this.squares : this.glows;
    if (!tex || !pc) return;
    // Экономия графики: каждая третья частица — эффект читается, нагрузка втрое меньше
    if (isLite() && this.spawnSeq++ % 3 !== 0) return;
    const base = kind === 'square' ? 8 : 32;
    const s0 = o.s0 ?? 6;
    const p = new Particle({ texture: tex, x, y, anchorX: 0.5, anchorY: 0.5, tint: o.color, alpha: o.a0 ?? 1, scaleX: s0 / base, scaleY: s0 / base });
    pc.addParticle(p);
    const life = (o.max ?? 0.6) * animScale();
    const part: Part = {
      p, base, vx: o.vx ?? 0, vy: o.vy ?? 0, life, max: life, delay: (o.delay ?? 0) * animScale(),
      g: o.g ?? 0, drag: o.drag ?? 1.5, s0, s1: o.s1 ?? s0 * 0.3, a0: o.a0 ?? 1,
    };
    (kind === 'square' ? this.parts : this.glowParts).push(part);
    this.wake();
  }

  // ---------------- Публичные эффекты ----------------

  number(x: number, y: number, text: string, color: number, size = 34, delay = 0): void {
    if (!this.app || !this.textLayer) return;
    const t = this.makeText(text, color, size);
    t.anchor.set(0.5);
    // Длинная надпись не уходит за край экрана: ужимаем и сдвигаем внутрь
    const vw = this.app.screen.width;
    if (t.width > vw - 16) t.scale.set((vw - 16) / t.width);
    const half = t.width / 2 + 8;
    t.x = Math.min(Math.max(x + rand(-10, 10), half), vw - half);
    t.y = y;
    const reduced = isReducedMotion();
    this.textLayer.addChild(t);
    const life = 1.1 * animScale();
    this.texts.push({ t, vy: reduced ? 0 : -120, life, max: life, delay: delay * animScale() });
    this.wake();
  }

  hit(r: Rect, amount: number, blocked: number, isPlayer: boolean): void {
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height * 0.42;
    if (amount > 0) this.number(cx, cy, `-${amount}`, isPlayer ? 0xff3b5c : 0xffffff, amount >= 15 ? 46 : 36);
    if (blocked > 0) this.number(cx + 34, cy - 30, `блок ${blocked}`, 0x00f0ff, 20);
    if (isReducedMotion()) return;
    const n = Math.min(40, 10 + amount * 1.5);
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      const sp = rand(140, 520);
      this.spawn('glow', cx + rand(-10, 10), cy + rand(-10, 10), {
        color: i % 3 ? (isPlayer ? 0xff3b5c : 0xff2bd6) : 0xffffff,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 120, g: 900, drag: 2.5, s0: rand(10, 22), s1: 2, max: rand(0.35, 0.7),
      });
    }
    for (let i = 0; i < n / 2; i++) {
      const a = rand(0, Math.PI * 2);
      const sp = rand(80, 300);
      this.spawn('square', cx, cy, { color: isPlayer ? 0xff3b5c : 0xff9bf0, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 500, s0: rand(3, 6), s1: 1, max: rand(0.4, 0.8) });
    }
    if (isPlayer && amount > 0) this.flash(0xff1040, Math.min(0.35, 0.12 + amount / 60));
  }

  shield(r: Rect, amount: number): void {
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height * 0.45;
    this.number(cx, cy - 20, `+${amount}`, 0x00f0ff, 28);
    if (isReducedMotion()) return;
    const n = 28;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      this.spawn('glow', cx + Math.cos(a) * 30, cy + Math.sin(a) * 38, { color: 0x00f0ff, vx: Math.cos(a) * 160, vy: Math.sin(a) * 200, drag: 4, s0: 16, s1: 4, max: 0.55 });
    }
  }

  heal(r: Rect, amount: number): void {
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height * 0.4;
    this.number(cx, cy, `+${amount}`, 0x3dff8a, 32);
    if (isReducedMotion()) return;
    for (let i = 0; i < 24; i++) {
      this.spawn('glow', cx + rand(-r.width / 3, r.width / 3), cy + rand(0, r.height / 2), { color: 0x3dff8a, vy: rand(-220, -80), vx: rand(-20, 20), drag: 1, s0: rand(8, 16), s1: 2, max: rand(0.6, 1), delay: rand(0, 0.2) });
    }
  }

  statusPop(r: Rect, label: string, debuff: boolean): void {
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height * 0.25;
    this.number(cx, cy, label, debuff ? 0xb48cff : 0xe8ff3a, 18, 0.05);
    if (isReducedMotion()) return;
    for (let i = 0; i < 12; i++) {
      const a = rand(0, Math.PI * 2);
      this.spawn('glow', cx, cy + 20, { color: debuff ? 0xb48cff : 0xe8ff3a, vx: Math.cos(a) * 120, vy: Math.sin(a) * 120 - 60, drag: 3, s0: 10, s1: 2, max: 0.5 });
    }
  }

  /** Смерть врага: распад силуэта на пиксели сверху вниз. */
  disintegrate(r: Rect, color: number): void {
    if (isReducedMotion()) return;
    const cell = r.width > 110 ? 6 : 5;
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const rx = r.width / 2;
    const ry = r.height / 2;
    for (let y = r.top; y < r.top + r.height; y += cell) {
      for (let x = r.left; x < r.left + r.width; x += cell) {
        const nx = (x - cx) / rx;
        const ny = (y - cy) / ry;
        if (nx * nx + ny * ny > 1 || Math.random() < 0.25) continue;
        const k = (y - r.top) / r.height;
        const c = Math.random() < 0.15 ? 0xffffff : color;
        this.spawn('square', x, y, {
          color: c, s0: cell, s1: cell * 0.2, a0: 0.95,
          vx: nx * rand(40, 160) + rand(40, 140), vy: rand(-160, -30), g: -40, drag: 0.6,
          max: rand(0.6, 1.1), delay: k * 0.45 + rand(0, 0.08),
        });
      }
    }
    for (let i = 0; i < 30; i++) {
      const a = rand(0, Math.PI * 2);
      this.spawn('glow', cx, cy, { color, vx: Math.cos(a) * rand(100, 380), vy: Math.sin(a) * rand(100, 380), drag: 2.5, s0: rand(14, 30), s1: 2, max: rand(0.4, 0.8) });
    }
    this.flash(color, 0.12);
  }

  /** Розыгрыш карты: карта рассыпается в пиксели, которые летят к цели. */
  cardDissolve(r: Rect, color: number, to?: { x: number; y: number }): void {
    if (isReducedMotion()) return;
    const cell = r.width > 130 ? 9 : 7;
    const tx = to?.x ?? r.left + r.width / 2;
    const ty = to?.y ?? r.top - 120;
    for (let y = r.top; y < r.top + r.height; y += cell) {
      for (let x = r.left; x < r.left + r.width; x += cell) {
        if (Math.random() < 0.35) continue;
        const dx = tx - x;
        const dy = ty - y;
        const t = rand(0.35, 0.6);
        this.spawn(Math.random() < 0.3 ? 'glow' : 'square', x, y, {
          color: Math.random() < 0.2 ? 0xffffff : color, s0: cell * (Math.random() < 0.3 ? 2.2 : 0.9), s1: 1.5, a0: 0.9,
          vx: dx / t + rand(-60, 60), vy: dy / t + rand(-60, 60), drag: 0.8, max: t, delay: rand(0, 0.12),
        });
      }
    }
  }

  flash(color: number, alpha: number): void {
    if (!this.app || !this.flashG || isReducedMotion()) return;
    const { width, height } = this.app.screen;
    this.flashG.clear().rect(0, 0, width, height).fill({ color });
    this.flashAlpha = Math.max(this.flashAlpha, alpha);
    this.flashG.alpha = this.flashAlpha;
    this.wake();
  }

  spark(x: number, y: number, color: number): void {
    if (isReducedMotion()) return;
    for (let i = 0; i < 14; i++) {
      const a = rand(0, Math.PI * 2);
      this.spawn('glow', x, y, { color, vx: Math.cos(a) * rand(60, 200), vy: Math.sin(a) * rand(60, 200), drag: 3, s0: rand(8, 16), s1: 2, max: rand(0.3, 0.6) });
    }
    this.wake();
  }
}

export const fx = new FxEngine();
