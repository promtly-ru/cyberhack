import { useMemo } from 'react';
import type { CardInstance } from '../game/engine';
import { cardStats } from '../game/engine';
import { Card } from './Card';
import { Modal } from './Bits';

const TYPE_ORDER: Record<string, number> = { attack: 0, skill: 1, power: 2, status: 3, curse: 4 };

/** Просмотр стопки/колоды. sorted — не раскрывать порядок добора. */
export function CardGridModal({ title, cards, onClose, sorted = true, empty }: { title: string; cards: CardInstance[]; onClose: () => void; sorted?: boolean; empty?: string }) {
  const list = useMemo(() => {
    if (!sorted) return cards;
    return [...cards].sort((a, b) => {
      try {
        const da = cardStats(a.defId, a.upgraded);
        const db = cardStats(b.defId, b.upgraded);
        return (TYPE_ORDER[da.def.type] ?? 9) - (TYPE_ORDER[db.def.type] ?? 9) || da.name.localeCompare(db.name, 'ru');
      } catch {
        return 0;
      }
    });
  }, [cards, sorted]);
  return (
    <Modal title={`${title} · ${cards.length}`} onClose={onClose} wide>
      {list.length ? (
        <div className="card-grid">
          {list.map((c) => (
            <Card key={c.uid} defId={c.defId} upgraded={c.upgraded} />
          ))}
        </div>
      ) : (
        <p className="muted center">{empty ?? 'Пусто'}</p>
      )}
    </Modal>
  );
}
