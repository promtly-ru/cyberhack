import { memo, useId, type ReactNode } from 'react';
import { cardStats } from '../game/engine';
import { hash, r2, rng } from '../ui/rand';

/**
 * «Иллюстрация» карты — процедурный SVG: фон-мотив класса + главная композиция по эффекту карты +
 * слой редкости (голограмма/фольга) и метки улучшения. Всё детерминировано по id карты.
 * Цвета: --accent / --accent-2 карты через CSS-классы (k2, f1, f2, fsoft, fill-bg).
 */
const W = 100;
const H = 64;
const CX = 50;
const CY = 32;

type Rand = () => number;
type Motif = (r: Rand) => ReactNode[];

const P = (n: number) => r2(n);
const pol = (cx: number, cy: number, rad: number, n: number, rot = 0, sq = 1) => {
  let d = '';
  for (let k = 0; k < n; k++) {
    const a = rot + (k / n) * Math.PI * 2;
    d += `${k ? 'L' : 'M'}${P(cx + Math.cos(a) * rad)} ${P(cy + Math.sin(a) * rad * sq)}`;
  }
  return `${d}Z`;
};

/* ===================== ФОНЫ КЛАССОВ ===================== */

function bgNetrunner(r: Rand): ReactNode[] {
  const out: ReactNode[] = [];
  for (let c = 0; c < 12; c++) {
    const x = c * 8.6 + 2;
    const len = 3 + Math.floor(r() * 6);
    const y0 = r() * 24 - 6;
    for (let k = 0; k < len; k++) {
      out.push(
        <text key={`t${c}-${k}`} x={P(x)} y={P(y0 + k * 6.5)} fontSize="5.2" fontFamily="monospace" stroke="none" className={k === len - 1 ? 'f2' : 'f1'} opacity={P(0.12 + (k / len) * 0.5)}>
          {r() < 0.5 ? '0' : '1'}
        </text>,
      );
    }
  }
  const nodes: [number, number][] = [];
  for (let i = 0; i < 6; i++) nodes.push([P(8 + r() * 84), P(8 + r() * 48)]);
  nodes.forEach(([x, y], i) => {
    const nx = nodes[(i + 1) % nodes.length];
    if (nx) out.push(<path key={`l${i}`} d={`M${x} ${y}L${nx[0]} ${nx[1]}`} strokeWidth=".5" opacity=".45" className="k2" />);
    out.push(<circle key={`n${i}`} cx={x} cy={y} r={1.4} className="f2" opacity=".7" />);
  });
  return out;
}

function bgPhreaker(r: Rand): ReactNode[] {
  const out: ReactNode[] = [];
  const ax = P(18 + r() * 64);
  out.push(<path key="mast" d={`M${ax} 64V26M${ax - 5} 64l5-38 5 38M${ax - 3} 50h6M${ax - 4} 40h8`} strokeWidth=".9" opacity=".6" />);
  out.push(<circle key="tip" cx={ax} cy={24} r={1.8} className="f2" />);
  for (let i = 1; i <= 5; i++) {
    const rad = 5 + i * 7;
    out.push(<path key={`a${i}`} d={`M${P(ax - rad * 0.7)} ${P(24 - rad * 0.7)}A${rad} ${rad} 0 0 1 ${P(ax + rad * 0.7)} ${P(24 - rad * 0.7)}`} strokeWidth=".8" opacity={P(0.7 - i * 0.1)} className={i % 2 ? 'k2' : undefined} strokeDasharray={i > 2 ? '3 2' : undefined} />);
  }
  for (let i = 0; i < 18; i++) {
    const h = 1 + r() * 7;
    out.push(<rect key={`e${i}`} x={i * 5.6 + 1} y={P(62 - h)} width={2.4} height={P(h)} className="fsoft" stroke="none" opacity=".8" />);
  }
  return out;
}

function bgGhost(r: Rand): ReactNode[] {
  const out: ReactNode[] = [];
  for (let i = 0; i < 4; i++) {
    out.push(<ellipse key={`f${i}`} cx={P(r() * W)} cy={P(14 + r() * 40)} rx={P(22 + r() * 22)} ry={P(4 + r() * 5)} className="fsoft" stroke="none" opacity={P(0.5 + r() * 0.4)} />);
  }
  const mx = P(70 + (r() - 0.5) * 16);
  out.push(<path key="mask" d={`M${mx - 11} 14c0-6 5-8 11-8s11 2 11 8c0 12-5 24-11 24s-11-12-11-24z`} strokeWidth=".9" opacity=".55" />);
  out.push(<path key="eyes" d={`M${mx - 7} 17l5 2.5M${mx + 7} 17l-5 2.5M${mx - 3} 29q3 2.5 6 0`} strokeWidth=".9" opacity=".7" className="k2" />);
  for (let i = 0; i < 5; i++) out.push(<path key={`w${i}`} d={`M${P(r() * W)} ${P(40 + r() * 20)}q6-8 12 0t12 0`} strokeWidth=".6" opacity=".4" />);
  return out;
}

function bgSamurai(r: Rand): ReactNode[] {
  const out: ReactNode[] = [];
  const sx = P(28 + r() * 44);
  out.push(<circle key="sun" cx={sx} cy={30} r={P(17 + r() * 4)} className="fsoft" strokeWidth=".7" opacity=".85" />);
  for (let i = 0; i < 4; i++) out.push(<path key={`sl${i}`} d={`M${sx - 22} ${22 + i * 6}H${sx + 22}`} stroke="#04050c" strokeWidth={P(0.8 + i * 0.5)} opacity=".9" />);
  // «иероглифы»: блоки из штрихов
  for (let g = 0; g < 3; g++) {
    const gx = 6 + g * 7 + (g === 2 ? 80 : 0);
    let d = '';
    for (let s = 0; s < 4; s++) {
      const y = 6 + s * 8 + r() * 3;
      d += r() < 0.5 ? `M${gx} ${P(y)}h${P(3 + r() * 4)}` : `M${P(gx + 2 + r() * 3)} ${P(y - 2)}v${P(4 + r() * 4)}`;
    }
    out.push(<path key={`kj${g}`} d={d} strokeWidth="1.1" opacity=".55" className="k2" />);
  }
  out.push(<path key="gr" d="M0 56l18-10 14 6 20-14 22 12 26-8v22H0z" className="fill-bg" strokeWidth=".7" opacity=".85" />);
  return out;
}

function gearPath(cx: number, cy: number, ro: number, ri: number, teeth: number, rot: number): string {
  let d = '';
  for (let k = 0; k < teeth; k++) {
    const a0 = rot + (k / teeth) * Math.PI * 2;
    const da = (Math.PI * 2) / teeth;
    const pts = [
      [a0, ri],
      [a0 + da * 0.2, ro],
      [a0 + da * 0.5, ro],
      [a0 + da * 0.7, ri],
    ] as const;
    pts.forEach(([a, rad], j) => {
      d += `${k === 0 && j === 0 ? 'M' : 'L'}${P(cx + Math.cos(a) * rad)} ${P(cy + Math.sin(a) * rad)}`;
    });
  }
  return `${d}Z`;
}

function bgEngineer(r: Rand): ReactNode[] {
  const out: ReactNode[] = [];
  const g: [number, number, number, number][] = [
    [P(22 + r() * 10), P(20 + r() * 8), 17, 9],
    [P(70 + r() * 12), P(44 + r() * 8), 14, 8],
    [P(84 + r() * 6), P(12 + r() * 6), 9, 6],
  ];
  g.forEach(([x, y, ro, n], i) => {
    out.push(<path key={`g${i}`} d={gearPath(x, y, ro, ro * 0.8, n, r() * 3)} strokeWidth=".9" opacity={P(0.5 - i * 0.08)} className={i === 1 ? 'k2' : undefined} />);
    out.push(<circle key={`gh${i}`} cx={x} cy={y} r={P(ro * 0.32)} strokeWidth=".8" opacity=".6" />);
    out.push(<circle key={`gc${i}`} cx={x} cy={y} r={1.2} className="f2" />);
  });
  for (let i = 0; i < 8; i++) out.push(<circle key={`bo${i}`} cx={P(r() * W)} cy={P(r() * H)} r={1} className="f1" opacity=".5" />);
  return out;
}

function bgBio(r: Rand): ReactNode[] {
  const out: ReactNode[] = [];
  const ph = r() * 6.28;
  let a = '';
  let b = '';
  for (let x = -2; x <= W + 2; x += 2) {
    const y1 = CY + Math.sin(x * 0.11 + ph) * 18;
    const y2 = CY - Math.sin(x * 0.11 + ph) * 18;
    a += `${x === -2 ? 'M' : 'L'}${x} ${P(y1)}`;
    b += `${x === -2 ? 'M' : 'L'}${x} ${P(y2)}`;
    if (Math.round(x) % 8 === 0) out.push(<path key={`r${x}`} d={`M${x} ${P(y1)}L${x} ${P(y2)}`} strokeWidth=".6" opacity={P(0.25 + Math.abs(Math.cos(x * 0.11 + ph)) * 0.5)} />);
  }
  out.push(<path key="h1" d={a} strokeWidth="1.2" opacity=".6" />, <path key="h2" d={b} strokeWidth="1.2" opacity=".6" className="k2" />);
  for (let i = 0; i < 7; i++) out.push(<circle key={`c${i}`} cx={P(r() * W)} cy={P(r() * H)} r={P(1 + r() * 3)} className="fsoft" strokeWidth=".5" opacity=".8" />);
  return out;
}

function bgNeutral(r: Rand): ReactNode[] {
  const out: ReactNode[] = [];
  const s = 8;
  const hw = Math.sqrt(3) * s;
  for (let row = -1; row < 8; row++) {
    for (let col = -1; col < 9; col++) {
      if (r() > 0.45) continue;
      out.push(<path key={`${row}-${col}`} d={pol(col * hw + (row % 2 ? hw / 2 : 0), row * s * 1.5, s * 0.92, 6, Math.PI / 6)} strokeWidth=".6" opacity={P(0.2 + r() * 0.35)} className={r() < 0.12 ? 'fsoft' : undefined} />);
    }
  }
  return out;
}

