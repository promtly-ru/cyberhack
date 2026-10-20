import { memo, useId, type ReactNode } from 'react';
import { getEnemyDef } from '../game/engine';
import { hash, r2, rng } from '../ui/rand';

/**
 * Конструктор портретов врагов (viewBox 120x120).
 * Силуэт = family (10 штук) + детерминированные вариации по hash(id) + оформление тира.
 * Цвет — accent из def.art (иначе из акта); анимации — классы ea-* из enemies-zones.css.
 */
export type ArtFamily = 'drone' | 'bot' | 'worm' | 'eye' | 'daemon' | 'construct' | 'swarm' | 'ghost' | 'beast' | 'core';
export type ArtAccent = 'cyan' | 'magenta' | 'acid' | 'orange' | 'green' | 'violet' | 'red';
type Tier = 'normal' | 'elite' | 'boss';

export const ART_FAMILIES: ArtFamily[] = ['drone', 'bot', 'worm', 'eye', 'daemon', 'construct', 'swarm', 'ghost', 'beast', 'core'];

const ACCENT_VAR: Record<ArtAccent, string> = {
  cyan: 'var(--cyan)', magenta: 'var(--magenta)', acid: 'var(--acid)', orange: 'var(--orange)',
  green: 'var(--green)', violet: 'var(--violet)', red: 'var(--red)',
};
const ACT_ACCENT: ArtAccent[] = ['cyan', 'green', 'violet', 'red'];

interface Resolved { family: ArtFamily; accent: ArtAccent; tier: Tier; act: number }

/** family/accent из def.art, иначе — детерминированный запасной вариант */
export function resolveArt(defId: string, tierProp: Tier): Resolved {
  let art: { family?: string; accent?: string } | undefined;
  let tier: Tier = tierProp;
  let act = 1;
  try {
    const d = getEnemyDef(defId) as unknown as { art?: { family?: string; accent?: string }; tier?: Tier; act?: number };
    art = d.art;
    if (d.tier) tier = d.tier;
    if (d.act) act = d.act;
  } catch { /* неизвестный id — запасной вариант */ }
  const h = hash(defId);
  const bossPool: ArtFamily[] = ['core', 'eye', 'beast', 'daemon', 'construct', 'ghost'];
  const family = (art?.family && (ART_FAMILIES as string[]).includes(art.family)
    ? art.family
    : tier === 'boss' ? bossPool[h % bossPool.length] : ART_FAMILIES[h % ART_FAMILIES.length]) as ArtFamily;
  const accent = (art?.accent && art.accent in ACCENT_VAR ? art.accent : ACT_ACCENT[Math.min(Math.max(act, 1), 4) - 1]) as ArtAccent;
  return { family, accent, tier: tierProp === 'normal' ? tier : tierProp, act };
}

export function accentColor(defId: string, tier: Tier): string {
  return ACCENT_VAR[resolveArt(defId, tier).accent];
}

/* ---------- Параметры вариации ---------- */
interface V {
  r: () => number;
  a: number; b: number; c: number; d: number; // 0..1
  k: number; // целое
  tier: Tier;
  mini: boolean; // миньон: упрощённый вариант
  big: boolean; // элита/босс — больше деталей
  boss: boolean;
}

const D = 'fill-deep';
const G = 'fill-glow';
const S = 'fill-glow-soft';
const VOID = 'fill-void';
const f = (n: number) => r2(n);

const Eye = ({ x, y, r = 3, cls = 'ea-blink', slit = false }: { x: number; y: number; r?: number; cls?: string; slit?: boolean }) => (
  <g className={cls}>
    <circle cx={x} cy={y} r={r} className={G} strokeWidth=".6" />
    {slit ? <rect x={f(x - r * 0.16)} y={f(y - r * 0.8)} width={f(r * 0.32)} height={f(r * 1.6)} fill="#05060f" stroke="none" /> : <circle cx={x} cy={y} r={f(r * 0.38)} fill="#fff" stroke="none" />}
  </g>
);

const poly = (pts: [number, number][]) => pts.map((p) => `${f(p[0])},${f(p[1])}`).join(' ');

/* ---------- DRONE: корпус + винты + линза ---------- */
function drone(v: V): ReactNode {
  const kind = v.k % 3;
  const arms = v.mini ? 2 : [2, 4, 3, 6][(v.k >> 3) % 4]!;
  const w = 15 + v.a * 9;
  const cy = 58;
  const rotors: [number, number][] = [];
  if (arms === 2) rotors.push([60 - w - 22, cy - 18], [60 + w + 22, cy - 18]);
  if (arms === 4) rotors.push([60 - w - 20, cy - 24], [60 + w + 20, cy - 24], [60 - w - 14, cy + 14], [60 + w + 14, cy + 14]);
  if (arms === 3) rotors.push([60 - w - 22, cy - 10], [60 + w + 22, cy - 10], [60, cy - w - 14]);
  if (arms === 6) rotors.push([60 - w - 22, cy - 28], [60 + w + 22, cy - 28], [60 - w - 26, cy - 4], [60 + w + 26, cy - 4], [60 - w - 18, cy + 20], [60 + w + 18, cy + 20]);
  const hull =
    kind === 0 ? <ellipse cx="60" cy={cy} rx={f(w + 6)} ry={f(w)} className={D} strokeWidth="1.8" />
    : kind === 1 ? <polygon points={poly([[60 - w - 8, cy], [60 - w, cy - w], [60 + w, cy - w], [60 + w + 8, cy], [60 + w, cy + w], [60 - w, cy + w]])} className={D} strokeWidth="1.8" />
    : <polygon points={poly([[60 - w - 6, cy - w * 0.6], [60, cy - w - 4], [60 + w + 6, cy - w * 0.6], [60 + w - 4, cy + w], [60 - w + 4, cy + w]])} className={D} strokeWidth="1.8" />;
  const lens = 5.5 + v.b * 4;
  return (
    <>
      {rotors.map(([x, y], i) => (
        <g key={i}>
          <path d={`M${f(x < 60 ? 60 - w : 60 + w)} ${cy}L${f(x)} ${f(y + 2)}`} strokeWidth="2" opacity=".85" />
          <ellipse cx={f(x)} cy={f(y - 1)} rx="14" ry="2.6" className={`${S} ea-rotor`} strokeWidth="1.2" style={{ animationDelay: `${i * 0.13}s` }} />
          <circle cx={f(x)} cy={f(y)} r="2.4" className={G} stroke="none" />
        </g>
      ))}
      {hull}
      <path d={`M${f(60 - w + 3)} ${cy + 6}h${f(w * 2 - 6)}`} strokeWidth=".8" opacity=".5" />
      <circle cx="60" cy={cy} r={f(lens + 3.5)} className={VOID} strokeWidth="1.4" />
      <circle cx="60" cy={cy} r={f(lens)} className={`${G} ea-blink`} stroke="none" />
      <circle cx={f(60 - lens * 0.3)} cy={f(cy - lens * 0.3)} r={f(lens * 0.32)} fill="#fff" stroke="none" opacity=".9" />
      {v.c > 0.5 && !v.mini ? <path d={`M${f(60 - 4)} ${cy + w}v9h8v-9`} className={D} strokeWidth="1.4" /> : null}
      {v.d > 0.45 && !v.mini ? <path d={`M${f(60 + w * 0.5)} ${cy - w}l5-14M${f(60 + w * 0.5 + 5)} ${cy - w - 14}h-3`} strokeWidth="1.2" /> : null}
      <path d={`M${f(60 - 6)} ${cy + w + 2}h12l-3 8h-6z`} className={`${S} ea-flame`} strokeWidth="1" />
      {v.big ? <path d={`M${f(60 - w - 6)} ${cy - 2}h-5M${f(60 + w + 6)} ${cy - 2}h5`} strokeWidth="2.4" /> : null}
    </>
  );
}

