import type { CardInstance, RunState } from './types';

export function nextUid(s: RunState, prefix: string): string {
  s.uidCounter += 1;
  return `${prefix}${s.uidCounter}`;
}

export function makeCard(s: RunState, defId: string, upgraded = false): CardInstance {
  return { uid: nextUid(s, 'c'), defId, upgraded };
}
