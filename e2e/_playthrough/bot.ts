import type { Locator, Page, TestInfo } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

export const DIR = path.resolve(process.cwd(), 'e2e', '_playthrough');
export const SHOTS = path.join(DIR, 'shots');
export const RESULTS = path.join(DIR, 'results');

export interface Cfg {
  name: string;
  tutorial: boolean;
  cls: string;
  diff: 'easy' | 'normal' | 'hard';
  asc: number;
  daily: boolean;
  seed: string;
  rot: number;
}

const SCREENS = [
  'menu', 'class-select', 'map', 'combat', 'reward-screen', 'pick-screen', 'shop-screen', 'lab-screen',
  'blackbox-screen', 'relay-screen', 'rest-screen', 'event-screen', 'deck-select-screen', 'gameover', 'profile', 'howto',
];

export const ALL_CLASSES = ['netrunner', 'phreaker', 'ghost', 'samurai', 'engineer', 'biohacker', 'droneop', 'chrono'];

export function profileInit(): string {
  const maxAscension: Record<string, number> = {};
  for (const c of ALL_CLASSES) maxAscension[c] = 5;
  return JSON.stringify({ unlockedClasses: ALL_CLASSES, unlockedCards: [], unlockedRelics: [], maxAscension, achievements: [], totalRuns: 0, totalWins: 0 });
}

export class Bot {
  touch: boolean;
  fmt: string;
  log: string[] = [];
  issues: { sev: string; msg: string; screen?: string; shot?: string }[] = [];
  consoleErrors: string[] = [];
  timeline: string[] = [];
  overflowSeen = new Set<string>();
  seenScreens = new Set<string>();
  maxAct = 1;
  maxFloor = 0;
  lastHp = '';
  lastIntent = '';
  lastEnemies = '';
  clicksFailed = 0;
  fights: { act: number; floor: number; kind: string; enemies: string; turns: number; hpLost: number }[] = [];
  curFight: { act: number; floor: number; kind: string; enemies: string; turns: number; hp0: number } | null = null;
  lastNodeKind = 'combat';
  shopClicked = new Set<string>();
  outcome = 'unknown';

  constructor(public page: Page, public cfg: Cfg, info: TestInfo) {
    this.touch = !!info.project.use.hasTouch;
    this.fmt = info.project.name;
    page.on('console', (m) => {
      if (m.type() === 'error') this.consoleErrors.push(`console: ${m.text()}`.slice(0, 300));
    });
    page.on('pageerror', (e) => this.consoleErrors.push(`pageerror: ${e.message}`.slice(0, 300)));
  }

  note(s: string) {
    this.log.push(`[${this.cfg.name}] ${s}`);
  }
  issue(sev: string, msg: string, screen?: string, shot?: string) {
    if (this.issues.some((i) => i.msg === msg)) return;
    this.issues.push({ sev, msg, ...(screen ? { screen } : {}), ...(shot ? { shot } : {}) });
  }