/* ---------- BOT: гуманоидный робот ---------- */
function bot(v: V): ReactNode {
  const head = v.k % 3;
  const hw = 11 + v.a * 5;
  const hh = 9 + v.b * 4;
  const sw = 20 + v.c * 9;
  const longArm = v.d > 0.5;
  const hy = 26;
  const headShape =
    head === 0 ? <rect x={f(60 - hw)} y={f(hy - hh)} width={f(hw * 2)} height={f(hh * 2)} rx="3" className={D} strokeWidth="1.8" />
    : head === 1 ? <path d={`M${f(60 - hw)} ${hy + hh}V${hy}a${f(hw)} ${f(hh)} 0 0 1 ${f(hw * 2)} 0V${hy + hh}z`} className={D} strokeWidth="1.8" />
    : <polygon points={poly([[60 - hw, hy - hh * 0.5], [60 - hw * 0.5, hy - hh], [60 + hw * 0.5, hy - hh], [60 + hw, hy - hh * 0.5], [60 + hw * 0.7, hy + hh], [60 - hw * 0.7, hy + hh]])} className={D} strokeWidth="1.8" />;
  const arm = (side: number) => {
    const x0 = 60 + side * sw;
    const len = longArm ? 40 : 32;
    const cannon = side === 1 && v.d > 0.2 && v.k % 2 === 0;
    return (
      <g key={side} className="ea-sway-s" style={{ animationDelay: side === 1 ? '.6s' : '0s' }}>
        <rect x={f(x0 - 5 + side * 2)} y="48" width="10" height={len} rx="3" className={D} strokeWidth="1.6" />
        {cannon ? <rect x={f(x0 - 3 + side * 4)} y={48 + len - 2} width="12" height="12" rx="2" className={S} strokeWidth="1.6" /> : <path d={`M${f(x0 + side * 2 - 4)} ${48 + len}l-2 8h12l-2-8`} className={S} strokeWidth="1.4" />}
        {cannon ? <circle cx={f(x0 + side * 4 + 3)} cy={48 + len + 10} r="2" className={G} stroke="none" /> : null}
      </g>
    );
  };
  return (
    <>
      {v.k % 5 === 0 || v.big ? <path d={`M${f(60 - hw * 0.5)} ${hy - hh}l-7-14M${f(60 + hw * 0.5)} ${hy - hh}l7-14`} strokeWidth="1.4" /> : <path d={`M60 ${hy - hh}v-13`} strokeWidth="1.6" />}
      <circle cx={v.k % 5 === 0 || v.big ? f(60 - hw * 0.5 - 7) : 60} cy={v.k % 5 === 0 || v.big ? hy - hh - 15 : hy - hh - 14} r="2.2" className={`${G} ea-blink`} stroke="none" />
      {arm(-1)}
      {arm(1)}
      {/* ноги */}
      <rect x="44" y="82" width="12" height="22" rx="3" className={D} strokeWidth="1.6" />
      <rect x="64" y="82" width="12" height="22" rx="3" className={D} strokeWidth="1.6" />
      <path d="M40 104h20v6H40zM60 104h20v6H60z" className={S} strokeWidth="1.4" />
      {/* торс */}
      <path d={`M${f(60 - sw)} 48h${f(sw * 2)}l-5 38H${f(60 - sw + 5)}z`} className={D} strokeWidth="1.8" />
      <path d={`M${f(60 - sw)} 48l-3 6h${f(sw * 2 + 6)}l-3-6`} className={S} strokeWidth="1.2" />
      <path d={`M48 62h24M50 70h20`} strokeWidth=".9" opacity=".5" />
      <circle cx="60" cy="66" r="4.2" className={`${G} ea-blink`} stroke="none" />
      <rect x="55" y="40" width="10" height="9" className={D} strokeWidth="1.2" />
      {headShape}
      {v.k % 2 === 0
        ? <rect x={f(60 - hw + 3)} y={hy - 3} width={f(hw * 2 - 6)} height="5.5" rx="1" className={`${G} ea-blink`} stroke="none" />
        : <><Eye x={f(60 - hw * 0.45)} y={hy} r={3.2} /><Eye x={f(60 + hw * 0.45)} y={hy} r={3.2} /></>}
      {!v.mini ? <path d={`M${f(60 - hw + 4)} ${hy + hh - 3}h${f(hw * 2 - 8)}`} strokeWidth="1" strokeDasharray="2 2" opacity=".6" /> : null}
    </>
  );
}

/* ---------- WORM: сегментированная змея ---------- */
function worm(v: V): ReactNode {
  const n = v.mini ? 5 : 6 + Math.floor(v.a * 4) + (v.boss ? 3 : 0);
  const waves = 1.4 + v.b * 1.4;
  const amp = 12 + v.c * 10;
  const ph = v.d * 6;
  const pts = Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    return { x: 16 + t * 82, y: 74 - t * 14 + Math.sin(t * Math.PI * waves + ph) * amp * (0.4 + t * 0.6), rad: 5 + t * 8 };
  });
  const head = pts[n - 1]!;
  const mouth = v.k % 3;
  return (
    <>
      {pts.slice(0, -1).map((p, i) => (
        <g key={i} className="ea-seg" style={{ animationDelay: `${i * 0.18}s`, transformOrigin: `${f(p.x)}px ${f(p.y)}px` }}>
          <path d={`M${f(p.x - 2)} ${f(p.y - p.rad)}l${f(1)} -${v.big ? 7 : 4.5}l${f(3)} ${v.big ? 7 : 4.5}`} strokeWidth="1.2" opacity=".85" />
          <circle cx={f(p.x)} cy={f(p.y)} r={f(p.rad)} className={D} strokeWidth="1.6" />
          <path d={`M${f(p.x - p.rad * 0.5)} ${f(p.y - p.rad * 0.45)}a${f(p.rad * 0.7)} ${f(p.rad * 0.7)} 0 0 1 ${f(p.rad * 0.8)} 0`} strokeWidth="1" opacity=".55" />
          {i % 2 === 0 ? <circle cx={f(p.x)} cy={f(p.y + p.rad * 0.3)} r="1.6" className={G} stroke="none" /> : null}
        </g>
      ))}
      <g>
        {mouth === 0 ? (
          <>
            <path d={`M${f(head.x + 4)} ${f(head.y - 6)}l${16}-9l-5 12z M${f(head.x + 4)} ${f(head.y + 6)}l${16} 9l-5-12z`} className={S} strokeWidth="1.6" />
            <path d={`M${f(head.x + 12)} ${f(head.y - 2)}l6 2l-6 2`} strokeWidth="1.2" />
          </>
        ) : mouth === 1 ? (
          <>
            <ellipse cx={f(head.x + 8)} cy={f(head.y)} rx="7" ry={f(head.rad)} className={VOID} strokeWidth="1.6" />
            {Array.from({ length: 6 }, (_, i) => {
              const yy = head.y - head.rad + 2 + i * ((head.rad * 2 - 4) / 5);
              return <path key={i} d={`M${f(head.x + 5)} ${f(yy)}l5 ${i < 3 ? 2 : -2}`} strokeWidth="1.4" />;
            })}
          </>
        ) : (
          <>
            <rect x={f(head.x + 4)} y={f(head.y - 7)} width="14" height="14" rx="2" className={S} strokeWidth="1.6" />
            <path d={`M${f(head.x + 18)} ${f(head.y - 4)}h6M${f(head.x + 18)} ${f(head.y + 4)}h6`} strokeWidth="2.2" />
          </>
        )}
        <circle cx={f(head.x)} cy={f(head.y)} r={f(head.rad)} className={D} strokeWidth="2" />
        <Eye x={f(head.x - 1)} y={f(head.y - 3)} r={3.4} slit={v.k % 2 === 0} />
        {v.big ? <Eye x={f(head.x - 5)} y={f(head.y + 4)} r={2.2} /> : null}
      </g>
    </>
  );
}