const BG: Record<string, Motif> = {
  netrunner: bgNetrunner,
  phreaker: bgPhreaker,
  ghost: bgGhost,
  samurai: bgSamurai,
  engineer: bgEngineer,
  biohacker: bgBio,
  droneop: bgEngineer,
  chrono: bgNetrunner,
  vabanker: bgNeutral,
  neutral: bgNeutral,
};

/* ===================== ГЛАВНЫЕ МОТИВЫ ===================== */

/** Клинки: несколько скрещённых сужающихся лезвий и искры. */
function blades(r: Rand): ReactNode[] {
  const out: ReactNode[] = [];
  const n = 2 + Math.floor(r() * 2);
  for (let i = 0; i < n; i++) {
    const ang = -0.9 + (i / n) * 1.8 + (r() - 0.5) * 0.4;
    const len = 38 + r() * 12;
    const w = 2.4 + r() * 1.8;
    const ox = CX + (r() - 0.5) * 10;
    const oy = CY + (r() - 0.5) * 6;
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    const px = -sa;
    const py = ca;
    const tip = [ox + ca * len, oy + sa * len];
    const tail = [ox - ca * len, oy - sa * len];
    const d = `M${P(tail[0] ?? 0)} ${P(tail[1] ?? 0)}L${P(ox + px * w)} ${P(oy + py * w)}L${P(tip[0] ?? 0)} ${P(tip[1] ?? 0)}L${P(ox - px * w)} ${P(oy - py * w)}Z`;
    out.push(<path key={`b${i}`} d={d} className={i % 2 ? 'fsoft' : 'fill-bg'} strokeWidth="1.1" />);
    out.push(<path key={`e${i}`} d={`M${P(tail[0] ?? 0)} ${P(tail[1] ?? 0)}L${P(tip[0] ?? 0)} ${P(tip[1] ?? 0)}`} strokeWidth=".6" stroke="#fff" opacity=".7" />);
    out.push(<path key={`s${i}`} d={`M${P(tip[0] ?? 0)} ${P(tip[1] ?? 0)}l${P(ca * 6)} ${P(sa * 6)}`} strokeWidth="1" className="k2" />);
  }
  for (let i = 0; i < 14; i++) {
    const a = r() * 6.28;
    const d0 = 4 + r() * 8;
    out.push(<path key={`sp${i}`} d={`M${P(CX + Math.cos(a) * d0)} ${P(CY + Math.sin(a) * d0)}l${P(Math.cos(a) * (3 + r() * 9))} ${P(Math.sin(a) * (3 + r() * 9))}`} strokeWidth={P(0.5 + r() * 0.8)} className={r() < 0.4 ? 'k2' : undefined} opacity=".85" />);
  }
  out.push(<circle key="hit" cx={CX} cy={CY} r={2.4} className="f2" />);
  return out;
}

/** Луч: яркий горизонтальный разряд с ударной вспышкой. */
function beam(r: Rand): ReactNode[] {
  const inner = beamInner(r);
  const ang = P((r() - 0.5) * 50);
  return [<g key="rot" transform={`rotate(${ang} ${CX} ${CY}) scale(1.15)`} style={{ transformOrigin: `${CX}px ${CY}px` }}>{inner}</g>];
}

function beamInner(r: Rand): ReactNode[] {
  const out: ReactNode[] = [];
  const y = P(CY + (r() - 0.5) * 12);
  const tx = P(66 + r() * 12);
  out.push(<path key="g" d={`M0 ${y - 5}L${tx} ${y - 1}V${y + 1}L0 ${y + 5}Z`} className="fsoft" strokeWidth=".5" opacity=".9" />);
  out.push(<path key="c" d={`M0 ${y - 1.6}L${tx} ${y - 0.4}V${y + 0.4}L0 ${y + 1.6}Z`} className="f2" stroke="none" />);
  out.push(<path key="w" d={`M0 ${y}H${tx}`} stroke="#fff" strokeWidth=".9" />);
  for (let i = 0; i < 4; i++) {
    const x0 = 6 + i * 14 + r() * 6;
    out.push(<path key={`z${i}`} d={`M${P(x0)} ${y}l3 ${P(-4 - r() * 5)}l3 ${P(8 + r() * 6)}l3 ${P(-6)}`} strokeWidth=".8" className="k2" opacity=".7" />);
  }
  for (let i = 0; i < 12; i++) {
    const a = r() * 6.28;
    out.push(<path key={`f${i}`} d={`M${tx} ${y}l${P(Math.cos(a) * (6 + r() * 16))} ${P(Math.sin(a) * (6 + r() * 16))}`} strokeWidth={P(0.5 + r())} opacity=".8" className={i % 3 === 0 ? 'k2' : undefined} />);
  }
  out.push(<circle key="fl" cx={tx} cy={y} r={7} className="fsoft" strokeWidth="1" />, <circle key="fl2" cx={tx} cy={y} r={3} className="f2" />, <circle key="fl3" cx={tx} cy={y} r={1.2} fill="#fff" stroke="none" />);
  return out;
}

/** Взрыв: ударные кольца, лучи и осколки. */
function shatter(r: Rand): ReactNode[] {
  const out: ReactNode[] = [];
  const cx = P(CX + (r() - 0.5) * 14);
  const cy = P(CY + (r() - 0.5) * 6);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + r() * 0.4;
    const d0 = 5 + r() * 6;
    const d1 = d0 + 12 + r() * 20;
    const x = cx + Math.cos(a) * d1;
    const y = cy + Math.sin(a) * d1 * 0.75;
    const s = 3 + r() * 5;
    out.push(<path key={`c${i}`} d={`M${cx} ${cy}L${P(x)} ${P(y)}`} strokeWidth=".7" opacity=".6" className="k2" />);
    out.push(<path key={`sh${i}`} d={`M${P(x - s)} ${P(y)}L${P(x)} ${P(y - s * 0.8)}L${P(x + s * 0.9)} ${P(y + s * 0.3)}L${P(x - s * 0.2)} ${P(y + s)}Z`} className={i % 3 === 0 ? 'f2' : i % 2 ? 'fsoft' : 'fill-bg'} strokeWidth="1.1" transform={`rotate(${P(r() * 90)} ${P(x)} ${P(y)})`} />);
  }
  out.push(<path key="core" d={pol(cx, cy, 9, 7, r())} className="f2" strokeWidth="1.2" />, <path key="core2" d={pol(cx, cy, 4.5, 7, r())} fill="#fff" stroke="none" />);
  out.push(<circle key="r" cx={cx} cy={cy} r={30} strokeWidth=".6" strokeDasharray="1 4" opacity=".6" />);
  return out;
}

function blast(r: Rand): ReactNode[] {
  if (r() < 0.45) return shatter(r);
  const out: ReactNode[] = [];
  const cx = P(CX + (r() - 0.5) * 18);
  const cy = P(CY + (r() - 0.5) * 8);
  [26, 19, 12].forEach((rad, i) =>
    out.push(<circle key={`ring${i}`} cx={cx} cy={cy} r={rad} strokeWidth={P(0.5 + i * 0.4)} opacity={P(0.35 + i * 0.2)} strokeDasharray={i === 0 ? '2 3' : undefined} className={i === 1 ? 'k2' : undefined} />),
  );
  const n = 14 + Math.floor(r() * 8);
  let star = '';
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2;
    const rad = i % 2 ? 6 + r() * 3 : 12 + r() * 14;
    star += `${i ? 'L' : 'M'}${P(cx + Math.cos(a) * rad)} ${P(cy + Math.sin(a) * rad)}`;
  }
  out.push(<path key="star" d={`${star}Z`} className="fsoft" strokeWidth="1.1" />);
  out.push(<path key="star2" d={pol(cx, cy, 8, 10, r() * 3)} className="f2" stroke="none" opacity=".9" />);
  out.push(<circle key="core" cx={cx} cy={cy} r={3.2} fill="#fff" stroke="none" />);
  for (let i = 0; i < 16; i++) {
    const a = r() * 6.28;
    const d0 = 16 + r() * 22;
    out.push(<path key={`d${i}`} d={`M${P(cx + Math.cos(a) * d0)} ${P(cy + Math.sin(a) * d0 * 0.7)}l${P(Math.cos(a) * 3)} ${P(Math.sin(a) * 2)}l1.4 -1.6z`} className={i % 2 ? 'f2' : 'f1'} />);
  }
  return out;
}

/** Щит: гексагональный щит с сеткой и шевронами. */
function shield(r: Rand): ReactNode[] {
  const v = Math.floor(r() * 3);
  if (v === 1) return buckler(r);
  if (v === 2) return hexShield(r);
  const out: ReactNode[] = [];
  const cx = P(CX + (r() - 0.5) * 8);
  const s = 'M0 -26L20 -19V-2C20 12 10 22 0 27C-10 22-20 12-20-2V-19Z';
  out.push(<g key="sh" transform={`translate(${cx} ${CY})`}>
    <path d="M0 -29L24 -21V-2C24 14 12 25 0 31C-12 25-24 14-24-2V-21Z" strokeWidth=".6" opacity=".5" className="k2" strokeDasharray="2 2" />
    <path d={s} className="fill-bg" strokeWidth="1.6" />
    <path d={s} className="fsoft" stroke="none" />
    <path d="M0 -26V27M-20-10H20M-17 6H17" strokeWidth=".5" opacity=".5" />
    <path d="M-10-4l10 8 10-8M-10-12l10 8 10-8" strokeWidth="1.5" className="k2" />
    <path d="M-12-20L-3-23" strokeWidth="1" stroke="#fff" opacity=".7" />
  </g>);
  for (let i = 0; i < 8; i++) {
    const a = -0.9 + (i / 7) * 1.8 + Math.PI / 2;
    out.push(<path key={`imp${i}`} d={`M${P(CX + Math.cos(a) * 33)} ${P(CY + Math.sin(a) * 33 * 0.9)}l${P(Math.cos(a) * -4)} ${P(Math.sin(a) * -4)}`} strokeWidth="1" opacity=".5" />);
  }
  return out;
}