  async tap(loc: Locator, what = ''): Promise<boolean> {
    try {
      await loc.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {});
      if (this.touch) await loc.tap({ timeout: 4000 });
      else await loc.click({ timeout: 4000 });
      return true;
    } catch (e) {
      this.clicksFailed++;
      this.note(`click failed ${what}: ${String((e as Error).message).split('\n')[0]}`);
      return false;
    }
  }

  async screenOf(): Promise<string> {
    return this.page.evaluate((list) => {
      for (const s of list) if (document.querySelector(`[data-testid="${s}"]`)) return s;
      return 'unknown';
    }, SCREENS);
  }

  async shot(name: string, force = false): Promise<string> {
    const f = path.join(SHOTS, `${name}.png`);
    if (!force && fs.existsSync(f)) return f;
    try {
      await this.page.screenshot({ path: f });
    } catch {
      /* ignore */
    }
    return f;
  }

  /** Поиск переполнений/обрезки/горизонтальной прокрутки */
  async checkLayout(screen: string) {
    const res = await this.page.evaluate(() => {
      const out: string[] = [];
      const vw = window.innerWidth;
      if (document.documentElement.scrollWidth > vw + 1) out.push(`h-scroll: scrollWidth ${document.documentElement.scrollWidth} > ${vw}`);
      const els = Array.from(document.body.querySelectorAll<HTMLElement>('*'));
      for (const el of els) {
        if (out.length > 12) break;
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        if (el.closest('svg') && el.tagName.toLowerCase() !== 'svg') continue;
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) continue;
        const id = `${el.tagName.toLowerCase()}.${(typeof el.className === 'string' ? el.className : '').split(' ').slice(0, 2).join('.')}`;
        const txt = (el.innerText || '').trim().slice(0, 40).replace(/\s+/g, ' ');
        const direct = Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent || '').trim().length > 0);
        if (direct && (cs.overflowX === 'hidden' || cs.overflowX === 'clip') && el.scrollWidth > el.clientWidth + 2)
          out.push(`clipped-x ${id} "${txt}" sw=${el.scrollWidth} cw=${el.clientWidth}`);
        if (direct && (cs.overflowY === 'hidden' || cs.overflowY === 'clip') && el.scrollHeight > el.clientHeight + 3 && cs.textOverflow !== 'ellipsis')
          out.push(`clipped-y ${id} "${txt}" sh=${el.scrollHeight} ch=${el.clientHeight}`);
        if (direct && (r.right > vw + 2 || r.left < -2) && !el.closest('.map-screen svg'))
          out.push(`offscreen-x ${id} "${txt}" l=${Math.round(r.left)} r=${Math.round(r.right)} vw=${vw}`);
        if (cs.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 2) out.push(`ellipsis ${id} "${txt}"`);
      }
      return out;
    });
    for (const r of res) {
      const key = `${screen}|${r.replace(/"[^"]*"/, '')}`;
      if (this.overflowSeen.has(key)) continue;
      this.overflowSeen.add(key);
      const shot = await this.shot(`${this.fmt}-${this.cfg.name}-${screen}-overflow${this.overflowSeen.size}`, true);
      this.issue('UX', `layout[${screen}] ${r}`, screen, shot);
    }
  }

  async onNewScreen(screen: string) {
    const key = `${this.fmt}-${screen}`;
    if (!this.seenScreens.has(screen)) {
      this.seenScreens.add(screen);
      await this.page.waitForTimeout(400);
      await this.shot(key);
      await this.shot(`${this.fmt}-${this.cfg.name}-${screen}`, true).catch(() => {});
    }
    await this.checkLayout(screen);
  }

  async stats() {
    return this.page.evaluate(() => {
      const t = (id: string) => (document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null)?.innerText.replace(/\s+/g, ' ').trim() ?? '';
      const aria = (id: string) => document.querySelector(`[data-testid="${id}"]`)?.getAttribute('aria-label') ?? '';
      return { hp: t('stat-hp'), gold: t('stat-gold'), floor: aria('stat-floor') };
    });
  }

  /** Главный цикл */
  async playRun(maxSteps = 2500): Promise<void> {
    let lastSig = '';
    let same = 0;
    let prevScreen = '';
    for (let step = 0; step < maxSteps; step++) {
      await this.page.waitForTimeout(40);
      const screen = await this.screenOf();
      if (screen !== prevScreen) {
        prevScreen = screen;
        await this.onNewScreen(screen);
      }
      const st = await this.stats();
      const fm = /Этаж (\d+), акт (\d+)/.exec(st.floor);
      if (fm) {
        this.maxFloor = Math.max(this.maxFloor, Number(fm[1]));
        this.maxAct = Math.max(this.maxAct, Number(fm[2]));
      }
      this.lastHp = st.hp;
      const sig = await this.page.evaluate(() => {
        const hand = Array.from(document.querySelectorAll('[data-testid="hand-card"]')).map((e) => e.getAttribute('data-uid')).join(',');
        const en = Array.from(document.querySelectorAll('[data-testid="enemy"]')).map((e) => e.getAttribute('data-hp')).join(',');
        const c = document.querySelector('[data-testid="combat"]')?.getAttribute('data-phase') ?? '';
        const t = (document.body.innerText || '').length;
        return `${hand}|${en}|${c}|${t}`;
      });
      const full = `${screen}|${st.hp}|${st.gold}|${st.floor}|${sig}`;
      if (full === lastSig) same++;
      else {
        same = 0;
        lastSig = full;
      }
      if (same === 6) await this.page.keyboard.press('Escape').catch(() => {});
      if (same >= 12) {
        const shot = await this.shot(`${this.fmt}-${this.cfg.name}-STUCK-${screen}`, true);
        this.issue('блокер', `ЗАВИС/тупик на экране ${screen} (${st.floor}, ${st.hp}) — бот не смог продвинуться`, screen, shot);
        this.outcome = `stuck@${screen} act${this.maxAct} floor${this.maxFloor}`;
        return;
      }
      if (await this.handleTutorial()) continue;
      switch (screen) {
        case 'menu':
        case 'class-select':
          this.outcome = `left-to-${screen}`;
          return;
        case 'gameover': {
          const victory = await this.page.evaluate(() => !!document.querySelector('.gameover.is-victory'));
          await this.page.waitForTimeout(600);
          await this.shot(`${this.fmt}-${this.cfg.name}-gameover`, true);
          this.outcome = victory
            ? `VICTORY act${this.maxAct} floor${this.maxFloor}`
            : `DEFEAT act${this.maxAct} floor${this.maxFloor} (${this.lastEnemies}; last intent: ${this.lastIntent}; hp ${this.lastHp})`;
          return;
        }
        case 'map':
          await this.doMap(st);
          break;
        case 'combat':
          await this.doCombat(st);
          break;
        case 'reward-screen':
          await this.doReward();
          break;
        case 'pick-screen':
          await this.doPick();
          break;
        case 'shop-screen':
          await this.doShop();
          break;
        case 'rest-screen':
          await this.doRest(st);
          break;
        case 'event-screen':
          await this.doEvent();
          break;
        case 'lab-screen':
        case 'blackbox-screen':
        case 'relay-screen':
          await this.doNode(screen);
          break;
        case 'deck-select-screen':
          await this.doDeckSelect();
          break;
        default:
          await this.page.waitForTimeout(300);
      }
    }
    this.outcome = `maxsteps act${this.maxAct} floor${this.maxFloor}`;
    this.issue('баг', `лимит шагов бота (${maxSteps}) исчерпан без финала`);
  }

  async handleTutorial(): Promise<boolean> {
    const p = this.page;
    for (const id of ['tutorial-continue', 'tutorial-next']) {
      const b = p.getByTestId(id);
      if ((await b.count()) && (await b.first().isVisible().catch(() => false))) {
        const stepId = await p.locator('[data-testid="tutorial"]').first().getAttribute('data-step').catch(() => '');
        if (!this.seenScreens.has(`tut-${stepId}`)) {
          this.seenScreens.add(`tut-${stepId}`);
          await this.shot(`${this.fmt}-tut-${stepId}`);
          await this.checkLayout(`tutorial-${stepId}`);
        }
        await this.tap(b.first(), id);
        return true;
      }
    }
    const stepEl = p.locator('[data-testid="tutorial"]');
    if (await stepEl.count()) {
      const stepId = await stepEl.first().getAttribute('data-step').catch(() => '');
      if (stepId === 'ping' || stepId === 'block') {
        const def = stepId === 'ping' ? 'nr_ping' : 'nr_firewall';
        const card = p.locator(`[data-testid="hand-card"][data-def="${def}"][data-playable="1"]`).first();
        if (await card.count()) {
          await this.playCard(card);
          return true;
        }
      }
      if (stepId === 'end-turn') {
        await this.tap(p.getByTestId('end-turn'), 'end-turn');
        await p.waitForTimeout(500);
        return true;
      }
    }
    return false;
  }

  async doMap(st: { hp: string }) {
    const p = this.page;
    const nodes = p.locator('[data-testid="map-node"][data-state="available"]');
    const n = await nodes.count();
    if (!n) {
      await p.waitForTimeout(300);
      return;
    }
    const kinds: string[] = [];
    for (let i = 0; i < n; i++) kinds.push((await nodes.nth(i).getAttribute('data-kind')) ?? '');
    const hm = /(\d+)\s*\/\s*(\d+)/.exec(st.hp);
    const frac = hm ? Number(hm[1]) / Number(hm[2]) : 1;
    const gm = /(\d+)/.exec(await p.getByTestId('stat-gold').innerText().catch(() => '0'));
    const gold = gm ? Number(gm[1]) : 0;
    const order = ['event', 'combat', 'shop', 'lab', 'relay', 'blackbox', 'rest', 'elite', 'combat'];
    let pick = -1;
    const find = (k: string) => kinds.findIndex((x) => x === k);
    if (find('boss') >= 0) pick = find('boss');
    else if (frac < 0.5 && find('rest') >= 0) pick = find('rest');
    else if (gold >= 120 && find('shop') >= 0) pick = find('shop');
    else if (frac < 0.5 && find('relay') >= 0) pick = find('relay');
    else {
      const off = (this.cfg.rot + this.maxFloor) % order.length;
      for (let k = 0; k < order.length && pick < 0; k++) {
        const want = order[(off + k) % order.length]!;
        if (want === 'elite' && frac < 0.7) continue;
        pick = find(want);
      }
      if (pick < 0) pick = 0;
    }
    this.lastNodeKind = kinds[pick] ?? '';
    this.timeline.push(`${this.maxAct}-${this.maxFloor}:${this.lastNodeKind}`);
    const node = nodes.nth(pick);
    const hit = node.locator('[data-testid="map-node-hit"]');
    await this.tap((await hit.count()) ? hit : node, `map-node ${this.lastNodeKind}`);
    await p.waitForTimeout(150);
  }

  async playCard(card: Locator): Promise<boolean> {
    const p = this.page;
    const uid = await card.getAttribute('data-uid');
    const targeted = (await card.getAttribute('data-targeted')) === '1';
    if (!(await this.tap(card, 'card'))) return false;
    await p.waitForTimeout(60);
    const same = p.locator(`[data-testid="hand-card"][data-uid="${uid}"]`);
    if ((await same.count()) === 0) return true;
    const pressed = (await same.first().getAttribute('aria-pressed')) === 'true';
    if (!pressed) return false;
    if (targeted) {
      const hits = p.locator('[data-testid="enemy-hit"]:not([disabled])');
      if (!(await hits.count())) await this.tap(same.first(), 'card-retap');
      else await this.tap(hits.first(), 'enemy-hit');
    } else await this.tap(same.first(), 'card-confirm');
    await p.waitForTimeout(80);
    return true;
  }

  async doCombat(st: { hp: string }) {
    const p = this.page;
    const combat = p.getByTestId('combat');
    const phase = await combat.getAttribute('data-phase').catch(() => null);
    if (phase !== 'player') {
      await p.waitForTimeout(150);
      return;
    }
    const hm = /(\d+)\s*\/\s*(\d+)/.exec(st.hp);
    const hp = hm ? Number(hm[1]) : 99;
    const maxHp = hm ? Number(hm[2]) : 99;
    if (!this.curFight) {
      const enemies = await p.locator('[data-testid="enemy"] .unit__name').allInnerTexts();
      this.lastEnemies = enemies.join('+');
      this.curFight = { act: this.maxAct, floor: this.maxFloor, kind: this.lastNodeKind, enemies: this.lastEnemies, turns: 0, hp0: hp };
    }
    this.curFight.turns++;
    const intents = await p.locator('[data-testid="enemy"]:not([data-dead]) [data-testid="intent"]').allInnerTexts();
    this.lastIntent = intents.map((t) => t.replace(/\s+/g, ' ').trim()).join(' | ').slice(0, 80);
    let incoming = 0;
    for (const t of intents) {
      const m = /(\d+)\s*[×x]\s*(\d+)/.exec(t);
      if (m) incoming += Number(m[1]) * Number(m[2]);
      else {
        const m2 = /(\d+)/.exec(t);
        if (m2) incoming += Number(m2[1]);
      }
    }
    if (hp / maxHp < 0.4 || (this.lastNodeKind === 'boss' && this.curFight.turns === 1)) await this.usePotion();
    const blockWanted = incoming >= 6 ? Math.ceil(incoming * 0.7) : 0;
    let blockPlayed = 0;
    for (let i = 0; i < 14; i++) {
      if ((await combat.count()) === 0 || (await combat.getAttribute('data-phase').catch(() => null)) !== 'player') break;
      const playable = p.locator('[data-testid="hand-card"][data-playable="1"]');
      const cnt = await playable.count();
      if (!cnt) break;
      let card: Locator | null = null;
      if (blockPlayed < blockWanted) {
        const bl = playable.and(p.locator('[data-block="1"]'));
        if (await bl.count()) {
          card = bl.first();
          blockPlayed += 5;
        }
      }
      if (!card) {
        const atk = playable.and(p.locator('[data-targeted="1"]'));
        card = (await atk.count()) ? atk.first() : playable.first();
      }
      const ok = await this.playCard(card);
      if (!ok) {
        const alt = playable.nth(Math.min(1, cnt - 1));
        if (!(await this.playCard(alt))) break;
      }
    }
    if ((await combat.count()) && (await combat.getAttribute('data-phase').catch(() => null)) === 'player') {
      await this.tap(p.getByTestId('end-turn'), 'end-turn');
      const t0 = Date.now();
      while (Date.now() - t0 < 20000) {
        await p.waitForTimeout(100);
        if ((await combat.count()) === 0) break;
        if ((await combat.getAttribute('data-phase').catch(() => null)) === 'player') break;
      }
      if (Date.now() - t0 >= 20000) this.issue('баг', 'ход врага не завершился за 20 с (фаза не вернулась к игроку)', 'combat');
    }
    if ((await combat.count()) === 0 || (await p.getByTestId('reward-screen').count()) || (await p.getByTestId('gameover').count())) {
      await this.closeFight();
    }
  }

  async closeFight() {
    if (!this.curFight) return;
    const st2 = await this.stats();
    const hm = /(\d+)\s*\//.exec(st2.hp);
    const hp1 = hm ? Number(hm[1]) : 0;
    const f = this.curFight;
    this.fights.push({ act: f.act, floor: f.floor, kind: f.kind, enemies: f.enemies, turns: f.turns, hpLost: f.hp0 - hp1 });
    this.curFight = null;
  }

  async usePotion() {
    const p = this.page;
    const slots = p.getByTestId('potion-slot');
    const n = await slots.count();
    for (let i = 0; i < n; i++) {
      const s = slots.nth(i);
      if (!(await s.count())) continue;
      if (!(await this.tap(s, 'potion-slot'))) continue;
      const use = p.getByTestId('potion-use');
      if ((await use.count()) && (await use.first().isEnabled().catch(() => false))) {
        await this.tap(use.first(), 'potion-use');
        await p.waitForTimeout(150);
        const hits = p.locator('[data-testid="enemy-hit"]:not([disabled])');
        if (await hits.count()) await this.tap(hits.first(), 'potion-target');
        return;
      }
      await p.keyboard.press('Escape');
    }
  }

  async doReward() {
    const p = this.page;
    if (this.curFight) await this.closeFight();
    const items = p.locator('[data-testid="reward-item"]:not([disabled])');
    if (await items.count()) {
      await this.tap(items.first(), 'reward-item');
      await p.waitForTimeout(150);
      return;
    }
    await this.tap(p.getByTestId('reward-leave'), 'reward-leave');
    await p.waitForTimeout(150);
  }

  async doPick() {
    const p = this.page;
    const cards = p.getByTestId('pick-card');
    const n = await cards.count();
    if (n === 0) return;
    if ((this.cfg.rot + this.maxFloor) % 5 === 4 && (await p.getByTestId('pick-skip').count())) {
      await this.tap(p.getByTestId('pick-skip'), 'pick-skip');
    } else await this.tap(cards.nth((this.cfg.rot + this.maxFloor) % n), 'pick-card');
    await p.waitForTimeout(150);
  }

  async doShop() {
    const p = this.page;
    const sels = ['.shop-service--up', '.shop-item', '.shop-relic', '.shop-potion', '.shop-service'];
    for (const s of sels) {
      const els = p.locator(`.shop-screen ${s}:not([disabled]):not(.is-sold)`);
      const n = await els.count();
      for (let i = 0; i < n; i++) {
        const e = els.nth(i);
        const label = ((await e.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').slice(0, 50);
        const key = `${this.maxFloor}:${label}`;
        if (this.shopClicked.has(key)) continue;
        this.shopClicked.add(key);
        const g0 = await p.getByTestId('stat-gold').innerText().catch(() => '');
        await this.tap(e, `shop ${label}`);
        await p.waitForTimeout(150);
        const g1 = await p.getByTestId('stat-gold').innerText().catch(() => '');
        if (g0 === g1 && (await p.getByTestId('shop-screen').count())) this.note(`shop: no gold change for "${label}"`);
        return;
      }
    }
    const leave = p.locator('.shop-screen .actions .btn--primary').last();
    await this.tap(leave, 'shop-leave');
    await p.waitForTimeout(150);
  }

  async doRest(st: { hp: string }) {
    const p = this.page;
    const hm = /(\d+)\s*\/\s*(\d+)/.exec(st.hp);
    const frac = hm ? Number(hm[1]) / Number(hm[2]) : 1;
    const up = p.locator('.choice--upgrade:not([disabled])');
    if (frac >= 0.7 && (await up.count())) await this.tap(up.first(), 'rest-upgrade');
    else await this.tap(p.locator('.choice--heal').first(), 'rest-heal');
    await p.waitForTimeout(150);
  }

  async doEvent() {
    const p = this.page;
    const opts = p.locator('.event-option:not([disabled])');
    const n = await opts.count();
    if (!n) {
      await p.waitForTimeout(200);
      return;
    }
    const total = await p.locator('.event-option').count();
    if (total > n) this.note(`event: ${total - n} disabled option(s)`);
    await this.tap(opts.nth((this.cfg.rot + this.maxFloor) % n), 'event-option');
    await p.waitForTimeout(150);
  }

  async doNode(screen: string) {
    const p = this.page;
    const order = screen === 'lab-screen' ? ['lab-upgrade', 'lab-transform'] : screen === 'blackbox-screen' ? ['blackbox-hack', 'blackbox-force'] : ['relay-take'];
    for (const id of order) {
      const b = p.getByTestId(id);
      if ((await b.count()) && (await b.isEnabled().catch(() => false))) {
        await this.tap(b, id);
        await p.waitForTimeout(150);
        return;
      }
    }
    await this.tap(p.getByTestId('leave-node'), 'leave-node');
    await p.waitForTimeout(150);
  }

  async doDeckSelect() {
    const p = this.page;
    const cards = p.locator('.select-card');
    const confirm = p.locator('.confirm-bar .actions .btn').last();
    if (await p.locator('.confirm-bar').count()) {
      await this.tap(confirm, 'deck-confirm');
    } else if (await cards.count()) {
      await this.tap(cards.nth((this.cfg.rot + this.maxFloor) % (await cards.count())), 'deck-card');
    } else {
      await this.tap(p.locator('.actions .btn--ghost').last(), 'deck-cancel');
    }
    await p.waitForTimeout(150);
  }

  save() {
    const out = {
      cfg: this.cfg,
      fmt: this.fmt,
      outcome: this.outcome,
      maxAct: this.maxAct,
      maxFloor: this.maxFloor,
      issues: this.issues,
      consoleErrors: this.consoleErrors,
      timeline: this.timeline,
      fights: this.fights,
      clicksFailed: this.clicksFailed,
      log: this.log.slice(-80),
    };
    fs.writeFileSync(path.join(RESULTS, `${this.fmt}-${this.cfg.name}.json`), JSON.stringify(out, null, 1));
  }
}