/* ---------- EYE: глаз на опоре ---------- */
function eye(v: V): ReactNode {
  const R = (v.mini ? 20 : 25) + v.a * 8;
  const cy = 50;
  const pupil = v.k % 3;
  const mount = (v.k >> 2) % 3;
  const rays = v.mini ? 6 : 8 + Math.floor(v.b * 6);
  const sat = v.mini ? 0 : Math.floor(v.c * 3.4);
  return (
    <>
      {mount === 0 ? (
        <>
          <path d={`M54 ${cy + R - 2}c-6 20 6 28 0 44M66 ${cy + R - 2}c6 20-6 28 0 44`} className={S} strokeWidth="1.6" />
          <path d="M36 108h48l-6-8H42z" className={D} strokeWidth="1.8" />
        </>
      ) : mount === 1 ? (
        <>
          <path d={`M60 ${cy + R - 4}L36 106M60 ${cy + R - 4}L84 106M60 ${cy + R - 4}V108`} strokeWidth="3" />
          <path d="M30 108h12M78 108h12M54 108h12" strokeWidth="3" />
        </>
      ) : (
        <>
          {[-14, -6, 2, 10, 18].map((dx, i) => (
            <path key={i} d={`M${f(60 + dx * 0.4)} ${cy + R - 3}c${f(dx)} 14 ${f(-dx * 0.8)} 22 ${f(dx * 1.2)} ${f(50 - R * 0.4)}`} strokeWidth="1.6" opacity={0.9 - i * 0.08} />
          ))}
        </>
      )}
      {Array.from({ length: rays }, (_, i) => {
        const a = -Math.PI + (i / (rays - 1)) * Math.PI * 1.0 - 0.0;
        const aa = a - 0.0;
        const x1 = 60 + Math.cos(aa) * (R + 3);
        const y1 = cy + Math.sin(aa) * (R + 3);
        const L = 5 + ((i * 7) % 5) * (v.big ? 2.2 : 1.4);
        return <path key={i} d={`M${f(x1)} ${f(y1)}L${f(60 + Math.cos(aa) * (R + 3 + L))} ${f(cy + Math.sin(aa) * (R + 3 + L))}`} strokeWidth="1.4" opacity=".7" />;
      })}
      {Array.from({ length: sat }, (_, i) => {
        const a = [-2.5, -0.6, 0.6][i]!;
        return <g key={i} className="ea-bob" style={{ animationDelay: `${i * 0.5}s` }}><Eye x={f(60 + Math.cos(a) * (R + 12))} y={f(cy + Math.sin(a) * (R + 10))} r={4.4} /></g>;
      })}
      <circle cx="60" cy={cy} r={R} className={D} strokeWidth="2" />
      <circle cx="60" cy={cy} r={f(R * 0.62)} className={S} strokeWidth="1.4" />
      <circle cx="60" cy={cy} r={f(R * 0.62)} strokeWidth=".8" strokeDasharray="2 3" opacity=".7" />
      <g className="ea-gaze">
        {pupil === 0 ? <circle cx="60" cy={cy} r={f(R * 0.26)} className={VOID} strokeWidth="1.6" />
          : pupil === 1 ? <ellipse cx="60" cy={cy} rx={f(R * 0.1)} ry={f(R * 0.5)} className={VOID} strokeWidth="1.6" />
          : <><circle cx="60" cy={cy} r={f(R * 0.3)} className={VOID} strokeWidth="1.6" /><path d={`M${f(60 - R * 0.5)} ${cy}h${f(R)}M60 ${f(cy - R * 0.5)}v${f(R)}`} strokeWidth=".9" opacity=".8" /></>}
        <circle cx={f(60 - R * 0.14)} cy={f(cy - R * 0.14)} r={f(R * 0.07)} fill="#fff" stroke="none" />
      </g>
      <path d={`M${f(60 - R)} ${cy}Q60 ${f(cy - R * 1.15)} ${f(60 + R)} ${cy}`} className={D} strokeWidth="2" opacity=".0" />
      <path d={`M${f(60 - R - 2)} ${cy - 3}Q60 ${f(cy - R * 1.25)} ${f(60 + R + 2)} ${cy - 3}`} strokeWidth="2.4" opacity=".85" />
      {v.d > 0.5 ? <path d={`M${f(60 - R)} ${cy + 6}Q60 ${f(cy + R * 1.1)} ${f(60 + R)} ${cy + 6}`} strokeWidth="1.2" opacity=".5" /> : null}
    </>
  );
}

/* ---------- DAEMON: капюшон-фигура с орбами ---------- */
function daemonHood(v: V): ReactNode {
  const horns = v.k % 4;
  const hem = v.mini ? 3 : 4 + Math.floor(v.a * 3);
  const wide = 22 + v.b * 10;
  const hy = 26;
  const hood = `M60 ${hy - 20}C${f(60 - 18)} ${hy - 18} ${f(60 - 20)} ${hy + 2} ${f(60 - 19)} ${hy + 16}L${f(60 + 19)} ${hy + 16}C${f(60 + 20)} ${hy + 2} ${f(60 + 18)} ${hy - 18} 60 ${hy - 20}z`;
  const hemPts: string[] = [];
  const w2 = wide + 6;
  for (let i = 0; i <= hem; i++) {
    const x = 60 - w2 + (i / hem) * w2 * 2;
    const y = 100 + (i % 2 === 0 ? 0 : 10 + (v.d * 6));
    hemPts.push(`L${f(x)} ${f(y)}`);
  }
  return (
    <>
      {v.k % 3 === 0 && !v.mini ? <circle cx="60" cy={hy} r="26" strokeWidth="1.2" strokeDasharray="3 4" opacity=".65" className="ea-spin-slow" /> : null}
      {/* орбы на ладонях */}
      <g className="ea-bob"><circle cx="16" cy={f(60 + v.c * 14)} r={v.mini ? 4 : 6} className={S} strokeWidth="1.4" /><circle cx="16" cy={f(60 + v.c * 14)} r="2.4" className={G} stroke="none" /></g>
      {!v.mini && v.d > 0.25 ? <g className="ea-bob" style={{ animationDelay: '.9s' }}><circle cx="104" cy={f(54 + v.c * 14)} r="5" className={S} strokeWidth="1.4" /><circle cx="104" cy={f(54 + v.c * 14)} r="2" className={G} stroke="none" /></g> : null}
      {/* плащ */}
      <path d={`M${f(60 - 18)} ${hy + 14}L${f(60 - wide)} 62L${f(60 - w2)} 100${hemPts.join('')}L${f(60 + w2)} 100L${f(60 + wide)} 62L${f(60 + 18)} ${hy + 14}z`} className={D} strokeWidth="1.8" />
      <path d={`M60 ${hy + 18}V98M${f(60 - 10)} 60l10 10 10-10M${f(60 - 14)} 84h28`} strokeWidth="1" opacity=".5" />
      {/* рукава */}
      <path d={`M${f(60 - wide + 2)} 58L18 ${f(62 + v.c * 14)}M${f(60 + wide - 2)} 58L${v.d > 0.25 && !v.mini ? 102 : 96} ${f(56 + v.c * 14)}`} strokeWidth="3.6" opacity=".9" />
      {/* рога / корона */}
      {horns === 1 ? <path d={`M${f(60 - 14)} ${hy - 10}c-14-2-18-14-14-24M${f(60 + 14)} ${hy - 10}c14-2 18-14 14-24`} strokeWidth="2.4" /> : null}
      {horns === 2 ? <path d={`M${f(60 - 12)} ${hy - 14}l-5-18l9 12l4-16l4 16l9-12l-5 18`} className={S} strokeWidth="1.6" /> : null}
      {horns === 3 ? <path d={`M${f(60 - 8)} ${hy - 18}l-6-20M${f(60 + 8)} ${hy - 18}l6-20M${f(60 - 14)} ${hy - 38}h4M${f(60 + 10)} ${hy - 38}h4`} strokeWidth="1.6" /> : null}
      <path d={hood} className={D} strokeWidth="2" />
      <path d={`M${f(60 - 12)} ${hy - 2}c0-8 24-8 24 0v10c0 6-24 6-24 0z`} className={VOID} strokeWidth="1.2" />
      {v.k % 2 === 0 ? <><Eye x={f(60 - 5)} y={hy + 3} r={2.6} /><Eye x={f(60 + 5)} y={hy + 3} r={2.6} /></> : <><rect x={f(60 - 9)} y={hy + 1} width="18" height="3.4" rx="1" className={`${G} ea-blink`} stroke="none" /></>}
      {v.big ? <path d={`M${f(60 - wide)} 70l-8 8M${f(60 + wide)} 70l8 8`} strokeWidth="2" /> : null}
    </>
  );
}

