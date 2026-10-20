/**
 * Симулятор забегов: `npm run sim -- --runs 1000 --bot expert --class all --ascension 0 --seed-prefix sim`
 * Детерминирован по сидам (`${prefix}-${i}`), параллелится по ядрам через worker_threads.
 * Отчёт — в консоль, полный JSON — в tools/out/.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads';
import { getContent } from '../src/content';
import { applyAction, newRun } from '../src/run';
import type { ClassId, RunState } from '../src/types';
import { createBot, type BotKind } from './bots';

const CLASSES: ClassId[] = ['netrunner', 'phreaker', 'ghost', 'samurai', 'engineer', 'biohacker', 'droneop', 'chrono', 'vabanker'];
const MAX_ACTIONS = 20000;

interface RunRecord {
  seed: string;
  cls: ClassId;
  win: boolean;
  floor: number;
  act: number;
  killer: string | null; // id энкаунтера или 'event'/'stuck'
  deck: string[]; // уникальные defId финальной колоды
  relics: string[];
  /** этаж, на котором карта/реликвия впервые появилась */
  got: Record<string, number>;
  offers: [string[], string | null][];
  fought: string[];
  actions: number;
}

interface Job {
  bot: BotKind;
  ascension: number;
  prefix: string;
  runs: { i: number; cls: ClassId }[];
}

function encounterIndex(): Map<string, string> {
  const m = new Map<string, string>();
  for (const e of getContent().data.encounters) m.set(e.enemies.join(','), e.id);
  return m;
}

export function runOne(bot: BotKind, cls: ClassId, ascension: number, seed: string, encIdx = encounterIndex()): RunRecord {
  let s: RunState = newRun({ seed, classId: cls, ascension });
  const b = createBot(bot, seed);
  const offers: [string[], string | null][] = [];
  const fought: string[] = [];
  let actions = 0;
  let current: string | null = null;
  const got: Record<string, number> = {};
  while (s.status === 'active' && actions < MAX_ACTIONS) {
    const a = b.act(s);
    if (a.type === 'pick_card' && s.screen.kind === 'card_pick') offers.push([s.screen.cardIds, a.cardId]);
    // магазин: купленная карта = взята, нераспроданные при уходе = предложены и не взяты
    if (s.screen.kind === 'shop') {
      const items = s.screen.items;
      if (a.type === 'shop_buy' && items[a.index]?.kind === 'card') offers.push([[items[a.index]!.id!], items[a.index]!.id!]);
      if (a.type === 'leave_shop') for (const it of items) if (it.kind === 'card' && !it.sold && it.id) offers.push([[it.id], null]);
    }
    const wasCombat = s.screen.kind === 'combat';
    s = applyAction(s, a).state;
    actions++;
    for (const c of s.deck) if (got[c.defId] === undefined) got[c.defId] = s.floor;
    for (const r of s.relics) if (got[r] === undefined) got[r] = s.floor;
    if (!wasCombat && s.screen.kind === 'combat' && s.combat) {
      current = encIdx.get(s.combat.enemies.map((e) => e.defId).join(',')) ?? 'unknown';
      fought.push(current);
    } else if (!wasCombat && s.status === 'lost') current = 'event';
    else if (wasCombat && s.screen.kind === 'combat' && !s.combat) current = null;
  }
  const lost = s.status === 'lost';
  return {
    seed,
    cls,
    win: s.status === 'won',
    floor: s.floor,
    act: s.act,
    killer: lost ? current : s.status === 'active' ? 'stuck' : null,
    deck: [...new Set(s.deck.map((c) => c.defId))],
    relics: s.relics,
    got,
    offers,
    fought,
    actions,
  };
}

function runJob(job: Job): RunRecord[] {
  const idx = encounterIndex();
  return job.runs.map(({ i, cls }) => runOne(job.bot, cls, job.ascension, `${job.prefix}-${cls}-${i}`, idx));
}

if (!isMainThread) {
  parentPort!.postMessage(runJob(workerData as Job));
} else if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  void main();
}

// ---------- CLI ----------

function arg(name: string, def: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? (process.argv[i + 1] as string) : def;
}

