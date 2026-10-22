import { useMemo, useState } from 'react';
import type { FirmwareDef, FirmwareType, Rarity } from '../../ui-adapter/contract';
import { firmwareEffectText, firmwareRunState, isFirmwareUnlocked, listFirmwares, useContractVersion, useRunFirmwares } from '../../ui-adapter/contract';
import { useOverlays } from '../../ui-adapter/overlays';
import { Modal } from '../Bits';
import { Icon } from '../Icon';
import { FirmwareCard } from './FirmwareCard';
import { RARITY_NAME, RARITY_ORDER, TYPE_ICON, TYPE_NAME, TYPE_ORDER, unlockHint } from './labels';

type SortKey = 'rarity' | 'name';
const SORT_NAME: Record<SortKey, string> = { rarity: 'По редкости', name: 'По названию' };

const UPGRADE_HINT = 'Прошивка работает только в забеге, где ты её получил. Улучшить её можно один раз — там же, где карты: привал, лаборатория, магазин. После забега всё сбрасывается.';

function FirmwareDetail({ def, onBack }: { def: FirmwareDef; onBack: () => void }) {
  useContractVersion();
  const st = firmwareRunState(def.id);
  const locked = !isFirmwareUnlocked(def.id);
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
            <li className={st.owned && !st.upgraded ? 'is-current' : st.upgraded ? 'is-done' : undefined}>
              <b>Обычная</b> {firmwareEffectText(def, false)}
            </li>
            <li className={st.upgraded ? 'is-current' : undefined}>
              <b>Улучшенная</b> {firmwareEffectText(def, true)}
            </li>
          </ol>
          <p className="muted">{UPGRADE_HINT}</p>
        </div>
      </div>
    </div>
  );
}

/** Окно «Прошивки»: в забеге — прошивки этого забега, в меню — справочник всех прошивок. */
export function FirmwareModal() {
  const mode = useOverlays((s) => s.firmware);
  const ver = useContractVersion();
  const [type, setType] = useState<FirmwareType | 'all'>('all');
  const [rarity, setRarity] = useState<Rarity | 'all'>('all');
  const [sort, setSort] = useState<SortKey>('rarity');
  const [detail, setDetail] = useState<string | null>(null);
  const close = () => {
    setDetail(null);
    useOverlays.getState().openFirmware(null);
  };

  const all = listFirmwares();
  const runIds = useRunFirmwares();
  const list = useMemo(() => {
    const inRun = mode === 'run';
    const items = all
      .filter((d) => (inRun ? runIds.includes(d.id) : true))
      .filter((d) => (type === 'all' || d.type === type) && (rarity === 'all' || d.rarity === rarity));
    const r = (d: FirmwareDef) => RARITY_ORDER.indexOf(d.rarity);
    const lockedLast = (a: FirmwareDef, b: FirmwareDef) => Number(!isFirmwareUnlocked(a.id)) - Number(!isFirmwareUnlocked(b.id));
    return items.sort(
      (a, b) =>
        lockedLast(a, b) ||
        (sort === 'rarity' ? r(b) - r(a) : 0) ||
        a.name.localeCompare(b.name, 'ru'),
    );
    // ver — сигнал изменения данных адаптера
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, runIds, mode, type, rarity, sort, ver]);

  if (!mode) return null;
  const inRun = mode === 'run';
  const open = all.filter((d) => isFirmwareUnlocked(d.id)).length;
  const detailDef = detail ? all.find((d) => d.id === detail) : undefined;

  return (
    <Modal title={inRun ? `Прошивки забега · ${runIds.length}` : `Прошивки · открыто ${open}/${all.length}`} onClose={close} wide>
      <div className="fw-modal" data-testid="firmware-modal">
        {detailDef ? (
          <FirmwareDetail def={detailDef} onBack={() => setDetail(null)} />
        ) : (
          <>
            <p className="muted">{UPGRADE_HINT}</p>
            <div className="fw-filters" role="group" aria-label="Фильтры">
              <div className="fw-chips" role="group" aria-label="Тип">
                <button type="button" aria-pressed={type === 'all'} className="fw-chip" onClick={() => setType('all')}>
                  Все
                </button>
                {TYPE_ORDER.map((t) => (
                  <button type="button" key={t} aria-pressed={type === t} className="fw-chip" onClick={() => setType(t)}>
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
                  <FirmwareCard key={d.id} def={d} st={firmwareRunState(d.id)} locked={!isFirmwareUnlocked(d.id)} onClick={() => setDetail(d.id)} />
                ))}
              </div>
            ) : (
              <p className="muted center">{inRun && runIds.length === 0 ? 'В этом забеге прошивок пока нет — они выпадают с элит, боссов и иногда с обычных боёв.' : 'Нет прошивок под эти фильтры'}</p>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

/** Иконка-кнопка вместо строки прошивок. Точка — в забеге есть неулучшенная прошивка. */
export function FirmwareButton({ mode = 'run', className = 'fw-btn', label }: { mode?: 'run' | 'collection'; className?: string; label?: string }) {
  const runIds = useRunFirmwares();
  useContractVersion();
  const ready = mode === 'run' && runIds.some((id) => !firmwareRunState(id).upgraded);
  return (
    <button type="button" className={`${className} fw-btn-host`} data-testid="firmware-button" aria-label={ready ? 'Прошивки — можно улучшить' : 'Прошивки'} title="Прошивки" onClick={() => useOverlays.getState().openFirmware(mode)}>
      <Icon name="firmware" size={label ? 20 : 22} />
      {label ? <span>{label}</span> : null}
      {ready ? <span className="fw-dot" aria-hidden /> : null}
    </button>
  );
}