/* ---------- CONSTRUCT: тяжёлая блочная машина ---------- */
function constructBox(v: V, treads: boolean): ReactNode {
  const bw = 32 + v.a * 12;
  const bh = 34 + v.b * 12;
  const bx = 60 - bw;
  const by = 100 - bh - (treads ? 10 : 22);
  const headOff = (v.c - 0.5) * 18;
  const panels = v.mini ? 1 : 2 + Math.floor(v.d * 3);
  return (
    <>
      {/* ходовая */}
      {treads ? (
        <>
          <rect x={f(bx - 4)} y="92" width={f(bw * 2 + 8)} height="16" rx="8" className={D} strokeWidth="1.8" />
          {Array.from({ length: 4 }, (_, i) => <circle key={i} cx={f(bx + 8 + i * ((bw * 2 - 16) / 3))} cy="100" r="4" className={S} strokeWidth="1.2" />)}
        </>
      ) : (
        <>
          <path d={`M${f(60 - bw * 0.6)} ${by + bh}l-6 ${100 - by - bh}h14l2-${100 - by - bh}M${f(60 + bw * 0.6)} ${by + bh}l6 ${100 - by - bh}h-14l-2-${100 - by - bh}`} className={D} strokeWidth="2.2" />
          <path d={`M${f(60 - bw * 0.6 - 10)} 108h26M${f(60 + bw * 0.6 - 16)} 108h26`} strokeWidth="3" />
        </>
      )}
      {/* корпус */}
      <rect x={f(bx)} y={f(by)} width={f(bw * 2)} height={f(bh)} rx="3" className={D} strokeWidth="2" />
      {Array.from({ length: panels }, (_, i) => {
        const px = bx + 5 + (i * (bw * 2 - 10)) / panels;
        return <rect key={i} x={f(px)} y={f(by + 6)} width={f((bw * 2 - 10) / panels - 3)} height={f(bh - 12)} rx="1.5" className={i % 2 ? S : D} strokeWidth="1.1" opacity=".9" />;
      })}
      <path d={`M${f(bx + 4)} ${f(by + bh - 5)}l8-6M${f(bx + 14)} ${f(by + bh - 5)}l8-6M${f(bx + bw * 2 - 22)} ${f(by + bh - 5)}l8-6`} strokeWidth="1.3" opacity=".6" />
      <circle cx={f(60 + (v.c - 0.5) * 20)} cy={f(by + bh * 0.5)} r="5" className={`${G} ea-blink`} stroke="none" />
      {/* плечи */}
      {!v.mini ? <><rect x={f(bx - 10)} y={f(by - 4)} width="16" height="18" rx="3" className={D} strokeWidth="1.8" /><rect x={f(bx + bw * 2 - 6)} y={f(by - 4)} width="16" height="18" rx="3" className={D} strokeWidth="1.8" /></> : null}
      {v.d > 0.5 && !v.mini ? <rect x={f(bx + bw * 2 + 4)} y={f(by + 6)} width="16" height="7" rx="2" className={S} strokeWidth="1.4" /> : null}
      {/* голова */}
      <rect x={f(60 + headOff - 12)} y={f(by - 14)} width="24" height="15" rx="2" className={D} strokeWidth="1.8" />
      <rect x={f(60 + headOff - 8)} y={f(by - 9)} width="16" height="4" rx="1" className={`${G} ea-blink`} stroke="none" />
      <path d={`M${f(60 + headOff + 8)} ${f(by - 14)}l4-12`} strokeWidth="1.6" />
      {v.big ? <path d={`M${f(bx)} ${f(by - 4)}h${f(bw * 2)}`} strokeWidth="3" opacity=".7" /> : null}
    </>
  );
}

function construct(v: V): ReactNode {
  const sub = v.k % 5;
  if (sub === 0) return constructBox(v, true);
  if (sub === 1) return constructBox(v, false);
  const bw = 22 + v.a * 8;
  if (sub === 2) {
    // башня из блоков
    const tiers = v.mini ? 2 : 3 + Math.floor(v.b * 2);
    const hs = 62 / tiers;
    return (
      <>
        <path d="M26 108h68l-6-10H32z" className={D} strokeWidth="1.8" />
        {Array.from({ length: tiers }, (_, i) => {
          const w = bw + 12 - i * ((bw - 6) / tiers);
          const y = 98 - (i + 1) * hs;
          return (
            <g key={i}>
              <rect x={f(60 - w)} y={f(y)} width={f(w * 2)} height={f(hs - 2)} rx="2" className={D} strokeWidth="1.8" />
              <rect x={f(60 - w + 4)} y={f(y + hs * 0.35)} width={f(w * 2 - 8)} height="3" className={i % 2 ? `${G} ea-blink` : S} stroke="none" />
              <path d={`M${f(60 - w + 4)} ${f(y + 5)}h6M${f(60 + w - 10)} ${f(y + 5)}h6`} strokeWidth="1.2" opacity=".6" />
            </g>
          );
        })}
        <path d={`M60 ${f(98 - tiers * hs)}v-12M52 ${f(98 - tiers * hs - 10)}h16M${f(60 - 14)} ${f(98 - tiers * hs - 6)}a14 8 0 0 1 28 0`} strokeWidth="1.6" />
        <circle cx="60" cy={f(98 - tiers * hs - 14)} r="2.4" className={`${G} ea-blink`} stroke="none" />
        {v.d > 0.4 && !v.mini ? <path d={`M${f(60 + bw + 12)} 80h14M${f(60 + bw + 12)} 70h10`} strokeWidth="2.6" /> : null}
      </>
    );
  }
  if (sub === 3) {
    // диск-вентилятор на стойке
    const R = (v.mini ? 20 : 26) + v.a * 6;
    const blades = 5 + Math.floor(v.b * 4);
    return (
      <>
        <path d="M46 106h28l-4-18H50z" className={D} strokeWidth="1.8" />
        <path d="M32 108h56" strokeWidth="3.4" />
        <circle cx="60" cy="56" r={f(R + 5)} className={D} strokeWidth="2.2" />
        <circle cx="60" cy="56" r={f(R + 1)} strokeWidth=".8" strokeDasharray="2 4" opacity=".6" />
        <g className="ea-spin-slow" style={{ animationDuration: '3s' }}>
          {Array.from({ length: blades }, (_, i) => (
            <path key={i} d={`M60 56q${f(R * 0.5)} ${f(-R * 0.15)} ${f(R * 0.2)} ${f(-R * 0.95)}q${f(-R * 0.4)} ${f(R * 0.5)} ${f(-R * 0.2)} ${f(R * 0.95)}z`} transform={`rotate(${f((i * 360) / blades)} 60 56)`} className={S} strokeWidth="1.3" />
          ))}
        </g>
        <circle cx="60" cy="56" r="6" className={D} strokeWidth="1.6" />
        <circle cx="60" cy="56" r="2.6" className={`${G} ea-blink`} stroke="none" />
        {v.big ? <path d={`M${f(60 - R - 10)} 56h6M${f(60 + R + 4)} 56h6M60 ${f(56 - R - 10)}v6`} strokeWidth="2.4" /> : null}
      </>
    );
  }
  // арка-ворота с электродами
  const ph = 66 + v.b * 12;
  const gw = 24 + v.a * 10;
  return (
    <>
      <rect x={f(60 - gw - 18)} y={f(106 - ph)} width="18" height={f(ph)} rx="2" className={D} strokeWidth="2" />
      <rect x={f(60 + gw)} y={f(106 - ph)} width="18" height={f(ph)} rx="2" className={D} strokeWidth="2" />
      <path d={`M${f(60 - gw - 16)} ${f(106 - ph + 14)}l14 -8M${f(60 - gw - 16)} ${f(106 - ph + 30)}l14 -8M${f(60 + gw + 2)} ${f(106 - ph + 14)}l14 -8M${f(60 + gw + 2)} ${f(106 - ph + 30)}l14 -8`} strokeWidth="1.4" opacity=".75" />
      <rect x={f(60 - gw - 24)} y={f(106 - ph - 12)} width={f(gw * 2 + 48)} height="13" rx="2" className={D} strokeWidth="2" />
      <rect x={f(60 - 9)} y={f(106 - ph - 9)} width="18" height="7" rx="1" className={`${G} ea-blink`} stroke="none" />
      {Array.from({ length: v.mini ? 2 : 3 }, (_, i) => (
        <g key={i} className="ea-blink" style={{ animationDelay: `${i * 0.7}s` }}>
          <path d={`M${f(60 - gw)} ${f(106 - ph + 22 + i * 14)}h${f(gw * 2)}`} strokeWidth="1.8" strokeDasharray="3 3" />
          <circle cx={f(60 + (i - 1) * gw * 0.5)} cy={f(106 - ph + 22 + i * 14)} r="2.4" className={G} stroke="none" />
        </g>
      ))}
      <path d={`M${f(60 - gw - 24)} 108h${f(gw * 2 + 48)}`} strokeWidth="3" />
    </>
  );
}

