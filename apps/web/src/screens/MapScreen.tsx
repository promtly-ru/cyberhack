import { useEffect, useMemo, useRef, useState } from 'react';
import type { MapNode, MapNodeKind, RunState } from '../game/engine';
import { useGame } from '../game/store';
import { TopBar } from '../components/TopBar';
import { Icon } from '../components/Icon';
import { tip } from '../components/Tooltip';
import { hash } from '../ui/rand';
import { ACT_NAMES } from '../ui/uiStore';
import { sfx } from '../audio/sfx';

export const NODE_LABEL: Record<MapNodeKind, { name: string; text: string }> = {
  combat: { name: 'Сервер', text: 'Обычный бой. Даёт: кредиты, выбор карты, иногда расходник.' },
  elite: { name: 'Элитная защита', text: 'Опасный бой. Даёт: имплант, редкие карты, расходник.' },
  event: { name: 'Неизвестный сигнал', text: 'Событие с выбором и риском. Исход бывает разным.' },
  shop: { name: 'Чёрный рынок', text: 'Карты, импланты, расходники, улучшение и удаление карт.' },
  rest: { name: 'Безопасный узел', text: 'Лечение или улучшение карты.' },
  treasure: { name: 'Тайник данных', text: 'Сундук с имплантом.' },
  boss: { name: 'Ядро системы', text: 'Финальный страж акта.' },
  lab: { name: 'Лаборатория', text: 'Улучшить карту (1 из 3) или трансформировать в другую редкость.' },
  blackbox: { name: 'Чёрный ящик', text: 'Риск за награду: потеряй HP и получи имплант. Взлом может выйти бесплатно.' },
  relay: { name: 'Ретранслятор', text: 'Бесплатно: небольшое лечение и расходник.' },
  ambush: { name: 'Охотничья засада', text: 'Сложный бой. Даёт: больше кредитов, карты как с элиты, расходник.' },
};

/** Метки ожидаемой награды на узле (без спойлера конкретных предметов) */
export const NODE_REWARD_MARKS: Partial<Record<MapNodeKind, string[]>> = {
  combat: ['deck'],
  elite: ['crown', 'deck'],
  ambush: ['deck', 'potion', 'gold'],
  treasure: ['crown'],
  relay: ['potion'],
  blackbox: ['crown'],
};
const MARK_NAME: Record<string, string> = { deck: 'карты', crown: 'имплант', potion: 'расходник', gold: 'кредиты' };

const ROW_H = 84;
const PAD_TOP = 110;
const PAD_BOTTOM = 70;
const VIEW_W = 420;
/** Радиус зоны тапа в единицах viewBox: при ширине карты ~326 px (экран 360) это ≈ 47 px в диаметре */
const HIT_R = 30;

function nodePos(n: MapNode) {
  if (n.kind === 'boss') return { x: VIEW_W / 2, y: PAD_TOP - 30 };
  const h = hash(n.id);
  const jx = ((h % 1000) / 1000 - 0.5) * 22;
  const jy = (((h >>> 10) % 1000) / 1000 - 0.5) * 18;
  const x = 36 + (n.col / 6) * (VIEW_W - 72) + jx;
  const y = PAD_TOP + (15 - n.row) * ROW_H + jy;
  return { x, y };
}