async function main(): Promise<void> {
  const runs = Number(arg('runs', '1000'));
  const bot = arg('bot', 'expert') as BotKind;
  const clsArg = arg('class', 'all');
  const ascension = Number(arg('ascension', '0'));
  const prefix = arg('seed-prefix', 'sim');
  const threads = Math.max(1, Number(arg('threads', String(Math.min(availableParallelism(), 16)))));
  const classes = clsArg === 'all' ? CLASSES : [clsArg as ClassId];
  const all = Array.from({ length: runs }, (_, i) => ({ i, cls: classes[i % classes.length] as ClassId }));

  const t0 = Date.now();
  let records: RunRecord[];
  if (threads === 1 || runs < 30) records = runJob({ bot, ascension, prefix, runs: all });
  else {
    const chunks: (typeof all)[] = Array.from({ length: threads }, () => []);
    all.forEach((r, k) => chunks[k % threads]!.push(r));
    const parts = await Promise.all(
      chunks
        .filter((c) => c.length > 0)
        .map(
          (c) =>
            new Promise<RunRecord[]>((res, rej) => {
              const w = new Worker(new URL(import.meta.url), {
                workerData: { bot, ascension, prefix, runs: c } satisfies Job,
                execArgv: ['--import', 'tsx'],
              });
              w.once('message', res);
              w.once('error', rej);
            }),
        ),
    );
    records = parts.flat();
  }
  const ms = Date.now() - t0;
  const report = buildReport(records, { runs, bot, classes, ascension, prefix, ms, threads });
  printReport(report);
  const outDir = join(dirname(fileURLToPath(import.meta.url)), 'out');
  mkdirSync(outDir, { recursive: true });
  const file = join(outDir, `sim-${bot}-${clsArg}-a${ascension}-${runs}.json`);
  writeFileSync(file, JSON.stringify(report, null, 2));
  console.log(`JSON: ${file}`);
}

// ---------- отчёт ----------

function pct(a: number, b: number): number {
  return b === 0 ? 0 : Math.round((1000 * a) / b) / 10;
}

function median(xs: number[]): number {
  const a = [...xs].sort((x, y) => x - y);
  return a.length === 0 ? 0 : (a[Math.floor(a.length / 2)] as number);
}

/**
 * Win rate delta без survivorship bias: F = медианный этаж получения предмета;
 * сравниваем только забеги, дожившие до F: получившие предмет к этажу F против не получивших.
 */
function acquisitionDelta(pool: RunRecord[], id: string, has: (r: RunRecord) => boolean) {
  const holders = pool.filter(has);
  const floors = holders.map((r) => r.got[id] ?? r.floor);
  const F = median(floors);
  const hasBy = (r: RunRecord): boolean => has(r) && (r.got[id] ?? 0) <= F;
  // «дожил до F» = получил предмет к F или прошёл дальше F (умершие ровно на F без предмета не считаются,
  // иначе награда за босса выглядит сверхсильной: проигравшие боссу попадают в «без»).
  const alive = pool.filter((r) => hasBy(r) || r.floor > F);
  const withX = alive.filter(hasBy);
  const without = alive.filter((r) => !hasBy(r));
  const wrWith = pct(withX.filter((r) => r.win).length, withX.length);
  const wrWithout = pct(without.filter((r) => r.win).length, without.length);
  return {
    decks: holders.length,
    medianFloorObtained: F,
    winRateWith: wrWith,
    winRateDelta: withX.length >= 20 && without.length >= 20 ? Math.round((wrWith - wrWithout) * 10) / 10 : null,
  };
}