function daemon(v: V): ReactNode {
  const sub = v.k % 3;
  if (sub === 0) return daemonHood(v);
  if (sub === 1) {
    // тотем из плавающих плит с рядами кода
    const n = v.mini ? 3 : 4 + Math.floor(v.a * 2);
    const h = 76 / n;
    return (
      <>
        <g className="ea-bob" style={{ animationDelay: '.4s' }}><circle cx="18" cy="52" r="5" className={S} strokeWidth="1.4" /><circle cx="18" cy="52" r="2" className={G} stroke="none" /></g>
        {!v.mini ? <g className="ea-bob"><circle cx="102" cy="70" r="4" className={S} strokeWidth="1.4" /><circle cx="102" cy="70" r="1.8" className={G} stroke="none" /></g> : null}
        {Array.from({ length: n }, (_, i) => {
          const w = 14 + (i === 0 ? 8 : 0) + ((i * 7 + Math.floor(v.b * 10)) % 3) * 4;
          const y = 14 + i * (h + 3);
          return (
            <g key={i} className="ea-bob-s" style={{ animationDelay: `${i * 0.35}s` }}>
              <rect x={f(60 - w)} y={f(y)} width={f(w * 2)} height={f(h - 1)} rx="2" className={D} strokeWidth="1.8" />
              <path d={`M${f(60 - w + 4)} ${f(y + 6)}h${f(w * 0.9)}M${f(60 - w + 4)} ${f(y + 11)}h${f(w * 1.3)}`} strokeWidth="1" opacity=".6" />
              {i % 2 === 0 ? <rect x={f(60 + w - 10)} y={f(y + 4)} width="6" height="3" className={`${G} ea-blink`} stroke="none" /> : null}
            </g>
          );
        })}
        <rect x="52" y="19" width="16" height="3.2" rx="1" className={`${G} ea-blink`} stroke="none" />
        <path d={`M60 ${f(14 + n * (h + 3))}v10l-5 8M60 ${f(14 + n * (h + 3) + 10)}l5 8`} strokeWidth="1.6" opacity=".7" />
        <path d="M40 10l-6-8M80 10l6-8" strokeWidth="1.6" />
      </>
    );
  }
  // «сфера с плавниками и хвостом»
  const R = (v.mini ? 14 : 18) + v.a * 6;
  const fins = 3 + Math.floor(v.b * 3);
  return (
    <>
      <path d={`M60 ${f(48 + R)}c-12 14 12 22 0 36c-6 8-2 14 4 20`} strokeWidth="3" opacity=".9" className="ea-sway-s" />
      <polygon points="60,104 54,112 66,112" className={G} strokeWidth="1" />
      {Array.from({ length: fins }, (_, i) => {
        const a = -Math.PI * 0.95 + (i / (fins - 1 || 1)) * Math.PI * 0.9;
        const x1 = 60 + Math.cos(a) * R;
        const y1 = 48 + Math.sin(a) * R;
        return <path key={i} d={`M${f(x1)} ${f(y1)}L${f(60 + Math.cos(a) * (R + 16))} ${f(48 + Math.sin(a) * (R + 16))}L${f(60 + Math.cos(a + 0.28) * (R + 2))} ${f(48 + Math.sin(a + 0.28) * (R + 2))}z`} className={S} strokeWidth="1.5" />;
      })}
      <g className="ea-bob-s">
        <path d={`M${f(60 - R)} 52c-16 4-30 12-38 22M${f(60 + R)} 52c16 4 30 12 38 22`} strokeWidth="2.4" opacity=".85" />
        <circle cx="60" cy="48" r={f(R)} className={D} strokeWidth="2" />
        <path d={`M${f(60 - R * 0.8)} ${f(48 - R * 0.3)}q${f(R * 0.8)} ${f(-R * 0.5)} ${f(R * 1.6)} 0`} strokeWidth="2.4" />
        <Eye x={60} y={50} r={f(R * 0.42)} slit={v.k % 2 === 0} />
      </g>
    </>
  );
}

/* ---------- SWARM: облако осколков ---------- */
function swarm(v: V): ReactNode {
  const n = v.mini ? 7 : 11 + Math.floor(v.a * 5) + (v.boss ? 6 : v.big ? 3 : 0);
  const r = v.r;
  const rx = 40 + v.b * 10;
  const ry = 32 + v.c * 10;
  const pts = Array.from({ length: n }, (_, i) => {
    const ang = r() * Math.PI * 2;
    const rad = Math.sqrt(r());
    return { x: 60 + Math.cos(ang) * rad * rx, y: 58 + Math.sin(ang) * rad * ry, s: 4 + r() * 7, rot: r() * 90, kind: Math.floor(r() * 3), i };
  });
  const shard = (p: (typeof pts)[number]) => {
    const s = p.s;
    const pp = p.kind === 0 ? poly([[0, -s], [s * 0.7, 0], [0, s], [-s * 0.7, 0]]) : p.kind === 1 ? poly([[0, -s], [s, s * 0.8], [-s, s * 0.8]]) : poly([[-s * 0.8, -s * 0.8], [s * 0.8, -s * 0.5], [s * 0.6, s * 0.8], [-s * 0.7, s * 0.6]]);
    return <polygon points={pp} transform={`translate(${f(p.x)} ${f(p.y)}) rotate(${f(p.rot)})`} className={p.i % 3 === 0 ? G : D} strokeWidth="1.3" />;
  };
  return (
    <>
      {pts.map((p, i) => {
        const q = pts[(i * 5 + 1) % n]!;
        return i > 0 ? <path key={`l${i}`} d={`M${f(p.x)} ${f(p.y)}L${f(q.x)} ${f(q.y)}`} strokeWidth=".7" opacity=".35" /> : null;
      })}
      {[0, 1, 2].map((g) => (
        <g key={g} className={`ea-drift ea-drift-${g}`}>
          {pts.filter((_, i) => i % 3 === g).map((p) => <g key={p.i}>{shard(p)}</g>)}
        </g>
      ))}
      <g className="ea-blink">
        <polygon points={poly([[60, 46], [68, 58], [60, 70], [52, 58]])} className={G} strokeWidth="1.4" />
        <circle cx="60" cy="58" r="2.4" fill="#fff" stroke="none" />
      </g>
    </>
  );
}