function buckler(r: Rand): ReactNode[] {
  const out: ReactNode[] = [];
  const cx = P(CX + (r() - 0.5) * 10);
  out.push(<circle key="o" cx={cx} cy={CY} r={27} strokeWidth=".6" strokeDasharray="1.5 3" opacity=".6" className="k2" />);
  out.push(<circle key="a" cx={cx} cy={CY} r={22} className="fill-bg" strokeWidth="2" />);
  out.push(<circle key="b" cx={cx} cy={CY} r={16} className="fsoft" strokeWidth="1" />);
  out.push(<circle key="c" cx={cx} cy={CY} r={9} strokeWidth="1.4" className="k2" />);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    out.push(<path key={`s${i}`} d={`M${P(cx + Math.cos(a) * 9)} ${P(CY + Math.sin(a) * 9)}L${P(cx + Math.cos(a) * 22)} ${P(CY + Math.sin(a) * 22)}`} strokeWidth=".6" opacity=".6" />);
    out.push(<circle key={`r${i}`} cx={P(cx + Math.cos(a) * 19)} cy={P(CY + Math.sin(a) * 19)} r={1.2} className="f1" />);
  }
  out.push(<path key="bo" d={pol(cx, CY, 5, 6, 0)} className="f2" stroke="none" />);
  out.push(<path key="hl" d={`M${cx - 15} ${CY - 12}A19 19 0 0 1 ${cx - 4} ${CY - 20}`} stroke="#fff" strokeWidth="1.2" opacity=".7" />);
  return out;
}

function hexShield(r: Rand): ReactNode[] {
  const out: ReactNode[] = [];
  const cx = P(CX + (r() - 0.5) * 8);
  for (let ring = 0; ring < 3; ring++) {
    out.push(<path key={`h${ring}`} d={pol(cx, CY, 28 - ring * 8, 6, Math.PI / 6)} className={ring === 1 ? 'fsoft' : 'fill-bg'} strokeWidth={P(1.8 - ring * 0.4)} opacity={P(1 - ring * 0.1)} />);
  }
  for (let k = 0; k < 6; k++) {
    const a = Math.PI / 6 + (k / 6) * Math.PI * 2;
    out.push(<path key={`sp${k}`} d={`M${cx} ${CY}L${P(cx + Math.cos(a) * 28)} ${P(CY + Math.sin(a) * 28)}`} strokeWidth=".6" opacity=".5" />);
    if (r() < 0.5) out.push(<path key={`c${k}`} d={pol(P(cx + Math.cos(a) * 17), P(CY + Math.sin(a) * 17), 3.4, 6, 0)} className="f2" stroke="none" opacity=".85" />);
  }
  out.push(<circle key="core" cx={cx} cy={CY} r={3} className="f1" />);
  return out;
}

/** Сеть/файрвол: кирпичная стена с проломом энергии. */
function firewall(r: Rand): ReactNode[] {
  const out: ReactNode[] = [];
  for (let y = 8; y < 58; y += 7) {
    const off = Math.round(y / 7) % 2 ? 0 : 6;
    for (let x = 6 + off - 12; x < 96; x += 12) {
      const heat = Math.max(0, 1 - Math.abs(y - CY) / 28);
      out.push(<rect key={`${x}-${y}`} x={x} y={y} width={11} height={6} rx={0.6} strokeWidth=".6" opacity={P(0.3 + r() * 0.35 + heat * 0.3)} className={r() < 0.14 ? 'f2' : r() < 0.3 ? 'fsoft' : undefined} />);
    }
  }
  out.push(<path key="flame" d={`M0 ${H}C14 44 20 56 30 40S48 52 56 36 72 50 80 38 92 48 100 40V${H}Z`} className="fill-bg" strokeWidth="1.3" opacity=".9" />);
  out.push(<path key="edge" d={`M0 ${H - 4}H100`} strokeWidth="1.2" className="k2" />);
  return out;
}

/** Споры/яд: спирали и пузыри. */
function spores(r: Rand): ReactNode[] {
  const out: ReactNode[] = [];
  for (let s = 0; s < 2; s++) {
    const cx = s === 0 ? 34 + r() * 8 : 64 + r() * 8;
    const cy = 28 + r() * 10;
    let d = '';
    for (let t = 0; t < 7; t += 0.25) {
      const rad = 1.5 + t * 2.7;
      d += `${t === 0 ? 'M' : 'L'}${P(cx + Math.cos(t * (s ? -1 : 1)) * rad)} ${P(cy + Math.sin(t * (s ? -1 : 1)) * rad)}`;
    }
    out.push(<path key={`sp${s}`} d={d} strokeWidth="1.3" className={s ? 'k2' : undefined} opacity=".9" />);
  }
  for (let i = 0; i < 16; i++) {
    const rad = P(0.9 + r() * 3.4);
    const x = P(6 + r() * 88);
    const y = P(6 + r() * 52);
    out.push(<circle key={`b${i}`} cx={x} cy={y} r={rad} className={i % 3 === 0 ? 'f2' : 'fsoft'} strokeWidth=".7" opacity=".9" />);
    if (rad > 2.4) out.push(<circle key={`bh${i}`} cx={P(x - rad * 0.3)} cy={P(y - rad * 0.3)} r={0.6} fill="#fff" stroke="none" opacity=".8" />);
  }
  out.push(<path key="drip" d="M50 4v8M47 12a3 3 0 106 0c0-2-3-6-3-6s-3 4-3 6z" strokeWidth="1" className="k2" opacity=".7" />);
  return out;
}

/** Вирус: шипастая сфера с отростками. */
function virus(r: Rand): ReactNode[] {
  const out: ReactNode[] = [];
  const cx = P(CX + (r() - 0.5) * 16);
  const cy = CY;
  const n = 10 + Math.floor(r() * 5);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x0 = cx + Math.cos(a) * 13;
    const y0 = cy + Math.sin(a) * 13;
    const x1 = cx + Math.cos(a) * 21;
    const y1 = cy + Math.sin(a) * 21;
    out.push(<path key={`sp${i}`} d={`M${P(x0)} ${P(y0)}L${P(x1)} ${P(y1)}`} strokeWidth="1.1" />);
    out.push(<circle key={`tip${i}`} cx={P(x1)} cy={P(y1)} r={2} className={i % 2 ? 'f2' : 'fill-bg'} strokeWidth="1" />);
  }
  out.push(<circle key="body" cx={cx} cy={cy} r={13} className="fill-bg" strokeWidth="1.5" />);
  out.push(<circle key="in" cx={cx} cy={cy} r={8.5} className="fsoft" strokeWidth=".7" />);
  out.push(<path key="eye" d={`M${cx - 6} ${cy}q6-6 12 0q-6 6-12 0z`} className="f2" stroke="none" />, <circle key="pu" cx={cx} cy={cy} r={1.8} fill="#04050c" stroke="none" />);
  for (let i = 0; i < 10; i++) out.push(<path key={`g${i}`} d={`M${P(r() * W)} ${P(r() * H)}h${P(2 + r() * 8)}`} strokeWidth=".8" className="k2" opacity=".5" />);
  return out;
}

/** Целеуказатель: прицел с засечками (уязвимость/слабость). */
function reticle(r: Rand): ReactNode[] {
  const out: ReactNode[] = [];
  const cx = P(CX + (r() - 0.5) * 12);
  [22, 15, 8].forEach((rad, i) => out.push(<circle key={`c${i}`} cx={cx} cy={CY} r={rad} strokeWidth={P(1.4 - i * 0.3)} strokeDasharray={i === 1 ? '6 3' : undefined} className={i === 1 ? 'k2' : undefined} />));
  out.push(<path key="x" d={`M${cx - 32} ${CY}H${cx - 6}M${cx + 6} ${CY}H${cx + 32}M${cx} ${CY - 28}V${CY - 6}M${cx} ${CY + 6}V${CY + 28}`} strokeWidth="1" />);
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    out.push(<path key={`br${i}`} d={`M${P(cx + Math.cos(a) * 26)} ${P(CY + Math.sin(a) * 26)}l${P(Math.cos(a) * 4)} ${P(Math.sin(a) * 4)}`} strokeWidth="1.6" className="k2" />);
  }
  out.push(<circle key="dot" cx={cx} cy={CY} r={2.2} className="f2" />);
  out.push(<path key="crk" d={`M${cx} ${CY}l5 -7 -2 -4 M${cx} ${CY}l-6 4 -1 5 M${cx} ${CY}l2 8 4 2`} strokeWidth=".7" stroke="#fff" opacity=".7" />);
  return out;
}

/** Усиление: восходящие шевроны и ореол силы. */
function ascend(r: Rand): ReactNode[] {
  const out: ReactNode[] = [];
  out.push(<ellipse key="halo" cx={CX} cy={50} rx={26} ry={6} className="fsoft" strokeWidth=".8" />, <ellipse key="halo2" cx={CX} cy={50} rx={16} ry={3.5} strokeWidth=".8" className="k2" />);
  for (let i = 0; i < 4; i++) {
    const y = 44 - i * 10;
    out.push(<path key={`ch${i}`} d={`M${CX - 14 + i} ${y}L${CX} ${y - 10}L${CX + 14 - i} ${y}`} strokeWidth={P(3 - i * 0.5)} opacity={P(1 - i * 0.2)} className={i % 2 ? 'k2' : undefined} />);
  }
  for (let i = 0; i < 16; i++) out.push(<rect key={`p${i}`} x={P(CX - 24 + r() * 48)} y={P(6 + r() * 46)} width={1.1} height={P(2 + r() * 5)} className={i % 3 ? 'f1' : 'f2'} opacity={P(0.4 + r() * 0.5)} />);
  return out;
}

