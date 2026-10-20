import { useMemo } from 'react';
import type { MapNodeKind, RunState } from '../game/engine';
import { useGame } from '../game/store';
import { TopBar } from '../components/TopBar';
import { Icon } from '../components/Icon';
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

const RISK_KINDS: MapNodeKind[] = ['elite', 'ambush', 'blackbox'];

function Marks({ kind }: { kind: MapNodeKind }) {
  const marks = NODE_REWARD_MARKS[kind] ?? [];
  if (marks.length === 0) return null;
  return (
    <span className="mm-marks">
      {marks.map((m) => (
        <span key={m} className="mm-mark" data-testid="node-mark" title={`Награда: ${MARK_NAME[m] ?? m}`}>
          <Icon name={m} size={14} strokeWidth={2.2} />
          <span>{MARK_NAME[m] ?? m}</span>
        </span>
      ))}
    </span>
  );
}

export function MapScreen({ run }: { run: RunState }) {
  const dispatch = useGame((s) => s.dispatch);

  const nodes = useMemo(() => run.map.filter((n) => n.act === run.act), [run.map, run.act]);
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const available = useMemo(() => {
    if (run.screen.kind !== 'map') return new Set<string>();
    if (!run.currentNodeId || !byId.has(run.currentNodeId)) return new Set(nodes.filter((n) => n.row === 0).map((n) => n.id));
    return new Set(byId.get(run.currentNodeId)?.next ?? []);
  }, [run.currentNodeId, run.screen.kind, nodes, byId]);

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

  const availList = nodes.filter((n) => available.has(n.id));
  const current = run.currentNodeId ? byId.get(run.currentNodeId) : undefined;
  const steps = nodes.length ? Math.max(...nodes.map((n) => n.row)) + 1 : 0;
  const done = run.visited.filter((id) => byId.has(id));
  const stepNo = Math.min(done.length + (available.size > 0 ? 1 : 0), steps);

  // Силуэты следующих шагов: типы узлов за ближайшими доступными, без конкретных узлов
  const ahead = useMemo(() => {
    const out: MapNodeKind[][] = [];
    let level = [...available];
    for (let i = 0; i < 3; i++) {
      const next = new Set<string>();
      for (const id of level) for (const nx of byId.get(id)?.next ?? []) next.add(nx);
      if (next.size === 0) break;
      const kinds = new Set<MapNodeKind>();
      for (const id of next) {
        const n = byId.get(id);
        if (n) kinds.add(n.kind);
      }
      out.push([...kinds]);
      level = [...next];
    }
    return out;
  }, [available, byId]);

  const choose = (id: string) => {
    if (!available.has(id)) return;
    sfx('select');
    dispatch({ type: 'choose_node', nodeId: id });
  };

  return (
    <div className="screen map-screen" data-testid="map" data-act={run.act}>
      <TopBar run={run} />
      <div className="mm">
        <div className="mm-head">
          <div>
            <div className="eyebrow">Акт {run.act}</div>
            <h1 className="map-title">{ACT_NAMES[run.act] ?? 'Сеть'}</h1>
          </div>
          <div className="mm-progress" aria-label={`Шаг ${stepNo} из ${steps}`}>
            <span>
              Шаг {stepNo} из {steps}
            </span>
            <span className="mm-bar">
              <i style={{ width: `${steps ? (stepNo / steps) * 100 : 0}%` }} />
            </span>
          </div>
        </div>
        {available.size > 0 ? (
          <p className="screen-hint screen-hint--map" data-testid="screen-hint">
            Выбери следующий узел. Награды и риск указаны на карточках, значки — в легенде.
          </p>
        ) : null}
        {run.eventResult ? (
          <p className="map-result" data-testid="map-result" role="status">
            {run.eventResult}
          </p>
        ) : null}
        {current ? (
          <div className={`mm-here kind-${current.kind}`} data-testid="map-node" data-kind={current.kind} data-state="current">
            <Icon name={current.kind} size={18} />
            <span>
              Ты здесь: <b>{NODE_LABEL[current.kind].name}</b>
            </span>
          </div>
        ) : null}
        <div className="mm-grid" role="group" aria-label="Доступные узлы">
          {availList.map((n) => {
            const label = NODE_LABEL[n.kind];
            const safe = safePath.has(n.id);
            const risk = RISK_KINDS.includes(n.kind);
            return (
              <button
                key={n.id}
                type="button"
                className={`mm-card kind-${n.kind}${safe ? ' is-safe' : ''}${risk ? ' is-risk' : ''}`}
                data-testid="map-node"
                data-kind={n.kind}
                data-state="available"
                data-safe={safe ? 'true' : undefined}
                aria-label={`${label.name}. ${label.text}${safe ? ' Рекомендуем.' : ''}${risk ? ' Риск.' : ''}`}
                onClick={() => choose(n.id)}
              >
                <span className="mm-hit" data-testid="map-node-hit" aria-hidden="true" />
                <span className="mm-card__icon">
                  <Icon name={n.kind} size={30} />
                </span>
                <span className="mm-card__body">
                  <span className="mm-card__top">
                    <b className="mm-card__name">{label.name}</b>
                    {safe ? <span className="mm-badge mm-badge--safe">Рекомендуем</span> : null}
                    {risk ? <span className="mm-badge mm-badge--risk">Риск</span> : null}
                  </span>
                  <span className="mm-card__text">{label.text}</span>
                  <Marks kind={n.kind} />
                </span>
              </button>
            );
          })}
        </div>
        <details className="mm-fold">
          <summary>Маршрут</summary>
          <div className="mm-route">
            <ol className="mm-done">
              {done.length === 0 ? <li className="muted small">Пока ни одного шага.</li> : null}
              {done.map((id, i) => {
                const n = byId.get(id)!;
                return (
                  <li key={id} className={`kind-${n.kind}`}>
                    <Icon name={n.kind} size={16} />
                    <span>
                      {i + 1}. {NODE_LABEL[n.kind].name}
                    </span>
                  </li>
                );
              })}
            </ol>
            {ahead.length > 0 ? (
              <ol className="mm-ahead" aria-label="Что дальше">
                {ahead.map((kinds, i) => (
                  <li key={i}>
                    <span className="muted small">Дальше {i + 1}:</span>
                    {kinds.map((k) => (
                      <span key={k} className={`mm-sil kind-${k}`} title={NODE_LABEL[k].name}>
                        <Icon name={k} size={16} />
                      </span>
                    ))}
                  </li>
                ))}
              </ol>
            ) : null}
          </div>
        </details>
        <details className="mm-fold map-legend">
          <summary>Легенда</summary>
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
          <p className="muted small">Значки наград на карточках: карты, имплант, расходник, кредиты. «Рекомендуем» — узел безопасного пути, «Риск» — элита, засада или чёрный ящик.</p>
        </details>
      </div>
    </div>
  );
}