/* ---------- GHOST: простыня с эхо-контуром ---------- */
function ghostSheet(v: V): ReactNode {
  const hw = 20 + v.a * 8;
  const waves = v.mini ? 3 : 4 + Math.floor(v.b * 3);
  const top = 12 + v.c * 6;
  const hemY = 98;
  const shape = (dx: number) => {
    let d = `M${f(60 - hw + dx)} 70C${f(60 - hw - 2 + dx)} ${f(top + 6)} ${f(60 - 10 + dx)} ${f(top)} ${f(60 + dx)} ${f(top)}S${f(60 + hw + 2 + dx)} ${f(top + 6)} ${f(60 + hw + dx)} 70`;
    const wl = (hw * 2 + 4) / waves;
    d += `L${f(60 + hw + 4 + dx)} ${hemY}`;
    for (let i = 0; i < waves; i++) {
      const x1 = 60 + hw + 4 - wl * i + dx;
      d += `q${f(-wl / 4)} ${i % 2 === 0 ? 12 : -10} ${f(-wl / 2)} 0t${f(-wl / 2)} 0`;
      void x1;
    }
    d += `L${f(60 - hw + dx)} 70z`;
    return d;
  };
  const eyes = v.k % 3;
  return (
    <>
      <path d={shape(7)} strokeWidth="1.3" opacity=".4" className="ea-glitch" />
      {!v.mini && v.d > 0.3 ? <path d={`M${f(60 - hw)} 56c-12 4-16 14-14 26M${f(60 + hw)} 56c12 4 16 14 14 26`} strokeWidth="3" opacity=".7" /> : null}
      <path d={shape(0)} className={D} strokeWidth="1.8" />
      <path d={`M${f(60 - hw + 4)} 80h${f(hw * 2 - 8)}`} strokeWidth=".9" opacity=".4" strokeDasharray="3 3" />
      {/* глитч-срезы */}
      <rect x={f(60 - hw - 3)} y="52" width={f(hw * 2 + 6)} height="3" className={`${S} ea-glitch`} stroke="none" />
      {!v.mini ? <rect x={f(60 - hw - 1)} y="72" width={f(hw * 1.2)} height="2.4" className={`${G} ea-glitch`} style={{ animationDelay: '.7s' }} stroke="none" opacity=".7" /> : null}
      {/* лицо */}
      {eyes === 0 ? <><ellipse cx={f(60 - 8)} cy="44" rx="4.6" ry="6.4" className={VOID} strokeWidth="1.2" /><ellipse cx={f(60 + 8)} cy="44" rx="4.6" ry="6.4" className={VOID} strokeWidth="1.2" /><circle cx={f(60 - 8)} cy="45" r="1.8" className={`${G} ea-blink`} stroke="none" /><circle cx={f(60 + 8)} cy="45" r="1.8" className={`${G} ea-blink`} stroke="none" /></>
        : eyes === 1 ? <><path d={`M${f(60 - 14)} 40l10 6l-10 2zM${f(60 + 14)} 40l-10 6l10 2z`} className={`${G} ea-blink`} strokeWidth=".8" /></>
        : <><Eye x={f(60 - 8)} y={44} r={3.6} /><Eye x={f(60 + 8)} y={44} r={3.6} /><Eye x={60} y={32} r={2.4} /></>}
      {v.d > 0.5 ? <path d={`M${f(60 - 8)} 60h16M${f(60 - 6)} 57v6M${f(60 - 1)} 57v6M${f(60 + 4)} 57v6M${f(60 + 9)} 57v6`} strokeWidth="1" opacity=".8" /> : <ellipse cx="60" cy="61" rx="5" ry={f(2 + v.b * 3)} className={VOID} strokeWidth="1.2" />}
      {v.big ? <path d={`M${f(60 - hw + 2)} ${top + 6}l-8-10M${f(60 + hw - 2)} ${top + 6}l8-10`} strokeWidth="2" /> : null}
    </>
  );
}


function ghost(v: V): ReactNode {
  const sub = v.k % 4;
  if (sub === 0) return ghostSheet(v);
  if (sub === 1) {
    // плавающая маска с лентами
    const hw = 20 + v.a * 8;
    const mouth = v.b > 0.5;
    return (
      <>
        {[-1, 0, 1, 2].map((i) => (
          <path key={i} className="ea-sway-s" style={{ animationDelay: `${i * 0.3}s` }} d={`M${f(60 + i * 9 - 4)} 62c${f(-6 + i * 3)} 14 ${f(8 - i * 4)} 22 ${f(i * 5)} ${f(40 + (i % 2) * 6)}`} strokeWidth="2.6" opacity=".8" />
        ))}
        <path d={`M${f(60 - hw + 7)} 22h${f(hw * 2)}l-3 36l-${f(hw * 2 - 6)} 0z`} strokeWidth="1.2" opacity=".35" className="ea-glitch" />
        <path d={`M${f(60 - hw)} 18Q60 6 ${f(60 + hw)} 18l-3 36q-${f(hw - 3)} 10 -${f(hw * 2 - 6)} 0z`} className={D} strokeWidth="2" />
        <path d={`M${f(60 - hw + 4)} 26h${f(hw * 2 - 8)}`} strokeWidth="1" opacity=".5" />
        <path d={`M${f(60 - 14)} 34l8 4l-8 3zM${f(60 + 14)} 34l-8 4l8 3z`} className={`${G} ea-blink`} strokeWidth=".8" />
        {mouth ? <path d={`M${f(60 - 8)} 50q8 7 16 0`} strokeWidth="1.6" /> : <path d={`M${f(60 - 8)} 50h16M${f(60 - 5)} 47v6M60 47v6M${f(60 + 5)} 47v6`} strokeWidth="1" />}
        <rect x={f(60 - hw - 2)} y="38" width={f(hw * 2 + 4)} height="3" className={`${S} ea-glitch`} stroke="none" />
        {v.big ? <path d={`M${f(60 - hw)} 20l-8-10M${f(60 + hw)} 20l8-10`} strokeWidth="2" /> : null}
      </>
    );
  }
  if (sub === 2) {
    // зеркальные осколки в силуэте человека
    const r = v.r;
    const jt = (n: number) => (r() - 0.5) * n;
    const parts: [number, number][][] = [
      [[60, 8], [74, 26], [60, 34], [46, 26]],
      [[44, 36], [60, 40], [56, 74], [38, 70]],
      [[64, 40], [82, 36], [84, 70], [62, 76]],
      [[36, 76], [56, 80], [50, 108], [30, 102]],
      [[64, 80], [84, 76], [92, 104], [68, 110]],
    ];
    const used = v.mini ? parts.slice(0, 3) : parts;
    return (
      <>
        {used.map((pts, i) => (
          <g key={i} className={`ea-drift ea-drift-${i % 3}`}>
            <polygon points={poly(pts.map((p) => [p[0] + jt(5), p[1] + jt(5)] as [number, number]))} className={i % 2 ? D : S} strokeWidth="1.7" />
            <path d={`M${f(pts[0]![0])} ${f(pts[0]![1] + 3)}L${f(pts[2]![0])} ${f(pts[2]![1] - 3)}`} strokeWidth=".8" opacity=".45" />
          </g>
        ))}
        <Eye x={54} y={22} r={2.8} />
        <Eye x={66} y={22} r={2.8} />
        {v.d > 0.4 ? <path d="M52 52h16M54 58h12" strokeWidth="1.2" opacity=".7" className="ea-glitch" /> : null}
        <rect x="30" y="56" width="62" height="3" className={`${G} ea-glitch`} stroke="none" opacity=".55" />
      </>
    );
  }
  // комета-шлейф
  const spikes = v.mini ? 4 : 6 + Math.floor(v.a * 3);
  return (
    <>
      <path d={`M18 104${Array.from({ length: spikes }, (_, i) => `l${f(8 + v.b * 3)} ${i % 2 ? 5 : -14}`).join('')}L84 40`} className={S} strokeWidth="1.6" opacity=".75" />
      <path d="M12 100L30 88L24 84L46 70L40 64L62 52" strokeWidth="2" className="ea-glitch" opacity=".6" />
      <circle cx="86" cy="38" r={f(15 + v.c * 5)} className={D} strokeWidth="2" />
      <path d="M86 18l-4 8M100 24l-6 6M104 38h-8" strokeWidth="2" />
      <Eye x={82} y={36} r={3.4} />
      <Eye x={93} y={36} r={2.6} />
      <path d="M78 46q8 5 16 0" strokeWidth="1.6" />
    </>
  );
}