/** Добор: поток карт по дуге. */
function stream(r: Rand): ReactNode[] {
  const out: ReactNode[] = [];
  out.push(<path key="path" d="M-4 54C26 54 34 12 60 22S96 12 104 6" strokeWidth=".8" strokeDasharray="1.5 2.5" opacity=".6" className="k2" />);
  const n = 5;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const x = 10 + t * 80;
    const y = 50 - Math.sin(t * Math.PI * 0.9) * 32 + (t > 0.5 ? 6 : 0);
    const rot = -30 + t * 60;
    const sc = 0.7 + t * 0.55;
    out.push(<g key={`c${i}`} transform={`translate(${P(x)} ${P(y)}) rotate(${P(rot)}) scale(${P(sc)})`} opacity={P(0.45 + t * 0.55)}>
      <rect x="-6" y="-8.5" width="12" height="17" rx="1.4" className="fill-bg" strokeWidth="1.1" />
      <path d="M-3.5 -4h7M-3.5 0h7" strokeWidth=".6" opacity=".7" />
      <rect x="-3" y="3" width="6" height="3" className={i % 2 ? 'f2' : 'f1'} stroke="none" />
    </g>);
  }
  for (let i = 0; i < 10; i++) out.push(<path key={`t${i}`} d={`M${P(r() * 60)} ${P(10 + r() * 48)}h${P(4 + r() * 10)}`} strokeWidth=".6" opacity=".4" />);
  return out;
}

/** Энергия: разряд молнии и ядро. */
function bolt(r: Rand): ReactNode[] {
  const out: ReactNode[] = [];
  const cx = P(CX + (r() - 0.5) * 10);
  out.push(<circle key="aura" cx={cx} cy={CY} r={25} className="fsoft" strokeWidth=".6" opacity=".7" />, <circle key="aura2" cx={cx} cy={CY} r={19} strokeWidth=".6" strokeDasharray="2 3" className="k2" />);
  out.push(<path key="bolt" d={`M${cx + 6} 2L${cx - 11} 35H${cx - 1}L${cx - 6} 62L${cx + 13} 27H${cx + 2}Z`} className="f2" strokeWidth="1.2" />);
  out.push(<path key="bolt2" d={`M${cx + 4} 8L${cx - 6} 33`} stroke="#fff" strokeWidth=".9" opacity=".9" />);
  for (let i = 0; i < 6; i++) {
    const sx = r() < 0.5 ? -1 : 1;
    let x = cx;
    let y = 10 + r() * 44;
    let d = `M${P(x)} ${P(y)}`;
    for (let k = 0; k < 3; k++) {
      x += sx * (3 + r() * 5);
      y += (r() - 0.5) * 10;
      d += `L${P(x)} ${P(y)}`;
    }
    out.push(<path key={`arc${i}`} d={d} strokeWidth=".9" opacity=".8" className={i % 2 ? 'k2' : undefined} />);
  }
  return out;
}

/** Лечение: крест, пульс и клетки. */
function heal(r: Rand): ReactNode[] {
  const out: ReactNode[] = [];
  out.push(<circle key="c1" cx={CX} cy={30} r={24} className="fsoft" strokeWidth=".8" />, <circle key="c2" cx={CX} cy={30} r={19} strokeWidth=".6" strokeDasharray="3 3" className="k2" />);
  out.push(<path key="cross" d="M44 14h12v10h10v12H56v10H44V36H34V24h10z" className="fill-bg" strokeWidth="1.6" />, <path key="cr2" d="M46.5 17h7v10h10v6h-10v10h-7V33h-10v-6h10z" className="f2" stroke="none" opacity=".85" />);
  out.push(<path key="ecg" d="M0 54h24l4-8 5 14 4-20 4 14h8l3-4 4 8 4-4H100" strokeWidth="1.1" className="k2" />);
  for (let i = 0; i < 9; i++) {
    const x = P(8 + r() * 84);
    const y = P(6 + r() * 40);
    out.push(<path key={`pl${i}`} d={`M${x - 2} ${y}h4M${x} ${y - 2}v4`} strokeWidth=".9" opacity={P(0.4 + r() * 0.5)} />);
  }
  return out;
}

/** Модуль (power): реактор-глиф с вращающимися кольцами. */
function reactor(r: Rand): ReactNode[] {
  const out: ReactNode[] = [];
  const sides = 3 + Math.floor(r() * 4);
  out.push(<g key="r1" className="art-spin" style={{ transformOrigin: `${CX}px ${CY}px` }}>
    <circle cx={CX} cy={CY} r={28} strokeWidth="1" strokeDasharray="14 5 3 5" />
    <circle cx={CX} cy={CY} r={24} strokeWidth=".6" strokeDasharray="1 3" className="k2" />
  </g>);
  out.push(<g key="r2" className="art-spin art-spin--rev" style={{ transformOrigin: `${CX}px ${CY}px` }}>
    <path d={pol(CX, CY, 21, sides, -Math.PI / 2)} strokeWidth="1.2" className="k2" />
    <path d={pol(CX, CY, 21, sides, Math.PI / 2 + (sides % 2 ? 0 : Math.PI / sides))} strokeWidth=".7" opacity=".6" />
  </g>);
  out.push(<path key="in" d={pol(CX, CY, 13, sides * 2, 0.3)} className="fill-bg" strokeWidth="1.3" />, <path key="in2" d={pol(CX, CY, 9, sides * 2, 0.3)} className="fsoft" strokeWidth=".8" />);
  out.push(<circle key="co" cx={CX} cy={CY} r={5} className="f2" />, <circle key="co2" cx={CX} cy={CY} r={2} fill="#fff" stroke="none" />);
  for (let i = 0; i < sides * 2; i++) {
    const a = (i / (sides * 2)) * Math.PI * 2;
    out.push(<path key={`t${i}`} d={`M${P(CX + Math.cos(a) * 29)} ${P(CY + Math.sin(a) * 29)}l${P(Math.cos(a) * 4)} ${P(Math.sin(a) * 4)}`} strokeWidth="1" opacity=".7" />);
  }
  return out;
}

/** Удар по всем: расходящиеся дуги-волны. */
function shockwave(r: Rand): ReactNode[] {
  const out: ReactNode[] = [];
  const cx = P(CX + (r() - 0.5) * 12);
  const cy = 58;
  for (let i = 1; i <= 6; i++) {
    const rad = i * 9;
    out.push(<path key={`w${i}`} d={`M${P(cx - rad * 1.2)} ${P(cy - rad * 0.3)}A${P(rad * 1.2)} ${rad} 0 0 1 ${P(cx + rad * 1.2)} ${P(cy - rad * 0.3)}`} strokeWidth={P(3 - i * 0.35)} opacity={P(1 - i * 0.1)} className={i % 2 ? 'k2' : undefined} strokeDasharray={i > 3 ? '5 3' : undefined} />);
  }
  out.push(<path key="base" d={`M0 ${cy}H100`} strokeWidth="1.2" className="k2" />);
  out.push(<path key="src" d={pol(cx, cy - 2, 6, 8, 0)} className="f2" stroke="none" />);
  for (let i = 0; i < 12; i++) out.push(<rect key={`d${i}`} x={P(r() * 96)} y={P(6 + r() * 42)} width={P(1 + r() * 3)} height={1.2} className="f1" opacity={P(0.4 + r() * 0.5)} />);
  return out;
}

/** Карты/программы в руку: веер из карточек. */
function stack(r: Rand): ReactNode[] {
  const out: ReactNode[] = [];
  for (let i = 0; i < 4; i++) {
    const rot = -24 + i * 16;
    out.push(<g key={`c${i}`} transform={`translate(${CX} 56) rotate(${rot})`}>
      <rect x="-9" y="-44" width="18" height="30" rx="1.8" className="fill-bg" strokeWidth="1.1" opacity={P(0.6 + i * 0.13)} />
      <path d="M-5 -38h10M-5 -34h10" strokeWidth=".6" opacity=".7" />
      <rect x="-5" y="-30" width="10" height="9" className={i % 2 ? 'f2' : 'fsoft'} strokeWidth=".6" />
    </g>);
  }
  out.push(<circle key="pin" cx={CX} cy={56} r={2} className="f2" />);
  for (let i = 0; i < 6; i++) out.push(<path key={`s${i}`} d={`M${P(6 + r() * 88)} ${P(4 + r() * 20)}h2`} strokeWidth="1" className="k2" opacity=".7" />);
  return out;
}

/** Сигнал/глитч: рваные полосы, дефекты данных (проклятия, статусы, потеря HP). */
function glitch(r: Rand): ReactNode[] {
  const out: ReactNode[] = [];
  for (let i = 0; i < 12; i++) {
    const y = P(2 + i * 5.2);
    const x = P(r() * 70);
    out.push(<rect key={`g${i}`} x={x} y={y} width={P(10 + r() * 36)} height={P(1.5 + r() * 3.5)} className={i % 3 === 0 ? 'f2' : 'fsoft'} strokeWidth=".5" opacity={P(0.5 + r() * 0.5)} />);
  }
  out.push(<path key="sk" d={`M${CX - 12} 14c0-8 6-12 12-12s12 4 12 12c0 5-2 8-4 10v6h-16v-6c-2-2-4-5-4-10z`} className="fill-bg" strokeWidth="1.4" />);
  out.push(<circle key="e1" cx={CX - 5} cy={15} r={3} className="f2" />, <circle key="e2" cx={CX + 5} cy={15} r={3} className="f2" />, <path key="n" d={`M${CX} 20l-1.5 3h3z`} className="f1" />);
  out.push(<path key="j" d={`M${CX - 5} 30v-3M${CX} 30v-3M${CX + 5} 30v-3`} strokeWidth="1" />);
  out.push(<path key="bone" d={`M${CX - 24} 50l48-12M${CX - 24} 38l48 12`} strokeWidth="2.4" className="k2" opacity=".9" />);
  return out;
}

/** Золото/ресурсы: монеты-гексы и стопка. */
function coins(r: Rand): ReactNode[] {
  const out: ReactNode[] = [];
  for (let i = 0; i < 5; i++) {
    const x = 30 + (i % 3) * 18 - (i > 2 ? 9 : 0);
    const y = 44 - Math.floor(i / 3) * 8 - (i % 3 === 1 ? 4 : 0);
    out.push(<ellipse key={`s${i}`} cx={x} cy={y + 3} rx={10} ry={3.6} className="fill-bg" strokeWidth="1" />, <ellipse key={`t${i}`} cx={x} cy={y} rx={10} ry={3.6} className={i % 2 ? 'fsoft' : 'f2'} strokeWidth="1" />);
  }
  out.push(<path key="h" d={pol(CX, 17, 8, 6, 0)} className="fill-bg" strokeWidth="1.3" />, <path key="h2" d={`M${CX - 3} 14h6M${CX - 3} 20h6M${CX} 12v10`} strokeWidth="1" className="k2" />);
  for (let i = 0; i < 10; i++) out.push(<circle key={`p${i}`} cx={P(r() * W)} cy={P(r() * H)} r={0.9} className="f1" opacity=".6" />);
  return out;
}