export function MapScreen({ run }: { run: RunState }) {
  const dispatch = useGame((s) => s.dispatch);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [legendOpen, setLegendOpen] = useState(false);

  const nodes = useMemo(() => run.map.filter((n) => n.act === run.act), [run.map, run.act]);
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const pos = useMemo(() => new Map(nodes.map((n) => [n.id, nodePos(n)])), [nodes]);
  const visited = useMemo(() => new Set(run.visited), [run.visited]);
  const available = useMemo(() => {
    if (run.screen.kind !== 'map') return new Set<string>();
    if (!run.currentNodeId || !byId.has(run.currentNodeId)) return new Set(nodes.filter((n) => n.row === 0).map((n) => n.id));
    return new Set(byId.get(run.currentNodeId)?.next ?? []);
  }, [run.currentNodeId, run.screen.kind, nodes, byId]);

  const height = PAD_TOP + 15 * ROW_H + PAD_BOTTOM;

  // Рекомендуемый безопасный путь: от текущей позиции вперёд, избегая элит и засад
  const safePath = useMemo(() => {
    const out = new Set<string>();
    const cost = (k: MapNodeKind) => (k === 'elite' ? 4 : k === 'ambush' ? 3 : k === 'blackbox' ? 1.5 : k === 'combat' ? 1 : k === 'rest' || k === 'relay' ? -1 : 0);
    const memo = new Map<string, number>();
    const best = (id: string): number => {
      const m = memo.get(id);
      if (m !== undefined) return m;
      const n = byId.get(id);
      if (!n) return 0;
      const v = cost(n.kind) + (n.next.length ? Math.min(...n.next.map(best)) : 0);
      memo.set(id, v);
      return v;
    };
    const starts = available.size > 0 ? [...available] : [];
    if (starts.length === 0) return out;
    const first = starts.reduce((a, b) => (best(b) < best(a) ? b : a));
    let id: string | undefined = first;
    while (id) {
      out.add(id);
      const n = byId.get(id);
      id = n && n.next.length ? n.next.reduce((a, b) => (best(b) < best(a) ? b : a)) : undefined;
    }
    return out;
  }, [available, byId]);

  // Скролл к текущему узлу
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const cur = run.currentNodeId ? pos.get(run.currentNodeId) : undefined;
    const svg = el.querySelector('svg');
    if (!svg) return;
    const scale = svg.getBoundingClientRect().height / height;
    const targetY = cur ? cur.y : height - PAD_BOTTOM;
    el.scrollTop = Math.max(0, targetY * scale - el.clientHeight * 0.62);
  }, [run.currentNodeId, pos, height]);

  const choose = (id: string) => {
    if (!available.has(id)) return;
    sfx('select');
    dispatch({ type: 'choose_node', nodeId: id });
  };

  const edges: { from: MapNode; to: MapNode; state: 'visited' | 'open' | 'idle' }[] = [];
  for (const n of nodes) {
    for (const nx of n.next) {
      const to = byId.get(nx);
      if (!to) continue;
      const vIdx = run.visited.indexOf(n.id);
      const isVisited = vIdx >= 0 && run.visited[vIdx + 1] === nx;
      const isOpen = n.id === run.currentNodeId && available.has(nx);
      edges.push({ from: n, to, state: isVisited ? 'visited' : isOpen ? 'open' : 'idle' });
    }
  }

  return (
    <div className="screen map-screen" data-testid="map" data-act={run.act}>
      <TopBar run={run} />
      <div className="map-head">
        <div>
          <div className="eyebrow">Акт {run.act}</div>
          <h1 className="map-title">{ACT_NAMES[run.act] ?? 'Сеть'}</h1>
        </div>
        <button className="btn btn--ghost btn--sm legend-toggle" onClick={() => setLegendOpen((v) => !v)} aria-expanded={legendOpen}>
          Легенда
        </button>
        {available.size > 0 ? (
          <p className="screen-hint screen-hint--map" data-testid="screen-hint">
            Выбери следующий узел — пульсирующие доступны. Что значат значки — в легенде.
          </p>
        ) : null}
        {run.eventResult ? (
          <p className="map-result" data-testid="map-result" role="status">
            {run.eventResult}
          </p>
        ) : null}
      </div>
      <div className="map-body">
        <div className="map-scroll" ref={scrollRef}>
          <svg className="map-svg" viewBox={`0 0 ${VIEW_W} ${height}`} role="group" aria-label="Карта сети">
            <defs>
              <linearGradient id="map-fade" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#ff2bd6" stopOpacity=".18" />
                <stop offset=".25" stopColor="#ff2bd6" stopOpacity="0" />
              </linearGradient>
            </defs>
            <rect x="0" y="0" width={VIEW_W} height={height} fill="url(#map-fade)" />
            {/* Сетка-подложка */}
            {Array.from({ length: 17 }, (_, i) => (
              <line key={i} x1="0" x2={VIEW_W} y1={PAD_TOP + i * ROW_H - ROW_H / 2} y2={PAD_TOP + i * ROW_H - ROW_H / 2} className="map-gridline" />
            ))}
            {edges.map(({ from, to, state }) => {
              const a = pos.get(from.id)!;
              const b = pos.get(to.id)!;
              const rec = state !== 'visited' && safePath.has(to.id) && (safePath.has(from.id) || from.id === run.currentNodeId);
              return <line key={`${from.id}>${to.id}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={`map-edge is-${state}${rec ? ' is-safe' : ''}`} />;
            })}
            {/* Доступные узлы рисуем последними, чтобы их зона тапа была поверх соседей */}
            {[...nodes].sort((a, b) => Number(available.has(a.id)) - Number(available.has(b.id))).map((n) => {
              const p = pos.get(n.id)!;
              const isAvail = available.has(n.id);
              const isVisited = visited.has(n.id);
              const isCurrent = n.id === run.currentNodeId;
              const label = NODE_LABEL[n.kind];
              const r = n.kind === 'boss' ? 38 : n.kind === 'elite' ? 21 : 18;
              const state = isCurrent ? 'current' : isAvail ? 'available' : isVisited ? 'visited' : 'locked';
              return (
                <g
                  key={n.id}
                  className={`map-node kind-${n.kind} is-${state}`}
                  transform={`translate(${p.x} ${p.y})`}
                  role={isAvail ? 'button' : undefined}
                  data-testid="map-node"
                  data-kind={n.kind}
                  data-state={state}
                  tabIndex={isAvail ? 0 : -1}
                  aria-label={`${label.name}${isAvail ? ' — доступен' : isVisited ? ' — пройден' : ''}`}
                  onClick={() => choose(n.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      choose(n.id);
                    }
                  }}
                  {...tip(label.name, label.text)}
                  data-safe={safePath.has(n.id) && !isVisited ? 'true' : undefined}
                >
                  {/* Невидимая зона тапа: на 360 px узел ~29 px, а нужно ≥ 44 px */}
                  {isAvail ? <circle r={Math.max(r + 10, HIT_R)} className="map-node__hit" data-testid="map-node-hit" /> : null}
                  {isAvail ? <circle r={r + 9} className="map-node__pulse" /> : null}
                  <circle r={r + 4} className="map-node__halo" />
                  <circle r={r} className="map-node__bg" />
                  <g transform={`translate(${-r * 0.62} ${-r * 0.62}) scale(${(r * 1.24) / 24})`}>
                    <Icon name={n.kind} size={24} strokeWidth={n.kind === 'boss' ? 1.4 : 1.9} />
                  </g>
                  {!isVisited
                    ? (NODE_REWARD_MARKS[n.kind] ?? []).map((m, mi, arr) => (
                        <g key={m} className="map-node__mark" data-testid="node-mark" transform={`translate(${(mi - (arr.length - 1) / 2) * 13 - 5.5} ${r + 3})`}>
                          <title>{`Награда: ${MARK_NAME[m] ?? m}`}</title>
                          <rect x="-1" y="-1" width="13" height="13" rx="3" className="map-node__mark-bg" />
                          <g transform="scale(0.4167)">
                            <Icon name={m} size={24} strokeWidth={2.4} />
                          </g>
                        </g>
                      ))
                    : null}
                  {isVisited && !isCurrent ? <path d={`M${r * 0.35} ${-r * 0.95}l4 4 7-8`} className="map-node__check" /> : null}
                </g>
              );
            })}
          </svg>
        </div>
        <aside className={`map-legend${legendOpen ? ' is-open' : ''}`} aria-label="Легенда карты">
          <h2 className="eyebrow">Легенда</h2>
          <ul>
            {(Object.keys(NODE_LABEL) as MapNodeKind[]).map((k) => (
              <li key={k} className={`kind-${k}`}>
                <span className="legend-icon">
                  <Icon name={k} size={20} />
                </span>
                <span>
                  <b>{NODE_LABEL[k].name}</b>
                  <small>{NODE_LABEL[k].text}</small>
                </span>
              </li>
            ))}
          </ul>
          <p className="muted small">Пульсирующие узлы доступны для перехода. Идти можно только по линиям вверх. Значки под узлом — ожидаемая награда (карты, имплант, расходник, кредиты). Зелёная пунктирная линия — рекомендуемый безопасный путь.</p>
        </aside>
      </div>
    </div>
  );
}
