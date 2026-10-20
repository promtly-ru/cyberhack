import { useState } from 'react';
import { Icon } from '../components/Icon';

const ISSUES_URL = 'https://github.com/promtly-ru/cyberhack/issues/new';
const KINDS = ['Идея', 'Баг', 'Баланс', 'Другое'] as const;

/** Обратная связь: идея уходит GitHub-issue с готовым текстом, бэкенд не нужен. */
export function FeedbackModal({ onClose }: { onClose: () => void }) {
  const [kind, setKind] = useState<(typeof KINDS)[number]>('Идея');
  const [text, setText] = useState('');
  const body = text.trim();
  const title = `[${kind}] ${body.split('\n')[0]?.slice(0, 70) ?? ''}`;
  const href = `${ISSUES_URL}?${new URLSearchParams({ title, body: `${body}\n\n— отправлено из игры` }).toString()}`;

  return (
    <div className="modal-backdrop" onClick={onClose} data-testid="feedback-modal">
      <div className="modal" role="dialog" aria-label="Обратная связь" onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <h2>Предложить идею</h2>
          <button className="btn" onClick={onClose} aria-label="Закрыть"><Icon name="close" size={16} /></button>
        </div>
        <div className="modal__body settings">
          <div className="feedback__kinds">
            {KINDS.map((k) => (
              <button key={k} className={`btn${k === kind ? ' btn--primary' : ''}`} onClick={() => setKind(k)}>{k}</button>
            ))}
          </div>
          <label className="field">
            Что улучшить или добавить?
            <textarea className="feedback__text" data-testid="feedback-text" rows={6} maxLength={1500} value={text} onChange={(e) => setText(e.target.value)} placeholder="Новый класс, карта, режим, правка баланса…" />
          </label>
          <a className="btn btn--primary" data-testid="feedback-send" href={body ? href : undefined} target="_blank" rel="noreferrer" aria-disabled={!body} onClick={() => body && setTimeout(onClose, 300)}>
            Отправить на GitHub
          </a>
          <small className="feedback__hint">Откроется страница GitHub с готовым текстом: останется нажать «Submit new issue». Нужен аккаунт GitHub.</small>
        </div>
      </div>
    </div>
  );
}