/** Микросхема: корпус с ножками и дорожками. */
function chip(r: Rand): ReactNode[] {
  const out: ReactNode[] = [];
  const cx = P(CX + (r() - 0.5) * 8);
  const n = 4 + Math.floor(r() * 2);
  let pins = '';
  for (let i = 0; i < n; i++) {
    const t = -15 + (i / (n - 1)) * 30;
    pins += `M${P(cx + t)} ${CY - 20}v-8M${P(cx + t)} ${CY + 20}v8M${cx - 20} ${P(CY + t * 0.8)}h-8M${cx + 20} ${P(CY + t * 0.8)}h8`;
  }
  out.push(<path key="pins" d={pins} strokeWidth="1.6" opacity=".8" className="k2" />);
  out.push(<rect key="body" x={cx - 20} y={CY - 20} width={40} height={40} rx={3} className="fill-bg" strokeWidth="1.6" />);
  out.push(<rect key="die" x={cx - 12} y={CY - 12} width={24} height={24} rx={1.5} className="fsoft" strokeWidth="1" />);
  out.push(<rect key="core" x={cx - 5} y={CY - 5} width={10} height={10} className="f2" stroke="none" />);
  out.push(<path key="tr" d={`M${cx - 12} ${CY - 6}h4v-4M${cx + 12} ${CY + 6}h-4v4M${cx - 6} ${CY + 12}v-4h-4`} strokeWidth=".7" stroke="#fff" opacity=".7" />);
  out.push(<circle key="dot" cx={cx - 16} cy={CY - 16} r={1.4} className="f1" />);
  for (let i = 0; i < 6; i++) out.push(<path key={`tc${i}`} d={`M${P(r() * 20)} ${P(8 + r() * 48)}h${P(6 + r() * 14)}`} strokeWidth=".6" opacity=".4" />);
  return out;
}

/** Дрон: квадрокоптер с лучом-прицелом. */
function drone(r: Rand): ReactNode[] {
  const out: ReactNode[] = [];
  const cx = P(CX + (r() - 0.5) * 10);
  const cy = P(26 + (r() - 0.5) * 4);
  out.push(<path key="beam" d={`M${cx} ${cy + 8}L${cx - 12} 62H${cx + 12}Z`} className="fsoft" strokeWidth=".5" opacity=".6" />);
  [-1, 1].forEach((s, i) => {
    const ax = cx + s * 20;
    out.push(<path key={`arm${i}`} d={`M${cx} ${cy}L${P(ax)} ${cy - 5}`} strokeWidth="1.6" />);
    out.push(<g key={`rot${i}`} className="art-spin" style={{ transformOrigin: `${P(ax)}px ${cy - 6}px` }}>
      <ellipse cx={P(ax)} cy={cy - 6} rx={9} ry={1.8} className="fsoft" strokeWidth=".8" />
      <path d={`M${P(ax - 9)} ${cy - 6}h18`} strokeWidth=".6" stroke="#fff" opacity=".6" />
    </g>);
    out.push(<circle key={`m${i}`} cx={P(ax)} cy={cy - 5} r={1.6} className="f2" />);
  });
  out.push(<path key="body" d={pol(cx, cy, 10, 6, 0, 0.7)} className="fill-bg" strokeWidth="1.5" />);
  out.push(<circle key="lens" cx={cx} cy={cy + 1} r={3.4} className="f2" strokeWidth="1" />, <circle key="gl" cx={P(cx - 1)} cy={cy} r={0.9} fill="#fff" stroke="none" />);
  out.push(<path key="leg" d={`M${cx - 6} ${cy + 6}l-3 5h5M${cx + 6} ${cy + 6}l3 5h-5`} strokeWidth="1" />);
  out.push(<circle key="tg" cx={cx} cy={58} r={4} strokeWidth="1" className="k2" />, <path key="tgx" d={`M${cx - 7} 58h14M${cx} 51v14`} strokeWidth=".6" />);
  for (let i = 0; i < 8; i++) out.push(<path key={`w${i}`} d={`M${P(r() * W)} ${P(r() * 40)}h${P(3 + r() * 6)}`} strokeWidth=".6" opacity=".4" />);
  return out;
}

/** Катана: клинок с хамоном, цубой и росчерком. */
function katana(r: Rand): ReactNode[] {
  const out: ReactNode[] = [];
  const ang = P(-0.7 + r() * 0.3);
  out.push(<path key="slash" d="M8 56C30 40 60 24 94 8C64 26 38 44 8 56Z" className="fsoft" strokeWidth=".6" opacity=".7" />);
  out.push(<g key="k" transform={`rotate(${P(ang * 57.3)} ${CX} ${CY})`}>
    <path d="M10 33L70 30.5Q76 32 76 33.5Q76 35 70 35.5L10 35Z" className="fill-bg" strokeWidth="1.3" />
    <path d="M14 33.8H72" stroke="#fff" strokeWidth=".6" opacity=".8" />
    <path d="M16 34.8q4-1.4 8 0t8 0 8 0 8 0" strokeWidth=".6" className="k2" />
    <rect x="3" y="31.5" width="16" height="4.4" rx="1" className="fsoft" strokeWidth="1.2" />
    <path d="M6 31.5l3 4.4M10 31.5l3 4.4M14 31.5l3 4.4" strokeWidth=".6" />
    <ellipse cx="20.5" cy="33.7" rx="2" ry="6" className="f2" strokeWidth="1" />
  </g>);
  for (let i = 0; i < 10; i++) out.push(<path key={`s${i}`} d={`M${P(40 + r() * 54)} ${P(4 + r() * 22)}l${P(2 + r() * 5)} ${P(-2 - r() * 3)}`} strokeWidth=".8" className={i % 2 ? 'k2' : undefined} opacity=".8" />);
  out.push(<circle key="hit" cx={92} cy={9} r={2.2} className="f2" />);
  return out;
}

/** ДНК: двойная спираль с перемычками. */
function dna(r: Rand): ReactNode[] {
  const out: ReactNode[] = [];
  const ph = r() * 6.28;
  const amp = 14 + r() * 4;
  let a = '';
  let b = '';
  for (let x = 6; x <= 94; x += 2.5) {
    const s = Math.sin(((x - 6) / 88) * Math.PI * 4 + ph);
    a += `${x === 6 ? 'M' : 'L'}${x} ${P(CY + s * amp)}`;
    b += `${x === 6 ? 'M' : 'L'}${x} ${P(CY - s * amp)}`;
  }
  for (let x = 10; x <= 90; x += 5.5) {
    const s = Math.sin(((x - 6) / 88) * Math.PI * 4 + ph);
    out.push(<path key={`rg${x}`} d={`M${x} ${P(CY + s * amp)}V${P(CY - s * amp)}`} strokeWidth=".8" opacity={P(0.3 + Math.abs(Math.cos(((x - 6) / 88) * Math.PI * 4 + ph)) * 0.6)} />);
    out.push(<circle key={`rn${x}`} cx={x} cy={P(CY + s * amp)} r={1.3} className={Math.round(x) % 2 ? 'f2' : 'f1'} />);
  }
  out.push(<path key="a" d={a} strokeWidth="1.8" />, <path key="b" d={b} strokeWidth="1.8" className="k2" />);
  return out;
}

/** Глаз: радужка со зрачком и веками. */
function eye(r: Rand): ReactNode[] {
  const out: ReactNode[] = [];
  const cx = P(CX + (r() - 0.5) * 6);
  out.push(<path key="lid" d={`M${cx - 38} ${CY}Q${cx} ${CY - 34} ${cx + 38} ${CY}Q${cx} ${CY + 34} ${cx - 38} ${CY}Z`} className="fill-bg" strokeWidth="1.6" />);
  out.push(<circle key="iris" cx={cx} cy={CY} r={15} className="fsoft" strokeWidth="1.4" />);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    out.push(<path key={`ir${i}`} d={`M${P(cx + Math.cos(a) * 8)} ${P(CY + Math.sin(a) * 8)}L${P(cx + Math.cos(a) * 15)} ${P(CY + Math.sin(a) * 15)}`} strokeWidth=".6" opacity=".7" className={i % 3 ? undefined : 'k2'} />);
  }
  out.push(<circle key="pu" cx={cx} cy={CY} r={6.5} fill="#04050c" className="k2" strokeWidth="1.2" />, <circle key="hl" cx={P(cx - 3)} cy={CY - 3} r={1.8} fill="#fff" stroke="none" />);
  out.push(<path key="lash" d={`M${cx - 30} ${CY - 6}l-4 -4M${cx - 18} ${CY - 14}l-3 -5M${cx + 18} ${CY - 14}l3 -5M${cx + 30} ${CY - 6}l4 -4`} strokeWidth="1" opacity=".7" />);
  out.push(<path key="sc" d={`M${cx - 38} ${CY + 24}H${cx + 38}`} strokeWidth=".6" strokeDasharray="2 3" className="k2" opacity=".7" />);
  return out;
}

/** Замок: дужка, корпус и замочная скважина. */
function lock(r: Rand): ReactNode[] {
  const out: ReactNode[] = [];
  const cx = P(CX + (r() - 0.5) * 8);
  const open = r() < 0.3;
  out.push(<circle key="aura" cx={cx} cy={34} r={26} className="fsoft" strokeWidth=".6" opacity=".6" />);
  out.push(<path key="sh" d={open ? `M${cx - 10} 30V20a10 10 0 0120 0` : `M${cx - 10} 30V20a10 10 0 0120 0V30`} strokeWidth="3.2" className="k2" />);
  out.push(<rect key="bd" x={cx - 17} y={30} width={34} height={26} rx={3} className="fill-bg" strokeWidth="1.8" />);
  out.push(<rect key="pl" x={cx - 13} y={34} width={26} height={18} rx={1.5} className="fsoft" strokeWidth=".7" />);
  out.push(<circle key="kh" cx={cx} cy={40} r={3.2} className="f2" />, <path key="ks" d={`M${cx} 41v7`} strokeWidth="2.4" className="k2" />);
  for (let i = 0; i < 6; i++) out.push(<rect key={`b${i}`} x={cx - 14 + i * 5} y={53} width={2.4} height={2} className="f1" stroke="none" opacity=".7" />);
  for (let i = 0; i < 8; i++) out.push(<path key={`h${i}`} d={`M${P(r() * W)} ${P(4 + r() * 56)}h${P(2 + r() * 5)}`} strokeWidth=".6" opacity=".4" />);
  return out;
}

