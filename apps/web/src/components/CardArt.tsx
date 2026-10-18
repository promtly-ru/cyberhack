import { memo, type ReactNode } from 'react';
import { hash, r2, rng } from '../ui/rand';

/**
 * «Иллюстрация» карты — детерминированный процедурный SVG-узор по id карты.
 * Цвета берутся из CSS-переменных карты (--accent, --accent-2) через currentColor и классы.
 */
const W = 100;
const H = 64;

type Rand = () => number;

function circuit(r: Rand): ReactNode[] {
  const out: ReactNode[] = [];
  const g = 8;
  const n = 7 + Math.floor(r() * 5);
  for (let i = 0; i < n; i++) {
    let x = Math.round((r() * W) / g) * g;
    let y = Math.round((r() * H) / g) * g;
    let d = `M${x} ${y}`;
    const steps = 2 + Math.floor(r() * 4);
    for (let s = 0; s < steps; s++) {
      const dir = Math.floor(r() * 4);
      const len = g * (1 + Math.floor(r() * 3));
      if (dir === 0) x += len;
      else if (dir === 1) x -= len;
      else if (dir === 2) y += len;
      else y -= len;
      x = Math.max(2, Math.min(W - 2, x));
      y = Math.max(2, Math.min(H - 2, y));
      d += ` L${x} ${y}`;
    }
    const alt = r() < 0.3;
    out.push(<path key={`t${i}`} d={d} className={alt ? 'k2' : undefined} strokeWidth={r() < 0.3 ? 1.6 : 0.9} opacity={r2(0.5 + r() * 0.5)} />);
    out.push(<circle key={`p${i}`} cx={x} cy={y} r={1.6} className={alt ? 'f2' : 'f1'} />);
  }
  if (r() < 0.7) {
    const cx = 30 + r() * 40;
    const cy = 20 + r() * 24;
    out.push(<rect key="chip" x={r2(cx - 9)} y={r2(cy - 7)} width={18} height={14} rx={1.5} strokeWidth={1.4} className="fill-bg" />);
    for (let k = 0; k < 4; k++) out.push(<path key={`pin${k}`} d={`M${r2(cx - 6 + k * 4)} ${r2(cy - 7)} v-3 M${r2(cx - 6 + k * 4)} ${r2(cy + 7)} v3`} strokeWidth={0.8} />);
    out.push(<rect key="core" x={r2(cx - 3)} y={r2(cy - 3)} width={6} height={6} className="f2" />);
  }
  return out;
}

function rings(r: Rand): ReactNode[] {
  const out: ReactNode[] = [];
  const cx = r2(50 + (r() - 0.5) * 30);
  const cy = r2(32 + (r() - 0.5) * 14);
  const n = 4 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const rad = r2(5 + i * (5 + r() * 3));
    const dash = `${r2(2 + r() * 14)} ${r2(1 + r() * 6)}`;
    out.push(<circle key={i} cx={cx} cy={cy} r={rad} strokeDasharray={dash} strokeWidth={r2(0.6 + r() * 1.4)} className={i % 2 ? 'k2' : undefined} opacity={r2(0.55 + r() * 0.45)} transform={`rotate(${Math.floor(r() * 360)} ${cx} ${cy})`} />);
  }
  out.push(<path key="x" d={`M${cx - 40} ${cy}H${cx + 40}M${cx} ${cy - 30}V${cy + 30}`} strokeWidth={0.5} opacity={0.5} />);
  out.push(<circle key="c" cx={cx} cy={cy} r={2.5} className="f2" />);
  return out;
}

function wave(r: Rand): ReactNode[] {
  const out: ReactNode[] = [];
  const n = 4 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const amp = 3 + r() * 12;
    const f = 0.05 + r() * 0.12;
    const ph = r() * 6.28;
    const base = 10 + (i / (n - 1)) * 44;
    let d = '';
    for (let x = 0; x <= W; x += 3) {
      const y = base + Math.sin(x * f + ph) * amp * Math.sin((x / W) * Math.PI);
      d += `${x === 0 ? 'M' : 'L'}${x} ${r2(y)}`;
    }
    out.push(<path key={i} d={d} strokeWidth={r2(0.7 + r() * 1.3)} className={i % 3 === 1 ? 'k2' : undefined} opacity={r2(0.45 + r() * 0.55)} />);
  }
  for (let i = 0; i < 10; i++) out.push(<rect key={`b${i}`} x={r2(r() * W)} y={r2(r() * H)} width={r2(1 + r() * 6)} height={1.2} className="f2" opacity={0.7} />);
  return out;
}