/* ---------- BEAST: четвероногий зверь (смотрит влево) ---------- */
function beast(v: V): ReactNode {
  const bl = 27 + v.a * 8;
  const bh = 14 + v.b * 4;
  const cx = 70;
  const cy = 70;
  const ear = v.k % 3;
  const tail = (v.k >> 2) % 3;
  const heads = v.boss ? 3 : 1;
  const HEADS: [number, number, number][] = [[28, 56, 1], [16, 32, 0.74], [44, 24, 0.74]];
  const headAt = (i: number) => {
    const [hx, hy, sc] = HEADS[i]!;
    return (
      <g key={i} className="ea-bob-s" style={{ animationDelay: `${i * 0.6}s` }}>
        {i > 0 ? <path d={`M${f(cx - bl + 10)} ${cy - 8}Q${f((hx + cx - bl) / 2 + 8)} ${f(hy + 24)} ${f(hx + 10)} ${f(hy + 8)}`} strokeWidth="6" opacity=".9" /> : null}
        <g transform={`translate(${hx} ${hy}) scale(${sc})`}>
          {ear === 0 ? <path d="M6 -14l-2 -12l10 8zM18 -16l4 -12l4 12z" className={D} strokeWidth="1.5" /> : ear === 1 ? <><circle cx="6" cy="-10" r="6" className={D} strokeWidth="1.5" /><circle cx="20" cy="-12" r="5" className={D} strokeWidth="1.5" /></> : <path d="M2 -12l-6 -16l14 10zM22 -16l6 -14l-2 16z" className={S} strokeWidth="1.5" />}
          <path d="M-18 6l16 -14l22 2l8 18l-12 14l-26 0z" className={D} strokeWidth="1.9" />
          <path d="M-18 8l6 5l4 -5l5 5l4 -5" strokeWidth="1.2" opacity=".9" />
          <Eye x={6} y={-1} r={3} slit />
          {v.big && i === 0 ? <Eye x={14} y={4} r={2} /> : null}
        </g>
      </g>
    );
  };
  const leg = (x: number, front: boolean, delay: number) => (
    <g key={x} className="ea-leg" style={{ animationDelay: `${delay}s`, transformOrigin: `${x}px ${cy + 6}px` }}>
      <path d={`M${x} ${cy + 4}l${front ? -3 : 3} 16l${front ? 4 : -4} 18`} strokeWidth="5" opacity=".92" />
      <path d={`M${x + (front ? 1 : -1)} ${cy + 38}l${front ? -6 : 6} 2`} strokeWidth="3" className="ea-foot" />
    </g>
  );
  return (
    <>
      {/* хвост */}
      {tail === 0 ? <path d={`M${cx + bl - 4} ${cy - 4}c18-4 22-22 12-34`} strokeWidth="3.4" /> : null}
      {tail === 0 ? <polygon points={poly([[cx + bl + 6, cy - 40], [cx + bl + 16, cy - 36], [cx + bl + 10, cy - 28]])} className={G} strokeWidth="1" /> : null}
      {tail === 1 ? <g className="ea-sway-s">{[-14, 0, 12].map((a, i) => <path key={i} d={`M${cx + bl - 4} ${cy}q18 ${a} 26 ${a * 2 - 4}`} strokeWidth="1.8" />)}<circle cx={cx + bl + 22} cy={cy - 18} r="2" className={`${G} ea-blink`} stroke="none" /></g> : null}
      {tail === 2 ? <><path d={`M${cx + bl - 4} ${cy - 2}c14 0 18 -10 14 -22`} strokeWidth="3.6" /><circle cx={cx + bl + 8} cy={cy - 30} r="7" className={D} strokeWidth="1.8" /><path d={`M${cx + bl + 8} ${cy - 38}v-4M${cx + bl + 14} ${cy - 30}h4M${cx + bl + 2} ${cy - 30}h-4`} strokeWidth="1.5" /></> : null}
      {leg(cx - bl + 10, true, 0.4)}
      {leg(cx + bl - 8, false, 0)}
      {/* тело */}
      <ellipse cx={cx} cy={cy} rx={f(bl)} ry={f(bh)} className={D} strokeWidth="2" />
      <path d={`M${f(cx - bl + 8)} ${f(cy - bh + 2)}${Array.from({ length: v.mini ? 3 : 6 }, (_, i) => `l${f(bl / 4.2)} -${v.big ? 9 : 6}l${f(bl / 6)} ${v.big ? 9 : 6}`).join('')}`} strokeWidth="1.5" className={S} />
      <path d={`M${f(cx - bl * 0.5)} ${cy + 3}h${f(bl)}`} strokeWidth=".9" opacity=".5" strokeDasharray="3 3" />
      <circle cx={cx + 6} cy={cy - 2} r="3.4" className={`${G} ea-blink`} stroke="none" />
      {leg(cx - bl + 22, true, 0.8)}
      {leg(cx + bl - 20, false, 0.2)}
      {Array.from({ length: heads }, (_, i) => headAt(i))}
    </>
  );
}