/** Череп: большой череп со скрещёнными костями. */
function skull(r: Rand): ReactNode[] {
  const out: ReactNode[] = [];
  const cx = P(CX + (r() - 0.5) * 8);
  out.push(<path key="b1" d={`M${cx - 26} 52l52-12M${cx - 26} 40l52 12`} strokeWidth="3" opacity=".85" className="k2" />);
  out.push(<circle key="k1" cx={cx - 26} cy={52} r={2.2} className="fill-bg" />, <circle key="k2" cx={cx + 26} cy={40} r={2.2} className="fill-bg" />);
  out.push(<path key="sk" d={`M${cx - 15} 24c0-12 7-18 15-18s15 6 15 18c0 6-3 9-6 11v6h-18v-6c-3-2-6-5-6-11z`} className="fill-bg" strokeWidth="1.8" />);
  out.push(<path key="in" d={`M${cx - 11} 22c0-8 5-13 11-13`} stroke="#fff" strokeWidth="1" opacity=".5" />);
  out.push(<path key="e1" d={`M${cx - 10} 20h7v7h-7z`} className="f2" />, <path key="e2" d={`M${cx + 3} 20h7v7h-7z`} className="f2" />);
  out.push(<path key="n" d={`M${cx} 29l-2 4h4z`} className="f1" />, <path key="t" d={`M${cx - 6} 41v-4M${cx - 2} 41v-4M${cx + 2} 41v-4M${cx + 6} 41v-4`} strokeWidth="1" />);
  for (let i = 0; i < 8; i++) out.push(<circle key={`p${i}`} cx={P(r() * W)} cy={P(r() * H)} r={0.9} className="f1" opacity=".5" />);
  return out;
}

/** Спутник: панели батарей, тарелка и орбита. */
function satellite(r: Rand): ReactNode[] {
  const out: ReactNode[] = [];
  const cx = P(CX + (r() - 0.5) * 8);
  const cy = P(CY + (r() - 0.5) * 6);
  out.push(<ellipse key="orb" cx={CX} cy={CY} rx={44} ry={13} strokeWidth=".7" strokeDasharray="2 3" className="k2" opacity=".7" transform={`rotate(-20 ${CX} ${CY})`} />);
  [-1, 1].forEach((s, i) => {
    const x0 = s < 0 ? cx - 8 - 26 : cx + 8;
    out.push(<rect key={`p${i}`} x={P(x0)} y={cy - 8} width={26} height={16} className="fsoft" strokeWidth="1.2" />);
    out.push(<path key={`pg${i}`} d={`M${P(x0)} ${cy}h26M${P(x0 + 8.7)} ${cy - 8}v16M${P(x0 + 17.3)} ${cy - 8}v16`} strokeWidth=".6" opacity=".7" />);
  });
  out.push(<rect key="bd" x={cx - 8} y={cy - 7} width={16} height={14} rx={2} className="fill-bg" strokeWidth="1.6" />);
  out.push(<circle key="co" cx={cx} cy={cy} r={3} className="f2" />);
  out.push(<path key="dish" d={`M${cx - 6} ${cy + 15}Q${cx} ${cy + 24} ${cx + 6} ${cy + 15}`} strokeWidth="1.4" />, <path key="ds" d={`M${cx} ${cy + 7}v10`} strokeWidth="1" />);
  for (let i = 1; i <= 3; i++) out.push(<path key={`sg${i}`} d={`M${cx + 6 + i * 5} ${cy - 14 - i * 3}a${i * 5} ${i * 5} 0 0 1 ${i * 5} ${i * 3}`} strokeWidth=".8" opacity={P(1 - i * 0.2)} />);
  for (let i = 0; i < 10; i++) out.push(<circle key={`st${i}`} cx={P(r() * W)} cy={P(r() * H)} r={0.7} className="f1" opacity=".6" />);
  return out;
}

/** Песочные часы: время, песок и струйка. */
function hourglass(r: Rand): ReactNode[] {
  const out: ReactNode[] = [];
  const cx = P(CX + (r() - 0.5) * 8);
  const fill = 0.3 + r() * 0.4;
  out.push(<circle key="ring" cx={cx} cy={CY} r={27} strokeWidth=".7" strokeDasharray="1 4" className="k2" opacity=".7" />);
  out.push(<path key="gl" d={`M${cx - 15} 8H${cx + 15}C${cx + 15} 22 ${cx + 3} 28 ${cx + 3} 32S${cx + 15} 42 ${cx + 15} 56H${cx - 15}C${cx - 15} 42 ${cx - 3} 36 ${cx - 3} 32S${cx - 15} 22 ${cx - 15} 8Z`} className="fill-bg" strokeWidth="1.6" />);
  out.push(<path key="sd" d={`M${cx - 11} 54H${cx + 11}C${cx + 9} ${P(54 - 14 * fill)} ${cx + 3} ${P(54 - 20 * fill)} ${cx} ${P(54 - 22 * fill)}C${cx - 3} ${P(54 - 20 * fill)} ${cx - 9} ${P(54 - 14 * fill)} ${cx - 11} 54Z`} className="f2" stroke="none" opacity=".9" />);
  out.push(<path key="tp" d={`M${cx - 10} 12H${cx + 10}C${cx + 8} 18 ${cx + 3} 22 ${cx} 26C${cx - 3} 22 ${cx - 8} 18 ${cx - 10} 12Z`} className="fsoft" strokeWidth=".6" />);
  out.push(<path key="st" d={`M${cx} 28V${P(54 - 22 * fill)}`} stroke="#fff" strokeWidth=".8" strokeDasharray="1 1.5" />);
  out.push(<path key="cap" d={`M${cx - 19} 6H${cx + 19}M${cx - 19} 58H${cx + 19}`} strokeWidth="2.4" className="k2" />);
  for (let i = 0; i < 7; i++) out.push(<path key={`t${i}`} d={`M${P(cx + 20 + r() * 20)} ${P(8 + r() * 48)}h${P(2 + r() * 4)}`} strokeWidth=".7" opacity=".45" />);
  return out;
}

/** Кости: два куба с точками. */
function dice(r: Rand): ReactNode[] {
  const out: ReactNode[] = [];
  const pips: Record<number, [number, number][]> = {
    1: [[0, 0]],
    2: [[-1, -1], [1, 1]],
    3: [[-1, -1], [0, 0], [1, 1]],
    4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
    5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
    6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
  };
  [
    { x: 34, y: 34, s: 22, rot: -14 + r() * 8, v: 1 + Math.floor(r() * 6), c: 'fsoft' },
    { x: 66, y: 28, s: 17, rot: 16 + r() * 10, v: 1 + Math.floor(r() * 6), c: 'fill-bg' },
  ].forEach((d, i) => {
    const h = d.s / 2;
    out.push(<g key={`d${i}`} transform={`translate(${d.x} ${d.y}) rotate(${P(d.rot)})`}>
      <rect x={-h} y={-h} width={d.s} height={d.s} rx={3} className={d.c} strokeWidth="1.6" />
      <path d={`M${-h + 2} ${-h + 1.5}H${h - 3}`} stroke="#fff" strokeWidth=".8" opacity=".6" />
      {(pips[d.v] ?? []).map(([px, py], k) => <circle key={k} cx={P(px * d.s * 0.26)} cy={P(py * d.s * 0.26)} r={P(d.s * 0.075)} className="f2" />)}
    </g>);
  });
  out.push(<path key="tr" d="M44 52q10 8 22 2" strokeWidth=".8" strokeDasharray="1 3" className="k2" />);
  for (let i = 0; i < 8; i++) out.push(<path key={`s${i}`} d={`M${P(r() * W)} ${P(r() * H)}l2 -2`} strokeWidth="1" className="k2" opacity=".6" />);
  return out;
}

/** Wi-Fi: расходящиеся дуги сигнала от источника. */
function wifi(r: Rand): ReactNode[] {
  const out: ReactNode[] = [];
  const cx = P(CX + (r() - 0.5) * 10);
  const by = 50;
  for (let i = 1; i <= 4; i++) {
    const rad = i * 10;
    out.push(<path key={`a${i}`} d={`M${P(cx - rad * 0.75)} ${P(by - rad * 0.66)}A${rad} ${rad} 0 0 1 ${P(cx + rad * 0.75)} ${P(by - rad * 0.66)}`} strokeWidth={P(3.4 - i * 0.5)} opacity={P(1 - i * 0.14)} className={i % 2 ? undefined : 'k2'} strokeLinecap="round" />);
  }
  out.push(<circle key="src" cx={cx} cy={by} r={4} className="f2" />, <circle key="srr" cx={cx} cy={by} r={7} strokeWidth=".7" className="k2" />);
  out.push(<path key="gnd" d={`M${cx - 20} ${by + 8}H${cx + 20}`} strokeWidth="1" opacity=".6" />);
  for (let i = 0; i < 10; i++) out.push(<rect key={`p${i}`} x={P(r() * 96)} y={P(4 + r() * 30)} width={P(1 + r() * 3)} height={1.2} className="f1" opacity=".5" />);
  return out;
}