function hexes(r: Rand): ReactNode[] {
  const out: ReactNode[] = [];
  const s = 7;
  const hw = Math.sqrt(3) * s;
  for (let row = -1; row < 8; row++) {
    for (let col = -1; col < 9; col++) {
      if (r() > 0.55) continue;
      const cx = col * hw + (row % 2 ? hw / 2 : 0);
      const cy = row * s * 1.5;
      let d = '';
      for (let k = 0; k < 6; k++) {
        const a = (Math.PI / 3) * k + Math.PI / 6;
        d += `${k ? 'L' : 'M'}${r2(cx + Math.cos(a) * s * 0.92)} ${r2(cy + Math.sin(a) * s * 0.92)}`;
      }
      const fill = r();
      out.push(<path key={`${row}-${col}`} d={`${d}Z`} strokeWidth={0.8} className={fill < 0.12 ? 'f2 k2' : fill < 0.3 ? 'fsoft' : undefined} opacity={r2(0.35 + r() * 0.65)} />);
    }
  }
  return out;
}

function bars(r: Rand): ReactNode[] {
  const out: ReactNode[] = [];
  const n = 14 + Math.floor(r() * 8);
  const bw = W / n;
  for (let i = 0; i < n; i++) {
    const h = 6 + r() * 40 * Math.sin(((i + 0.5) / n) * Math.PI);
    out.push(<rect key={i} x={r2(i * bw + bw * 0.2)} y={r2(H - 6 - h)} width={r2(bw * 0.6)} height={r2(h)} className={r() < 0.2 ? 'f2' : 'fsoft'} strokeWidth={0.6} />);
  }
  for (let y = 6; y < H - 10; y += 7) out.push(<path key={`g${y}`} d={`M0 ${y}H${W}`} strokeWidth={0.3} opacity={0.35} />);
  out.push(<path key="base" d={`M0 ${H - 5}H${W}`} strokeWidth={1.2} className="k2" />);
  return out;
}

function burst(r: Rand): ReactNode[] {
  const out: ReactNode[] = [];
  const cx = r2(50 + (r() - 0.5) * 20);
  const cy = r2(32 + (r() - 0.5) * 10);
  const n = 18 + Math.floor(r() * 14);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.1;
    const r0 = 6 + r() * 6;
    const r1 = r0 + 8 + r() * 34;
    out.push(<path key={i} d={`M${r2(cx + Math.cos(a) * r0)} ${r2(cy + Math.sin(a) * r0)}L${r2(cx + Math.cos(a) * r1)} ${r2(cy + Math.sin(a) * r1)}`} strokeWidth={r2(0.5 + r() * 1.2)} className={i % 4 === 0 ? 'k2' : undefined} opacity={r2(0.4 + r() * 0.6)} />);
  }
  const pts = 5 + Math.floor(r() * 4);
  let d = '';
  for (let k = 0; k < pts * 2; k++) {
    const a = (k / (pts * 2)) * Math.PI * 2;
    const rad = k % 2 ? 4 : 9;
    d += `${k ? 'L' : 'M'}${r2(cx + Math.cos(a) * rad)} ${r2(cy + Math.sin(a) * rad)}`;
  }
  out.push(<path key="star" d={`${d}Z`} className="f2" strokeWidth={0.8} />);
  return out;
}

const PATTERNS = [circuit, rings, wave, hexes, bars, burst];

export const CardArt = memo(function CardArt({ id }: { id: string }) {
  const h = hash(id);
  const r = rng(h);
  const gen = PATTERNS[h % PATTERNS.length] ?? circuit;
  const body = gen(r);
  return (
    <svg className="card-art" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" fill="none" stroke="currentColor" aria-hidden="true">
      {body}
    </svg>
  );
});