/* ---------- CORE: ядро/реактор/монолит ---------- */
function core(v: V): ReactNode {
  const kind = v.k % 4;
  const R = (v.mini ? 20 : 25) + v.a * 8;
  const cy = 54;
  const sides = [6, 4, 8, 0][kind]!;
  const shape = (rad: number, rot = 0) => {
    if (sides === 0) return null;
    return poly(Array.from({ length: sides }, (_, i) => {
      const a = (i / sides) * Math.PI * 2 + rot + (sides === 4 ? Math.PI / 4 : sides === 6 ? Math.PI / 6 : Math.PI / 8);
      return [60 + Math.cos(a) * rad, cy + Math.sin(a) * rad] as [number, number];
    }));
  };
  const rings = v.mini ? 1 : 1 + Math.floor(v.b * 2.5) + (v.boss ? 1 : 0);
  const fins = v.mini ? 0 : 6 + Math.floor(v.c * 6);
  const legs = (v.k >> 2) % 3;
  return (
    <>
      {/* опора */}
      {legs === 0 ? <path d={`M${f(60 - R * 0.6)} ${f(cy + R)}L38 104M${f(60 + R * 0.6)} ${f(cy + R)}L82 104M60 ${f(cy + R)}V104`} strokeWidth="3.4" /> : null}
      {legs === 1 ? <path d={`M${f(60 - 10)} ${f(cy + R - 2)}l-4 ${f(104 - cy - R)}h28l-4-${f(104 - cy - R)}`} className={D} strokeWidth="1.8" /> : null}
      {legs === 2 ? <path d={`M${f(60 - R * 0.8)} ${f(cy + R * 0.6)}c-14 10-12 26-6 40M${f(60 + R * 0.8)} ${f(cy + R * 0.6)}c14 10 12 26 6 40`} strokeWidth="3" /> : null}
      <path d="M32 106h56l-6-6H38z" className={D} strokeWidth="1.8" />
      {/* радиаторные рёбра */}
      {Array.from({ length: fins }, (_, i) => {
        const a = (i / fins) * Math.PI * 2;
        const x1 = 60 + Math.cos(a) * (R + 1);
        const y1 = cy + Math.sin(a) * (R + 1);
        const L = 5 + ((i * 5) % 4) * 1.6;
        return <path key={i} d={`M${f(x1)} ${f(y1)}L${f(60 + Math.cos(a) * (R + L))} ${f(cy + Math.sin(a) * (R + L))}`} strokeWidth={v.big ? 3.2 : 2.4} opacity=".8" />;
      })}
      {/* кольца */}
      {Array.from({ length: rings }, (_, i) => (
        <g key={i} transform={`rotate(${f(-30 + i * 55 + v.d * 40)} 60 ${cy})`}>
          <g className={i % 2 ? 'ea-spin-rev' : 'ea-spin-slow'}>
            <ellipse cx="60" cy={cy} rx={f(R + 13 + i * 5)} ry={f(8 + i * 3)} strokeWidth="1.4" opacity=".75" strokeDasharray={i % 2 ? '2 5' : undefined} />
            <circle cx={f(60 + R + 13 + i * 5)} cy={cy} r="2.4" className={G} stroke="none" />
          </g>
        </g>
      ))}
      {v.boss ? (() => {
        const sub = (v.k >> 6) % 3;
        return sub === 0 ? (
          <>
            <rect x="14" y="26" width="12" height="78" rx="2" className={D} strokeWidth="1.8" />
            <rect x="94" y="26" width="12" height="78" rx="2" className={D} strokeWidth="1.8" />
            <rect x="17" y="30" width="6" height="4" className={`${G} ea-blink`} stroke="none" />
            <rect x="97" y="30" width="6" height="4" className={`${G} ea-blink`} stroke="none" />
          </>
        ) : sub === 1 ? (
          <path d={`M60 ${f(cy - R)}V-6M${f(60 - 10)} 6l10-12l10 12M${f(60 - 16)} ${f(cy - R - 6)}l16-10l16 10`} strokeWidth="2.2" />
        ) : (
          <>
            {[[16, 22], [104, 22], [12, 92], [108, 92]].map(([x, y], i) => (
              <g key={i}><path d={`M${x} ${y}L60 ${cy}`} strokeWidth="1.2" opacity=".5" /><circle cx={x} cy={y} r="5" className={S} strokeWidth="1.6" /><circle cx={x} cy={y} r="2" className={`${G} ea-blink`} stroke="none" /></g>
            ))}
          </>
        );
      })() : null}
      {/* оболочка */}
      {sides === 0 ? <circle cx="60" cy={cy} r={R} className={D} strokeWidth="2.2" /> : <polygon points={shape(R)!} className={D} strokeWidth="2.2" />}
      {sides === 0 ? <circle cx="60" cy={cy} r={f(R * 0.78)} className={S} strokeWidth="1.2" /> : <polygon points={shape(R * 0.78, 0.0)!} className={S} strokeWidth="1.2" />}
      {!v.mini ? <path d={`M${f(60 - R * 0.55)} ${f(cy - R * 0.2)}h${f(R * 1.1)}M${f(60 - R * 0.55)} ${f(cy + R * 0.2)}h${f(R * 1.1)}`} strokeWidth=".8" opacity=".55" /> : null}
      <circle cx="60" cy={cy} r={f(R * 0.36)} className={VOID} strokeWidth="1.4" />
      <circle cx="60" cy={cy} r={f(R * 0.24)} className={`${G} ea-core`} stroke="none" />
      <circle cx={f(60 - R * 0.07)} cy={f(cy - R * 0.07)} r={f(R * 0.07)} fill="#fff" stroke="none" />
      {v.d > 0.4 && !v.mini ? <><rect x={f(60 - R * 0.9)} y={f(cy - 3)} width="5" height="6" className={`${G} ea-blink`} stroke="none" /><rect x={f(60 + R * 0.9 - 5)} y={f(cy - 3)} width="5" height="6" className={`${G} ea-blink`} stroke="none" /></> : null}
    </>
  );
}

const FAMILY: Record<ArtFamily, (v: V) => ReactNode> = { drone, bot, worm, eye, daemon, construct, swarm, ghost, beast, core };

/* ---------- Оформление тира ---------- */
function tierFrame(tier: Tier, uid: string, k: number): { back: ReactNode; front: ReactNode } {
  if (tier === 'elite') {
    const crown = k % 3;
    return {
      back: (
        <>
          <circle cx="60" cy="60" r="58" fill={`url(#${uid}a)`} stroke="none" />
          <circle cx="60" cy="60" r="56" className="ea-pulse" strokeWidth="1.2" strokeDasharray="3 5" opacity=".6" />
        </>
      ),
      front: (
        <>
          {crown === 0 ? <path d="M44 7l5 8l5-11l6 11l5-11l5 11l5-8" className={S} strokeWidth="1.8" /> : crown === 1 ? <path d="M40 10h40M46 10l-4-8M60 10v-9M74 10l4-8" strokeWidth="2" /> : <path d="M44 12l8-10l8 8l8-8l8 10z" className={S} strokeWidth="1.6" />}
          <path d="M4 20l12 4v10M116 20l-12 4v10M4 102l12-4v-10M116 102l-12-4v-10" strokeWidth="2" opacity=".85" />
          <path d="M8 60l8-6v12zM112 60l-8-6v12z" className={G} stroke="none" opacity=".8" />
        </>
      ),
    };
  }
  if (tier === 'boss') {
    const wings = 2 + (k % 3);
    return {
      back: (
        <>
          <circle cx="60" cy="58" r="68" fill={`url(#${uid}a)`} stroke="none" />
          <g className="ea-spin-slow"><circle cx="60" cy="58" r="64" strokeWidth=".9" strokeDasharray="1 7" opacity=".8" /></g>
          <g className="ea-spin-rev"><circle cx="60" cy="58" r="58" strokeWidth="1.1" strokeDasharray="14 10" opacity=".45" /></g>
          {Array.from({ length: wings }, (_, i) => (
            <g key={i}>
              <path d={`M${f(18 - i * 2)} ${f(50 + i * 12)}L${f(-6 - i * 4)} ${f(34 + i * 18)}L${f(14)} ${f(58 + i * 12)}z`} className={S} strokeWidth="1.5" opacity=".9" />
              <path d={`M${f(102 + i * 2)} ${f(50 + i * 12)}L${f(126 + i * 4)} ${f(34 + i * 18)}L${f(106)} ${f(58 + i * 12)}z`} className={S} strokeWidth="1.5" opacity=".9" />
            </g>
          ))}
          <ellipse cx="60" cy="110" rx="50" ry="5" strokeWidth="1.2" opacity=".6" />
          <ellipse cx="60" cy="110" rx="36" ry="3.4" strokeWidth="1" opacity=".5" />
        </>
      ),
      front: (
        <g className="ea-crown">
          <path d="M36 8l5 10l6-14l7 14l6-18l6 18l7-14l6 14l5-10l-3 14H39z" className={S} strokeWidth="1.8" />
          <circle cx="60" cy="1" r="2.4" className={G} stroke="none" />
          <path d="M60 4v10" strokeWidth="1.2" />
        </g>
      ),
    };
  }
  return { back: null, front: null };
}

export const EnemyArt = memo(function EnemyArt({ defId, tier }: { defId: string; tier: Tier }) {
  const uid = useId().replace(/:/g, '');
  const { family, accent, tier: t } = resolveArt(defId, tier);
  const mini = defId.startsWith('minion_');
  const h = hash(defId);
  const r = rng(h ^ 0x9e3779b9);
  const v: V = { r, a: r(), b: r(), c: r(), d: r(), k: h >>> 5, tier: t, mini, big: t !== 'normal', boss: t === 'boss' };
  const { back, front } = mini ? { back: null, front: null } : tierFrame(t, uid, h >>> 9);
  return (
    <svg
      className={`unit-art unit-art--enemy ea ea-${family} ea-tier-${t}${mini ? ' ea-mini' : ''}`}
      viewBox="0 0 120 120"
      fill="none"
      stroke="currentColor"
      strokeLinejoin="round"
      strokeLinecap="round"
      style={{ color: ACCENT_VAR[accent] }}
      data-family={family}
      aria-hidden="true"
    >
      <defs>
        <radialGradient id={`${uid}a`}>
          <stop offset="0.55" stopColor="currentColor" stopOpacity="0" />
          <stop offset="1" stopColor="currentColor" stopOpacity={t === 'boss' ? 0.14 : 0.16} />
        </radialGradient>
      </defs>
      {back}
      <g className={mini ? 'ea-body ea-mini-body' : 'ea-body'}>{FAMILY[family](v)}</g>
      {front}
    </svg>
  );
});