/** Терминал: окно с командной строкой. */
function terminal(r: Rand): ReactNode[] {
  const out: ReactNode[] = [];
  const x = P(14 + (r() - 0.5) * 6);
  out.push(<rect key="win" x={x} y={8} width={72} height={48} rx={2.5} className="fill-bg" strokeWidth="1.6" />);
  out.push(<path key="bar" d={`M${x} 17H${x + 72}`} strokeWidth="1" />, <circle key="d1" cx={x + 5} cy={12.5} r={1.4} className="f2" />, <circle key="d2" cx={x + 10} cy={12.5} r={1.4} className="f1" />, <circle key="d3" cx={x + 15} cy={12.5} r={1.4} className="fsoft" />);
  for (let i = 0; i < 4; i++) {
    const y = 24 + i * 7.5;
    out.push(<path key={`pr${i}`} d={`M${x + 5} ${y - 2}l3 2-3 2`} strokeWidth="1.2" className="k2" />);
    out.push(<path key={`ln${i}`} d={`M${x + 12} ${y}h${P(10 + r() * 40)}`} strokeWidth="1.6" opacity={P(0.45 + r() * 0.4)} className={i === 1 ? 'k2' : undefined} />);
  }
  out.push(<rect key="cur" x={x + 12} y={48} width={4} height={5} className="f2" stroke="none" />);
  out.push(<path key="sc" d={`M${x + 3} 20H${x + 69}`} stroke="#fff" strokeWidth=".5" opacity=".35" />);
  return out;
}

/** Шестерня: крупная шестерня с малой в зацеплении. */
function gear(r: Rand): ReactNode[] {
  const out: ReactNode[] = [];
  const cx = P(40 + (r() - 0.5) * 6);
  const cy = P(32 + (r() - 0.5) * 4);
  out.push(<g key="g1" className="art-spin" style={{ transformOrigin: `${cx}px ${cy}px` }}>
    <path d={gearPath(cx, cy, 25, 20, 10, r())} className="fill-bg" strokeWidth="1.6" />
    <circle cx={cx} cy={cy} r={12} className="fsoft" strokeWidth="1" />
    <path d={`M${cx - 12} ${cy}h24M${cx} ${cy - 12}v24`} strokeWidth=".6" opacity=".6" />
  </g>);
  const sx = P(cx + 36);
  const sy = P(cy + 14);
  out.push(<g key="g2" className="art-spin art-spin--rev" style={{ transformOrigin: `${sx}px ${sy}px` }}>
    <path d={gearPath(sx, sy, 13, 10, 7, r())} className="fill-bg" strokeWidth="1.4" />
    <circle cx={sx} cy={sy} r={4} strokeWidth="1" className="k2" />
  </g>);
  out.push(<circle key="h1" cx={cx} cy={cy} r={4.5} className="f2" />, <circle key="h2" cx={sx} cy={sy} r={1.5} className="f2" />);
  out.push(<path key="bolt" d={`M${cx + 8} ${cy - 30}l4 -4M${cx - 28} ${cy + 20}l-4 4`} strokeWidth="1.2" className="k2" />);
  return out;
}

/** Кристалл: гранёный осколок с бликами. */
function crystal(r: Rand): ReactNode[] {
  const out: ReactNode[] = [];
  const cx = P(CX + (r() - 0.5) * 8);
  const w = 15 + r() * 4;
  out.push(<ellipse key="gl" cx={cx} cy={56} rx={24} ry={4} className="fsoft" strokeWidth=".7" />);
  out.push(<path key="bd" d={`M${cx} 3L${cx + w} 22L${cx + w * 0.6} 54L${cx} 60L${cx - w * 0.6} 54L${cx - w} 22Z`} className="fill-bg" strokeWidth="1.7" />);
  out.push(<path key="f1" d={`M${cx} 3L${cx + w} 22H${cx}Z`} className="fsoft" strokeWidth=".7" />);
  out.push(<path key="f2" d={`M${cx} 22V60L${cx - w * 0.6} 54L${cx - w} 22Z`} className="f2" stroke="none" opacity=".55" />);
  out.push(<path key="ed" d={`M${cx - w} 22H${cx + w}M${cx} 3V60`} strokeWidth=".8" />);
  out.push(<path key="hl" d={`M${cx - w + 4} 20L${cx - 3} 8`} stroke="#fff" strokeWidth="1.2" opacity=".8" />);
  [-1, 1].forEach((s, i) => {
    const sx = cx + s * (24 + r() * 8);
    out.push(<path key={`sh${i}`} d={`M${P(sx)} ${34 + i * 6}l${s * 3} -9l${s * 4} 9l${-s * 3} 12z`} className={i ? 'f2' : 'fsoft'} strokeWidth="1" />);
  });
  for (let i = 0; i < 8; i++) out.push(<path key={`sp${i}`} d={`M${P(r() * W)} ${P(r() * 50)}h2`} strokeWidth="1" className="k2" opacity=".7" />);
  return out;
}

/** Коготь/хват: кисть с когтями, тянущаяся к цели. */
function claw(r: Rand): ReactNode[] {
  const out: ReactNode[] = [];
  const cx = P(CX + (r() - 0.5) * 8);
  out.push(<path key="arm" d={`M${cx - 8} 64V50H${cx + 8}V64`} className="fill-bg" strokeWidth="1.5" />);
  out.push(<path key="pm" d={`M${cx - 14} 50V38C${cx - 14} 33 ${cx + 14} 33 ${cx + 14} 38V50Z`} className="fill-bg" strokeWidth="1.6" />);
  out.push(<rect key="pl" x={cx - 7} y={40} width={14} height={7} rx={1} className="fsoft" strokeWidth=".7" />);
  const fingers: [number, number][] = [[-12, -22], [-4, -30], [4, -30], [12, -22]];
  fingers.forEach(([dx, dy], i) => {
    const bx = cx + dx;
    const tx = cx + dx * 1.5 + (dx < 0 ? 3 : -3);
    const ty = 36 + dy;
    out.push(<path key={`f${i}`} d={`M${P(bx)} 37L${P(bx + (tx - bx) * 0.5)} ${P(36 + dy * 0.5)}L${P(tx)} ${P(ty)}`} strokeWidth="3.2" opacity=".95" />);
    out.push(<path key={`n${i}`} d={`M${P(tx)} ${P(ty)}l${dx < 0 ? 3 : -3} -5`} strokeWidth="1.4" className="k2" />);
    out.push(<circle key={`j${i}`} cx={P(bx + (tx - bx) * 0.5)} cy={P(36 + dy * 0.5)} r={1.3} className="f2" />);
  });
  out.push(<path key="th" d={`M${cx - 14} 44l-9 -6`} strokeWidth="3" />);
  out.push(<circle key="tg" cx={cx} cy={8} r={5} strokeWidth="1" className="k2" strokeDasharray="2 2" />);
  for (let i = 0; i < 8; i++) out.push(<path key={`s${i}`} d={`M${P(r() * W)} ${P(r() * 30)}h${P(2 + r() * 4)}`} strokeWidth=".6" opacity=".45" />);
  return out;
}

/** Радар: развёртка с секторами и целями. */
function radar(r: Rand): ReactNode[] {
  const out: ReactNode[] = [];
  const cx = P(CX + (r() - 0.5) * 8);
  const cy = 34;
  const sw = r() * 6.28;
  [28, 20, 12].forEach((rad, i) => out.push(<circle key={`c${i}`} cx={cx} cy={cy} r={rad} strokeWidth={i ? 0.6 : 1.4} opacity={i ? 0.6 : 1} />));
  out.push(<path key="ax" d={`M${cx - 30} ${cy}H${cx + 30}M${cx} ${cy - 30}V${cy + 30}`} strokeWidth=".5" opacity=".5" />);
  out.push(<g key="sw" className="art-spin" style={{ transformOrigin: `${cx}px ${cy}px` }}>
    <path d={`M${cx} ${cy}L${P(cx + Math.cos(sw) * 28)} ${P(cy + Math.sin(sw) * 28)}A28 28 0 0 0 ${P(cx + Math.cos(sw - 0.8) * 28)} ${P(cy + Math.sin(sw - 0.8) * 28)}Z`} className="fsoft" strokeWidth=".6" />
    <path d={`M${cx} ${cy}L${P(cx + Math.cos(sw) * 28)} ${P(cy + Math.sin(sw) * 28)}`} stroke="#fff" strokeWidth="1" />
  </g>);
  for (let i = 0; i < 4; i++) {
    const a = r() * 6.28;
    const d = 8 + r() * 18;
    out.push(<circle key={`b${i}`} cx={P(cx + Math.cos(a) * d)} cy={P(cy + Math.sin(a) * d)} r={P(1.2 + r() * 1.2)} className={i % 2 ? 'f2' : 'f1'} />);
  }
  out.push(<circle key="ct" cx={cx} cy={cy} r={1.6} className="f2" />);
  out.push(<path key="tk" d={`M${cx - 28} ${cy}h-3M${cx + 28} ${cy}h3M${cx} ${cy - 28}v-3M${cx} ${cy + 28}v3`} strokeWidth="1.2" className="k2" />);
  return out;
}

/** Ключ-карта: ключ с бородкой и ореолом доступа. */
function keycard(r: Rand): ReactNode[] {
  const out: ReactNode[] = [];
  const ang = P(-28 + r() * 16);
  out.push(<circle key="aura" cx={CX} cy={CY} r={26} className="fsoft" strokeWidth=".6" opacity=".6" />);
  out.push(<g key="k" transform={`rotate(${ang} ${CX} ${CY})`}>
    <circle cx="28" cy="32" r="11" className="fill-bg" strokeWidth="1.8" />
    <circle cx="28" cy="32" r="5" strokeWidth="1.2" className="k2" />
    <path d={pol(28, 32, 7.5, 6, 0)} className="fsoft" strokeWidth=".6" />
    <path d="M39 30H76V34H39Z" className="fill-bg" strokeWidth="1.6" />
    <path d="M42 31h10" stroke="#fff" strokeWidth=".7" opacity=".7" />
    <circle cx="28" cy="32" r="1.8" className="f2" />
    <path d="M60 34v8h5v-8M70 34v6h4v-6" className="f2" strokeWidth="1" />
  </g>);
  for (let i = 0; i < 12; i++) out.push(<path key={`s${i}`} d={`M${P(r() * W)} ${P(r() * H)}l${P(2 + r() * 3)} ${P(-1 - r() * 2)}`} strokeWidth=".9" className={i % 2 ? 'k2' : undefined} opacity=".6" />);
  return out;
}