export function buildReport(
  recs: RunRecord[],
  meta: { runs: number; bot: string; classes: string[]; ascension: number; prefix: string; ms: number; threads: number },
) {
  const content = getContent();
  const wins = recs.filter((r) => r.win).length;
  const byClass: Record<string, { runs: number; wins: number; winrate: number }> = {};
  for (const c of meta.classes) {
    const rs = recs.filter((r) => r.cls === c);
    const w = rs.filter((r) => r.win).length;
    byClass[c] = { runs: rs.length, wins: w, winrate: pct(w, rs.length) };
  }
  const deaths = recs.filter((r) => !r.win);
  const deathFloors = deaths.map((r) => r.floor);
  const byAct: Record<string, number> = { '1': 0, '2': 0, '3': 0 };
  for (const d of deaths) byAct[String(d.act)] = (byAct[String(d.act)] ?? 0) + 1;

  const foughtCnt = new Map<string, number>();
  for (const r of recs) for (const f of new Set(r.fought)) foughtCnt.set(f, (foughtCnt.get(f) ?? 0) + 1);
  const killCnt = new Map<string, number>();
  for (const d of deaths) if (d.killer) killCnt.set(d.killer, (killCnt.get(d.killer) ?? 0) + 1);
  const killers = [...killCnt.entries()]
    .map(([id, n]) => ({
      id,
      deaths: n,
      shareOfRuns: pct(n, recs.length),
      deathRateWhenFought: pct(n, foughtCnt.get(id) ?? 0),
      fought: foughtCnt.get(id) ?? 0,
    }))
    .sort((a, b) => b.deaths - a.deaths);

  const act1Normal = content.data.encounters
    .filter((e) => e.act === 1 && e.tier === 'normal')
    .map((e) => ({
      id: e.id,
      fought: foughtCnt.get(e.id) ?? 0,
      deaths: killCnt.get(e.id) ?? 0,
      deathRateWhenFought: pct(killCnt.get(e.id) ?? 0, foughtCnt.get(e.id) ?? 0),
      killsShareOfRuns: pct(killCnt.get(e.id) ?? 0, recs.length),
    }));

  // карты: pick rate среди предложенных + win rate delta (в рамках класса карты)
  const cards = content.data.cards
    .filter((c) => c.rarity !== 'starter' && c.rarity !== 'special' && c.type !== 'curse' && c.type !== 'status')
    .map((c) => {
      const pool = c.classId === 'neutral' ? recs : recs.filter((r) => r.cls === c.classId);
      let offered = 0;
      let picked = 0;
      for (const r of pool)
        for (const [ids, p] of r.offers)
          if (ids.includes(c.id)) {
            offered++;
            if (p === c.id) picked++;
          }
      const d = acquisitionDelta(pool, c.id, (r) => r.deck.includes(c.id));
      return { id: c.id, classId: c.classId, rarity: c.rarity, offered, pickRate: pct(picked, offered), ...d };
    })
    .sort((a, b) => (b.winRateDelta ?? -99) - (a.winRateDelta ?? -99));

  const relics = content.data.relics
    .filter((r) => r.rarity !== 'starter')
    .map((r) => {
      const withR = recs.filter((x) => x.relics.includes(r.id));
      // Классовые реликвии сравниваются внутри своего класса (как карты), иначе дельта несёт силу класса.
      const pool = r.classId === 'neutral' ? recs : recs.filter((x) => x.cls === r.classId);
      const d = acquisitionDelta(pool, r.id, (x) => x.relics.includes(r.id));
      return { id: r.id, rarity: r.rarity, takeRate: pct(withR.length, recs.length), ...d };
    })
    .sort((a, b) => (b.winRateDelta ?? -99) - (a.winRateDelta ?? -99));

  return {
    meta: { ...meta, seconds: Math.round(meta.ms / 100) / 10 },
    winrate: pct(wins, recs.length),
    byClass,
    deathFloor: {
      mean: Math.round((10 * deathFloors.reduce((a, b) => a + b, 0)) / Math.max(1, deathFloors.length)) / 10,
      median: median(deathFloors),
    },
    deathsByAct: byAct,
    stuck: recs.filter((r) => r.killer === 'stuck').length,
    stuckSeeds: recs.filter((r) => r.killer === 'stuck').map((r) => r.seed),
    topKillers: killers.slice(0, 10),
    act1Normal,
    avgActions: Math.round(recs.reduce((a, r) => a + r.actions, 0) / Math.max(1, recs.length)),
    cards,
    relics,
  };
}

function printReport(r: ReturnType<typeof buildReport>): void {
  const m = r.meta;
  console.log(`\n== ${m.bot} A${m.ascension} runs=${m.runs} (${m.seconds}s, ${m.threads} thr) ==`);
  console.log(`Winrate: ${r.winrate}%  | ` + Object.entries(r.byClass).map(([k, v]) => `${k} ${v.winrate}%`).join('  '));
  console.log(`Death floor mean ${r.deathFloor.mean} median ${r.deathFloor.median} | by act ${JSON.stringify(r.deathsByAct)} | stuck ${r.stuck} | avg actions ${r.avgActions}`);
  console.log('Top killers: ' + r.topKillers.map((k) => `${k.id} ${k.deaths} (${k.deathRateWhenFought}%)`).join(', '));
  console.log('Act1 normal death%: ' + r.act1Normal.map((k) => `${k.id} ${k.deathRateWhenFought}`).join(', '));
  const cardsWithDelta = r.cards.filter((c) => c.winRateDelta !== null);
  const fmt = (c: (typeof r.cards)[number]): string => `${c.id} ${c.winRateDelta}/${c.pickRate}%`;
  console.log('Cards top delta/pick: ' + cardsWithDelta.slice(0, 6).map(fmt).join(', '));
  console.log('Cards low pick: ' + [...r.cards].sort((a, b) => a.pickRate - b.pickRate).slice(0, 8).map((c) => `${c.id} ${c.pickRate}%`).join(', '));
  console.log('Relics top delta: ' + r.relics.filter((x) => x.winRateDelta !== null).slice(0, 5).map((x) => `${x.id} ${x.winRateDelta}`).join(', '));
}
