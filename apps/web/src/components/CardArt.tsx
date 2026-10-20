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

const MOTIFS = { blades, beam, blast, shield, firewall, spores, virus, reticle, ascend, stream, bolt, heal, reactor, shockwave, stack, glitch, coins };
type MotifId = keyof typeof MOTIFS;

interface Mini {
  type: string;
  rarity: string;
  classId: string;
  target: string;
  effects: { type: string; status?: string; target?: string; amount?: number; win?: Mini['effects']; lose?: Mini['effects'] }[];
}

function pickMotif(def: Mini, h: number): MotifId {
  const flat = (l: Mini['effects']): Mini['effects'] => l.flatMap((e) => (e.type === 'gamble' ? [e, ...flat(e.win ?? []), ...flat(e.lose ?? [])] : [e]));
  const fx = flat(def.effects);
  const all = def.target === 'all_enemies' || fx.some((e) => e.target === 'all_enemies');
  const has = (t: string) => fx.some((e) => e.type === t);
  const st = (...ids: string[]) => fx.some((e) => e.type === 'apply_status' && ids.includes(e.status ?? ''));
  if (def.type === 'curse' || def.type === 'status') return 'glitch';
  if (def.classId === 'vabanker' && has('gamble') && !has('damage')) return 'coins';
  if (has('damage')) {
    if (all) return 'shockwave';
    const v: MotifId[] = def.classId === 'vabanker' ? ['coins', 'blast', 'beam'] : def.classId === 'samurai' ? ['blades', 'blades', 'blast'] : def.classId === 'netrunner' || def.classId === 'phreaker' ? ['beam', 'blast', 'beam'] : ['blades', 'beam', 'blast'];
    return v[h % v.length] ?? 'blast';
  }
  if (st('virus', 'poison')) return all ? 'shockwave' : h % 2 ? 'spores' : 'virus';
  if (st('vulnerable', 'weak', 'frail')) return 'reticle';
  if (def.type === 'power' && !has('block')) return 'reactor';
  if (st('strength', 'dexterity', 'ritual')) return 'ascend';
  if (st('plating', 'thorns')) return h % 2 ? 'firewall' : 'shield';
  if (has('block')) return h % 3 === 0 ? 'firewall' : 'shield';
  if (has('heal') || st('regen')) return 'heal';
  if (has('gain_energy')) return 'bolt';
  if (has('draw')) return 'stream';
  if (has('add_card')) return 'stack';
  if (has('gain_gold')) return 'coins';
  if (def.type === 'power') return 'reactor';
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
      <g className="art-hero" transform={flip ? `translate(${W} 0) scale(-1 1)` : undefined}>{hero}</g>
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