/** Схема-дерево: ветвящиеся дорожки с узлами. */
function circuitTree(r: Rand): ReactNode[] {
  const out: ReactNode[] = [];
  const cx = P(CX + (r() - 0.5) * 8);
  out.push(<path key="trunk" d={`M${cx} 64V34`} strokeWidth="2.4" />);
  const branch = (x: number, y: number, dir: number, depth: number, i: number) => {
    if (depth > 1) {
      out.push(<circle key={`l${i}`} cx={P(x)} cy={P(y)} r={2.2} className="f2" />);
      return;
    }
    const len = 12 - depth * 2 + r() * 4;
    const nx = x + dir * len;
    const ny = y - len * (0.9 + r() * 0.5);
    out.push(<path key={`b${i}`} d={`M${P(x)} ${P(y)}H${P(x + dir * len * 0.5)}L${P(nx)} ${P(ny)}`} strokeWidth={P(2 - depth * 0.5)} className={depth % 2 ? 'k2' : undefined} />);
    out.push(<circle key={`n${i}`} cx={P(nx)} cy={P(ny)} r={1.6} className="f1" />);
    branch(nx, ny, dir, depth + 1, i * 3 + 1);
    branch(nx, ny, -dir, depth + 1, i * 3 + 2);
  };
  branch(cx, 40, 1, 0, 1);
  branch(cx, 40, -1, 0, 7);
  out.push(<circle key="root" cx={cx} cy={34} r={3.4} className="fill-bg" strokeWidth="1.4" />, <circle key="rc" cx={cx} cy={34} r={1.4} fill="#fff" stroke="none" />);
  out.push(<path key="gnd" d={`M${cx - 14} 60H${cx + 14}M${cx - 8} 63H${cx + 8}`} strokeWidth="1" opacity=".6" />);
  return out;
}

const MOTIFS = { chip, drone, katana, dna, eye, lock, skull, satellite, hourglass, dice, wifi, terminal, gear, crystal, claw, radar, keycard, circuitTree, blades, beam, blast, shield, firewall, spores, virus, reticle, ascend, stream, bolt, heal, reactor, shockwave, stack, glitch, coins };
type MotifId = keyof typeof MOTIFS;

interface Mini {
  type: string;
  rarity: string;
  classId: string;
  target: string;
  effects: { type: string; status?: string; target?: string; amount?: number; win?: Mini['effects']; lose?: Mini['effects'] }[];
}

/** Мотивы-«почерк» класса: подмешиваются в пул каждой категории. */
const FLAVOR: Record<string, MotifId[]> = {
  samurai: ['katana', 'claw'],
  droneop: ['drone', 'radar'],
  chrono: ['hourglass', 'satellite'],
  vabanker: ['dice', 'skull'],
  biohacker: ['dna', 'claw'],
  engineer: ['gear', 'chip'],
  ghost: ['eye', 'skull'],
  phreaker: ['wifi', 'satellite'],
  netrunner: ['terminal', 'circuitTree'],
  neutral: ['crystal', 'keycard'],
};

function pickMotif(def: Mini, h: number): MotifId {
  const flat = (l: Mini['effects']): Mini['effects'] => l.flatMap((e) => (e.type === 'gamble' ? [e, ...flat(e.win ?? []), ...flat(e.lose ?? [])] : [e]));
  const fx = flat(def.effects);
  const all = def.target === 'all_enemies' || fx.some((e) => e.target === 'all_enemies');
  const has = (t: string) => fx.some((e) => e.type === t);
  const st = (...ids: string[]) => fx.some((e) => e.type === 'apply_status' && ids.includes(e.status ?? ''));
  const fl = FLAVOR[def.classId] ?? FLAVOR.neutral ?? [];
  const pick = (base: MotifId[]): MotifId => {
    const pool = [...base, ...fl];
    return pool[(h >>> 4) % pool.length] ?? base[0] ?? 'blast';
  };
  if (def.type === 'curse' || def.type === 'status') return 'glitch';
  if (def.classId === 'vabanker' && has('gamble') && !has('damage')) return pick(['coins', 'dice', 'skull']);
  if (has('damage')) return all ? pick(['shockwave', 'blast', 'radar']) : pick(['blades', 'beam', 'blast', 'reticle', 'bolt', 'virus']);
  if (st('virus', 'poison')) return all ? pick(['shockwave', 'spores', 'virus']) : pick(['spores', 'virus', 'skull']);
  if (st('vulnerable', 'weak', 'frail')) return pick(['reticle', 'eye', 'radar']);
  if (def.type === 'power' && !has('block')) return pick(['reactor', 'circuitTree', 'crystal']);
  if (st('strength', 'dexterity', 'ritual')) return pick(['ascend', 'reactor', 'crystal']);
  if (st('plating', 'thorns')) return pick(['shield', 'firewall', 'gear']);
  if (has('block')) return pick(['shield', 'firewall', 'lock']);
  if (has('heal') || has('heal_pct') || st('regen')) return pick(['heal', 'dna', 'crystal']);
  if (has('gain_energy')) return pick(['bolt', 'reactor', 'chip']);
  if (has('draw')) return pick(['stream', 'terminal', 'satellite']);
  if (has('add_card')) return pick(['stack', 'terminal', 'circuitTree']);
  if (has('gain_gold')) return pick(['coins', 'dice', 'keycard']);
  if (def.type === 'power') return pick(['reactor', 'circuitTree', 'crystal']);
  const any = Object.keys(MOTIFS) as MotifId[];
  return any[h % any.length] ?? 'blast';
}

function loadDef(id: string): Mini | null {
  try {
    return cardStats(id, false).def as unknown as Mini;
  } catch {
    return null;
  }
}

export const CardArt = memo(function CardArt({ id, upgraded = false }: { id: string; upgraded?: boolean }) {
  const uid = useId().replace(/:/g, '');
  const h = hash(id);
  const r = rng(h);
  const def = loadDef(id);
  const kind: MotifId = def ? pickMotif(def, h) : 'blast';
  const bgFn = BG[def?.classId ?? 'neutral'] ?? bgNeutral;
  const bg = bgFn(rng(h ^ 0x9e3779b9));
  const hero = (MOTIFS[kind] ?? blast)(r);
  const rarity = def?.rarity ?? 'common';
  const flip = (h >> 5) % 3 === 0;
  // Индивидуальность: у каждой карты свой поворот/масштаб/сдвиг главного мотива и второй мотив-«печать»,
  // чтобы карты с похожими эффектами не выглядели одинаково.
  const vr = rng(h ^ 0x5bd1e995);
  const rot = P((vr() - 0.5) * 30);
  const sc = P(0.78 + vr() * 0.3);
  const dx = P((vr() - 0.5) * 16);
  const dy = P((vr() - 0.5) * 8);
  const ids = Object.keys(MOTIFS) as MotifId[];
  const others = ids.filter((m) => m !== kind && m !== 'glitch');
  const second = others[(h >>> 9) % others.length] ?? 'stack';
  const secondArt = (MOTIFS[second] ?? blast)(rng(h ^ 0x27d4eb2f));
  const sx = vr() < 0.5 ? 4 : 66;
  const sy = vr() < 0.5 ? 2 : 34;
  const sparkles: ReactNode[] = [];
  if (rarity === 'rare' || rarity === 'special') {
    const sr = rng(h + 7);
    for (let i = 0; i < 7; i++) {
      const x = P(6 + sr() * 88);
      const y = P(5 + sr() * 54);
      sparkles.push(<path key={`sp${i}`} className="art-twinkle" style={{ animationDelay: `${P(sr() * 3)}s`, transformOrigin: `${x}px ${y}px` }} d={`M${x} ${y - 3}L${x + 0.8} ${y - 0.8}L${x + 3} ${y}L${x + 0.8} ${y + 0.8}L${x} ${y + 3}L${x - 0.8} ${y + 0.8}L${x - 3} ${y}L${x - 0.8} ${y - 0.8}Z`} fill="#fff" stroke="none" />);
    }
  }
  return (
    <svg className={`card-art card-art--${kind}${rarity === 'rare' || rarity === 'special' ? ' card-art--foil' : ''}`} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" fill="none" stroke="currentColor" aria-hidden="true">
      <defs>
        <radialGradient id={`${uid}g`} cx="50%" cy="48%" r="60%">
          <stop offset="0" style={{ stopColor: 'var(--accent)', stopOpacity: 0.38 }} />
          <stop offset="0.55" style={{ stopColor: 'var(--accent-2)', stopOpacity: 0.1 }} />
          <stop offset="1" style={{ stopColor: '#000', stopOpacity: 0 }} />
        </radialGradient>
        <linearGradient id={`${uid}h`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff2bd6" />
          <stop offset="0.25" stopColor="#ffe53a" />
          <stop offset="0.5" stopColor="#3dff8a" />
          <stop offset="0.75" stopColor="#00f0ff" />
          <stop offset="1" stopColor="#b48cff" />
        </linearGradient>
        <linearGradient id={`${uid}f`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.7" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity=".6" />
        </linearGradient>
      </defs>
      <rect width={W} height={H} fill={`url(#${uid}g)`} stroke="none" />
      <g className="art-bg" opacity=".42">{bg}</g>
      <g className="art-second" opacity=".5" transform={`translate(${sx} ${sy}) scale(.3)`}>{secondArt}</g>
      <g transform={`translate(${W / 2 + dx} ${H / 2 + dy}) rotate(${rot}) scale(${sc}) translate(${-W / 2} ${-H / 2})`}>
        <g className="art-hero" transform={flip ? `translate(${W} 0) scale(-1 1)` : undefined}>{hero}</g>
      </g>
      <rect width={W} height={H} fill={`url(#${uid}f)`} stroke="none" />
      {rarity === 'rare' || rarity === 'special' ? <rect className="art-holo" width={W} height={H} fill={`url(#${uid}h)`} stroke="none" /> : null}
      {sparkles}
      {upgraded ? (
        <g className="art-up" stroke="#3dff8a">
          <path d="M3 10V3h7M90 3h7v7M97 54v7H90M10 61H3v-7" strokeWidth="1.2" />
          <path d="M86 12v6M83 15h6" strokeWidth="1.6" />
        </g>
      ) : null}
    </svg>
  );
});
