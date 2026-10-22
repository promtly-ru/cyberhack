import { useMemo, useState } from 'react';
import type { FirmwareDef, FirmwareType, Rarity } from '../../ui-adapter/contract';
import { canUpgrade, copiesForNext, firmwareEffectText, firmwareStateOf, isFirmwareUnlocked, listFirmwares, upgradeFirmware, useContractVersion } from '../../ui-adapter/contract';
import { useOverlays } from '../../ui-adapter/overlays';
import { Modal } from '../Bits';
import { Icon } from '../Icon';
import { CopiesBar, FirmwareCard } from './FirmwareCard';
import { RARITY_NAME, RARITY_ORDER, TYPE_ICON, TYPE_NAME, TYPE_ORDER, unlockHint } from './labels';

type SortKey = 'rarity' | 'level' | 'name' | 'ready';
const SORT_NAME: Record<SortKey, string> = { rarity: 'По редкости', level: 'По уровню', name: 'По названию', ready: 'Готовые к улучшению' };

function FirmwareDetail({ def, onBack }: { def: FirmwareDef; onBack: () => void }) {
  useContractVersion();
  const st = firmwareStateOf(def.id);
  const locked = !isFirmwareUnlocked(def.id);
  const ready = canUpgrade(def.id);
  const need = copiesForNext(def, st);
  return (
    <div className="fw-detail" data-testid="firmware-detail">
      <button type="button" className="btn btn--ghost fw-back" onClick={onBack}>
        <Icon name="back" size={18} /> К списку
      </button>
      <div className="fw-detail__grid">
        <FirmwareCard def={def} st={st} locked={locked} />
        <div className="fw-detail__info">
          <h3>{def.name}</h3>
          <p className="muted">
            {RARITY_NAME[def.rarity]} · {TYPE_NAME[def.type]}
          </p>
          <p>{def.desc}</p>
          {locked ? (
            <p className="fw-hint">
              <Icon name="lock" size={16} /> {unlockHint(def)}
            </p>
          ) : null}
          <ol className="fw-levels">
            {def.levels.map((_, i) => (
              <li key={i} className={st.level === i + 1 ? 'is-current' : st.level > i ? 'is-done' : undefined}>
                <b>Ур. {i + 1}</b> {firmwareEffectText(def, i + 1)}
              </li>
            ))}
          </ol>
          {!locked && st.level > 0 ? (
            <>
              <CopiesBar def={def} st={st} />
              <button type="button" className="btn btn--primary fw-upgrade" disabled={!ready} onClick={() => upgradeFirmware(def.id)} data-testid="firmware-upgrade">
                <Icon name="upgrade" size={18} />
                {need === null ? 'Максимальный уровень' : ready ? `Улучшить до ур. ${st.level + 1}` : `Нужно копий: ${need - st.copies}`}
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Окно «Прошивки»: сетка, фильтры, сортировка, детальный просмотр, улучшение. */
export function FirmwareModal() {
  const mode = useOverlays((s) => s.firmware);
  const close = () => useOverlays.getState().openFirmware(null);
  const ver = useContractVersion();
  const [type, setType] = useState<FirmwareType | 'all'>('all');
  const [rarity, setRarity] = useState<Rarity | 'all'>('all');
  const [sort, setSort] = useState<SortKey>('rarity');
  const [detail, setDetail] = useState<string | null>(null);

  const all = listFirmwares();
  const list = useMemo(() => {
    const inRun = mode === 'run';
    const items = all
      .filter((d) => (inRun ? isFirmwareUnlocked(d.id) : true))
      .filter((d) => (type === 'all' || d.type === type) && (rarity === 'all' || d.rarity === rarity));
    const r = (d: FirmwareDef) => RARITY_ORDER.indexOf(d.rarity);
    const lockedLast = (a: FirmwareDef, b: FirmwareDef) => Number(!isFirmwareUnlocked(a.id)) - Number(!isFirmwareUnlocked(b.id));
    return items.sort(
      (a, b) =>
        lockedLast(a, b) ||
        (sort === 'rarity' ? r(b) - r(a) : sort === 'level' ? firmwareStateOf(b.id).level - firmwareStateOf(a.id).level : sort === 'ready' ? Number(canUpgrade(b.id)) - Number(canUpgrade(a.id)) : 0) ||
        a.name.localeCompare(b.name, 'ru'),
    );
    // ver — сигнал изменения данных адаптера
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, mode, type, rarity, sort, ver]);

  if (!mode) return null;
  const open = all.filter((d) => isFirmwareUnlocked(d.id)).length;
  const detailDef = detail ? all.find((d) => d.id === detail) : undefined;

  return (
    <Modal title={`Прошивки · ${open}/${all.length}`} onClose={close} wide>
      <div className="fw-modal" data-testid="firmware-modal">
        {detailDef ? (
          <FirmwareDetail def={detailDef} onBack={() => setDetail(null)} />
        ) : (
          <>
            <div className="fw-filters" role="group" aria-label="Фильтры">
              <div className="fw-chips" role="radiogroup" aria-label="Тип">
                <button type="button" role="radio" aria-checked={type === 'all'} className="fw-chip" onClick={() => setType('all')}>
                  Все
                </button>
                {TYPE_ORDER.map((t) => (
                  <button type="button" key={t} role="radio" aria-checked={type === t} className="fw-chip" onClick={() => setType(t)}>
                    <Icon name={TYPE_ICON[t]} size={16} />
                    {TYPE_NAME[t]}
                  </button>
                ))}
              </div>
              <div className="fw-selects">
                <label className="fw-select">
                  <span>Редкость</span>
                  <select value={rarity} onChange={(e) => setRarity(e.target.value as Rarity | 'all')}>
                    <option value="all">Любая</option>
                    {RARITY_ORDER.map((r) => (
                      <option key={r} value={r}>
                        {RARITY_NAME[r]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="fw-select">
                  <span>Сортировка</span>
                  <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                    {(Object.keys(SORT_NAME) as SortKey[]).map((k) => (
                      <option key={k} value={k}>
                        {SORT_NAME[k]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
            {list.length ? (
              <div className="fw-grid">
                {list.map((d) => (
                  <FirmwareCard key={d.id} def={d} st={firmwareStateOf(d.id)} locked={!isFirmwareUnlocked(d.id)} onClick={() => setDetail(d.id)} />
                ))}
              </div>
            ) : (
              <p className="muted center">Нет прошивок под эти фильтры</p>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

/** Иконка-кнопка вместо строки прошивок. Точка — есть что улучшить. */
export function FirmwareButton({ mode = 'run', className = '' }: { mode?: 'run' | 'collection'; className?: string }) {
  useContractVersion();
  const ready = listFirmwares().some((d) => canUpgrade(d.id));
  return (
    <button type="button" className={`fw-btn ${className}`} data-testid="firmware-button" aria-label={ready ? 'Прошивки — есть улучшения' : 'Прошивки'} title="Прошивки" onClick={() => useOverlays.getState().openFirmware(mode)}>
      <Icon name="firmware" size={22} />
      {ready ? <span className="fw-dot" aria-hidden /> : null}
    </button>
  );
}
