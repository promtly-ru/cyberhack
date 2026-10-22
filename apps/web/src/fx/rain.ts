/**
 * «Цифровой дождь» на фоне — отдельный Pixi-канвас позади интерфейса.
 * Все глифы — частицы одного ParticleContainer с атласом символов; 30 FPS достаточно для фона.
 */
import { Application, Particle, ParticleContainer, Rectangle, Texture, type Ticker } from 'pixi.js';
import { isReducedMotion } from '../ui/settings';

const CHARS = '0123456789ABCDEF<>/\\|{}[]#$%&*+=:;01';
const GLYPH = 32; // пикселей на глиф в атласе

interface Column {
  x: number;
  head: number; // в ячейках
  speed: number; // ячеек в секунду
  len: number;
  parts: Particle[];
  hue: number;
  acc: number;
}

function buildAtlas(): Texture[] {
  const cv = document.createElement('canvas');
  cv.width = GLYPH * CHARS.length;
  cv.height = GLYPH;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `700 ${GLYPH * 0.72}px "JetBrains Mono Variable", "JetBrains Mono", ui-monospace, monospace`;
  for (let i = 0; i < CHARS.length; i++) g.fillText(CHARS[i]!, i * GLYPH + GLYPH / 2, GLYPH / 2 + 1);
  const base = Texture.from(cv);
  return Array.from({ length: CHARS.length }, (_, i) => new Texture({ source: base.source, frame: new Rectangle(i * GLYPH, 0, GLYPH, GLYPH) }));
}

class Rain {
  private app: Application | null = null;
  private pc: ParticleContainer | null = null;
  private frames: Texture[] = [];
  private cols: Column[] = [];
  private token = 0;
  private resizeTimer: ReturnType<typeof setTimeout> | undefined;
  private cell = 20;
  private rows = 40;

  async mount(host: HTMLElement): Promise<void> {
    const token = ++this.token;
    const app = new Application();
    try {
      await app.init({ backgroundAlpha: 0, resizeTo: window, antialias: false, autoDensity: true, resolution: window.innerWidth < 900 ? 1 : Math.min(window.devicePixelRatio || 1, 1.5), preference: 'webgl', eventMode: 'none', eventFeatures: { move: false, globalMove: false, click: false, wheel: false } });
    } catch (e) {
      console.warn('[rain] Pixi не инициализирован:', e);
      return;
    }
    if (token !== this.token) {
      app.destroy({ removeView: true }, { children: true });
      return;
    }
    this.app = app;
    app.renderer.events?.setTargetElement(null as unknown as HTMLElement); // снимаем слушатели событий Pixi совсем
    app.ticker.maxFPS = window.innerWidth < 900 ? 15 : 30;
    app.canvas.classList.add('rain-canvas');
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
    this.frames = buildAtlas();
    this.pc = new ParticleContainer({ dynamicProperties: { position: true, color: true, uvs: true, vertex: false, rotation: false } });
    app.stage.addChild(this.pc);
    this.build();
    app.ticker.add(this.tick);
    window.addEventListener('resize', this.onResize);
    this.applyMotion();
  }

  unmount(): void {
    this.token++;
    window.removeEventListener('resize', this.onResize);
    if (this.app) {
      this.app.ticker.remove(this.tick);
      this.app.destroy({ removeView: true }, { children: true });
    }
    this.app = null;
    this.pc = null;
    this.cols = [];
  }

  /** При reduced motion — один статичный кадр. */
  applyMotion(): void {
    const app = this.app;
    if (!app) return;
    if (isReducedMotion()) {
      app.ticker.stop();
      this.step(0);
      app.render();
    } else if (!app.ticker.started) app.ticker.start();
  }

  private onResize = () => {
    clearTimeout(this.resizeTimer);
    this.resizeTimer = setTimeout(() => {
      this.build();
      this.applyMotion();
    }, 200);
  };

  private build(): void {
    const app = this.app;
    const pc = this.pc;
    if (!app || !pc) return;
    pc.removeParticles();
    const w = window.innerWidth;
    const h = window.innerHeight;
    const cell = w < 600 ? 16 : 20;
    const scale = (cell * 0.9) / GLYPH;
    const rows = Math.ceil(h / cell);
    this.cols = [];
    const n = Math.ceil(w / cell);
    for (let c = 0; c < n; c++) {
      if (Math.random() < (w < 600 ? 0.75 : 0.35)) continue; // разреженный дождь (на телефоне ещё реже)
      const len = 6 + Math.floor(Math.random() * 18);
      const parts: Particle[] = [];
      for (let k = 0; k < len; k++) {
        const p = new Particle({ texture: this.frames[Math.floor(Math.random() * this.frames.length)]!, x: c * cell, y: -999, scaleX: scale, scaleY: scale, alpha: 0 });
        pc.addParticle(p);
        parts.push(p);
      }
      this.cols.push({ x: c * cell, head: Math.random() * (rows + len) - len, speed: 3 + Math.random() * 9, len, parts, hue: Math.random() < 0.12 ? 0xff2bd6 : 0x00f0ff, acc: 0 });
    }
    this.cell = cell;
    this.rows = rows;
  }

  private tick = (ticker: Ticker): void => this.step(Math.min(0.1, ticker.deltaMS / 1000));

  private step(dt: number): void {
    const { cell, rows } = this;
    for (const col of this.cols) {
      col.head += col.speed * dt;
      col.acc += dt;
      if (col.head - col.len > rows) {
        col.head = -Math.random() * 20;
        col.speed = 3 + Math.random() * 9;
      }
      const headRow = Math.floor(col.head);
      const swap = col.acc > 0.12;
      if (swap) col.acc = 0;
      for (let k = 0; k < col.parts.length; k++) {
        const p = col.parts[k]!;
        const row = headRow - k;
        p.y = row * cell;
        if (row < 0) {
          p.alpha = 0;
          continue;
        }
        const f = 1 - k / col.len;
        p.alpha = k === 0 ? 0.95 : 0.55 * f * f;
        p.tint = k === 0 ? 0xe6ffff : col.hue;
        if ((swap && Math.random() < 0.15) || k === 0) {
          if (Math.random() < 0.3) p.texture = this.frames[Math.floor(Math.random() * this.frames.length)]!;
        }
      }
    }
    this.pc?.update();
  }
}

export const rain = new Rain();
