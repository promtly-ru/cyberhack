/** Отладка одного забега: `tsx tools/debug-run.ts <seed> <class> <bot> [ascension]` — печатает итог и хвост действий. */
import { newRun, applyAction } from '../src/run';
import type { Action, ClassId, RunState } from '../src/types';
import { createBot, type BotKind } from './bots';

const [seed = 'x', cls = 'ghost', bot = 'expert', asc = '0'] = process.argv.slice(2);
let s: RunState = newRun({ seed, classId: cls as ClassId, ascension: Number(asc) });
const b = createBot(bot as BotKind, seed);
const tail: string[] = [];
let n = 0;
while (s.status === 'active' && n < 20000) {
  const a: Action = b.act(s);
  s = applyAction(s, a).state;
  n++;
  if (n > 19950) tail.push(`${JSON.stringify(a)} turn=${s.combat?.turn} hp=${s.hp} en=${s.combat?.enemies.map((e) => `${e.defId}:${e.hp}/${e.block}`).join(',')}`);
}
console.log(s.status, 'floor', s.floor, 'actions', n, 'screen', s.screen.kind, 'deck', s.deck.length);
console.log(tail.slice(-4).join('\n'));
console.log(JSON.stringify(s.deck.map((c) => c.uid + ':' + c.defId + (c.upgraded ? '+' : ''))), 'energy', s.combat?.energy, 'block', s.combat?.player.block, 'piles', s.combat?.hand.length, s.combat?.drawPile.length, s.combat?.discardPile.length, s.combat?.exhaustPile.length);
