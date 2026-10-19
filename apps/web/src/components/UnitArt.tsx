import { memo, type ReactNode } from 'react';
import type { ClassId } from '../game/engine';
import { hash, r2, rng } from '../ui/rand';

export const CLASS_COLOR: Record<ClassId, string> = {
  netrunner: '#00f0ff',
  phreaker: '#e8ff3a',
  ghost: '#b48cff',
  samurai: '#ff5a36',
  engineer: '#ff9d1c',
  biohacker: '#3dff8a',
};

export const PlayerArt = memo(function PlayerArt({ classId }: { classId: ClassId }) {
  return (
    <svg className="unit-art unit-art--player" viewBox="0 0 120 150" fill="none" stroke="currentColor" style={{ color: CLASS_COLOR[classId] }} aria-hidden="true">
      <g className="art-float">
        {/* Тело */}
        <path d="M12 150c2-30 20-44 48-44s46 14 48 44z" className="fill-deep" strokeWidth="1.6" />
        <path d="M40 112l20 22 20-22" strokeWidth="1.2" opacity=".6" />
        {/* Капюшон */}
        <path d="M60 8C34 8 21 31 21 58l-4 40c12 9 27 13 43 13s31-4 43-13l-4-40C99 31 86 8 60 8z" className="fill-deep" strokeWidth="2" />
        <path d="M60 8c-6 10-8 20-8 30M30 40c6 4 10 10 12 18M90 40c-6 4-10 10-12 18" strokeWidth="1" opacity=".45" />
        {/* Лицо в тени */}
        <path d="M60 30c-14 0-23 13-23 29 0 15 10 26 23 26s23-11 23-26c0-16-9-29-23-29z" className="fill-void" strokeWidth="1.2" />
        {/* Визор */}
        <path d="M40 54h40l-4 9H44z" className="fill-glow visor" strokeWidth="1.4" />
        <path d="M44 58.5h32" stroke="#fff" strokeWidth="1" opacity=".85" />
        {/* Схемы на капюшоне */}
        <path d="M24 84h10l4-6h6M96 84H86l-4-6h-6" strokeWidth="1" opacity=".7" />
        <circle cx="44" cy="78" r="1.5" fill="currentColor" stroke="none" />
        <circle cx="76" cy="78" r="1.5" fill="currentColor" stroke="none" />
        {classId === 'netrunner' ? <path d="M34 20l-8-10M86 20l8-10M60 8V0" strokeWidth="1.6" opacity=".8" /> : null}
        {classId === 'phreaker' ? <path d="M40 14L28 0M80 14L92 0M28 0l-4 4M92 0l4 4" strokeWidth="1.8" /> : null}
        {classId === 'ghost' ? <path d="M30 70c8 10 18 14 30 14s22-4 30-14M60 86v16" strokeWidth="1.4" opacity=".7" /> : null}
        {classId === 'engineer' ? (
          <>
            <path d="M26 30c0-16 15-26 34-26s34 10 34 26z" className="fill-deep" strokeWidth="2.2" />
            <path d="M60 4v26M20 30h80" strokeWidth="1.6" />
            <circle cx="60" cy="18" r="6" className="fill-glow-soft" strokeWidth="1.4" />
            <path d="M12 96h20v10H12zM88 96h20v10H88z" strokeWidth="2" />
          </>
        ) : null}
        {classId === 'samurai' ? (
          <>
            <path d="M24 34c10-20 26-28 36-28s26 8 36 28" className="fill-deep" strokeWidth="2.2" />
            <path d="M28 22L14 2l22 10M92 22L106 2 84 12" strokeWidth="2" />
            <path d="M104 148L116 70M101 128l9 4" strokeWidth="2.4" />
          </>
        ) : null}
        {classId === 'biohacker' ? (
          <>
            <path d="M18 98c-10-8-14-22-10-34M102 98c10-8 14-22 10-34M8 64l-4-8M112 64l4-8" strokeWidth="2" />
            <path d="M60 34v14M53 41h14" strokeWidth="2" opacity=".9" />
          </>
        ) : null}
      </g>
      {/* Голо-клавиатура */}
      <g className="holo">
        <path d="M24 126h72l10 14H14z" className="fill-glow-soft" strokeWidth="1.4" />
        <path d="M30 131h60M26 136h68M40 126l-4 14M56 126l-1 14M72 126l2 14M86 126l6 14" strokeWidth=".7" opacity=".7" />
      </g>
    </svg>
  );
});

type Archetype = 'wall' | 'orb' | 'drone' | 'daemon' | 'crystal' | 'oracle';

function archetypeFor(defId: string, tier: string): Archetype {
  const id = defId.toLowerCase();
  if (tier === 'boss' || /oracle|ai_|_ai|core|warden/.test(id)) return 'oracle';
  if (/wall|firewall|gate|barrier/.test(id)) return 'wall';
  if (/virus|scan|cerber|guard|watch/.test(id)) return 'orb';
  if (/trace|probe|drone|hunter|bot/.test(id)) return 'drone';
  if (/daemon|demon|worm|hound/.test(id)) return 'daemon';
  if (/ice|crystal|cold|glass/.test(id)) return 'crystal';
  const all: Archetype[] = ['wall', 'orb', 'drone', 'daemon', 'crystal'];
  return all[hash(id) % all.length] ?? 'orb';
}

function eyes(r: () => number, cx: number, cy: number, spread: number): ReactNode {
  return (
    <>
      <circle cx={cx - spread} cy={cy} r={3.4} className="fill-glow eye" strokeWidth="1" />
      <circle cx={cx + spread} cy={cy} r={3.4} className="fill-glow eye" strokeWidth="1" />
      {r() < 0.5 ? <circle cx={cx} cy={cy - 9} r={2} className="fill-glow eye" strokeWidth=".8" /> : null}
    </>
  );
}

export const EnemyArt = memo(function EnemyArt({ defId, tier }: { defId: string; tier: 'normal' | 'elite' | 'boss' }) {
  const kind = archetypeFor(defId, tier);
  const r = rng(defId);
  let body: ReactNode;
  switch (kind) {
    case 'wall': {
      const rows: ReactNode[] = [];
      for (let y = 34; y < 92; y += 10) {
        const off = (y / 10) % 2 ? 0 : 7;
        for (let x = 22 + off; x < 98; x += 14) rows.push(<rect key={`${x}-${y}`} x={x} y={y} width={12} height={8} strokeWidth=".7" opacity={r2(0.35 + r() * 0.5)} className={r() < 0.12 ? 'fill-glow-soft' : undefined} />);
      }
      body = (
        <>
          <path d="M60 10l44 14v38c0 26-20 42-44 50-24-8-44-24-44-50V24z" className="fill-deep" strokeWidth="2.2" />
          <clipPath id={`clip-${defId}`}>
            <path d="M60 14l40 13v35c0 24-18 38-40 46-22-8-40-22-40-46V27z" />
          </clipPath>
          <g clipPath={`url(#clip-${defId})`}>{rows}</g>
          <path d="M34 58h52" strokeWidth="4" className="visor" />
          <path d="M34 58h52" stroke="#fff" strokeWidth="1.2" opacity=".9" />
        </>
      );
      break;
    }
    case 'orb':
      body = (
        <>
          <path d="M30 96c-6 8-14 10-20 10M90 96c6 8 14 10 20 10M48 100l-6 16M72 100l6 16" strokeWidth="1.6" opacity=".7" />
          <circle cx="60" cy="58" r="40" className="fill-deep" strokeWidth="2" />
          <g className="spin-slow" style={{ transformOrigin: '60px 58px' }}>
            <circle cx="60" cy="58" r="48" strokeDasharray="10 6 2 6" strokeWidth="1.2" opacity=".75" />
          </g>
          <circle cx="60" cy="58" r="22" strokeWidth="1.4" />
          <circle cx="60" cy="58" r="12" className="fill-glow eye" strokeWidth="1" />
          <circle cx="60" cy="58" r="4" fill="#fff" stroke="none" />
          <path d="M22 58h14M84 58h14" strokeWidth="1.2" />
        </>
      );
      break;
    case 'drone':
      body = (
        <>
          <path d="M60 16l30 42-30 42-30-42z" className="fill-deep" strokeWidth="2" />
          <path d="M30 58L6 46v24zM90 58l24-12v24z" className="fill-glow-soft" strokeWidth="1.4" />
          <path d="M60 16v84M42 40h36M42 76h36" strokeWidth=".8" opacity=".5" />
          <g className="spin" style={{ transformOrigin: '60px 58px' }}>
            <path d="M60 58L60 30" strokeWidth="2" className="visor" />
          </g>
          <circle cx="60" cy="58" r="9" className="fill-glow eye" strokeWidth="1.2" />
          <circle cx="60" cy="58" r="28" strokeWidth=".7" strokeDasharray="3 5" opacity=".7" />
        </>
      );
      break;
    case 'daemon':
      body = (
        <>
          <path d="M28 30L14 4l26 18M92 30l14-26-26 18" strokeWidth="2" className="fill-glow-soft" />
          <path d="M60 18c-24 0-38 18-38 40 0 16 8 28 18 36l4 16h32l4-16c10-8 18-20 18-36 0-22-14-40-38-40z" className="fill-deep" strokeWidth="2" />
          <path d="M40 54l14 6M80 54l-14 6" strokeWidth="2.6" className="visor" />
          {eyes(r, 60, 66, 13)}
          <path d="M46 92l5-6 5 6 4-6 4 6 5-6 5 6" strokeWidth="1.4" />
        </>
      );
      break;
    case 'crystal': {
      const shards: ReactNode[] = [];
      const n = 5 + Math.floor(r() * 3);
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.42;
        const len = 34 + r() * 26;
        const bx = 60 + Math.cos(a + Math.PI / 2) * 6;
        const tx = r2(60 + Math.cos(a) * len);
        const ty = r2(84 + Math.sin(a) * len);
        shards.push(<path key={i} d={`M${r2(bx - 8)} 86L${tx} ${ty}L${r2(bx + 8)} 86z`} className={i % 2 ? 'fill-glow-soft' : 'fill-deep'} strokeWidth="1.6" />);
      }
      body = (
        <>
          {shards}
          <path d="M26 86h68l-8 16H34z" className="fill-deep" strokeWidth="2" />
          <path d="M44 94h32" strokeWidth="3" className="visor" />
        </>
      );
      break;
    }
    case 'oracle':
      body = (
        <>
          <g className="spin-slow" style={{ transformOrigin: '60px 60px' }}>
            <circle cx="60" cy="60" r="56" strokeDasharray="2 8" strokeWidth="1.6" />
            <circle cx="60" cy="60" r="50" strokeDasharray="30 10 4 10" strokeWidth="1" opacity=".7" />
          </g>
          <g className="spin-rev" style={{ transformOrigin: '60px 60px' }}>
            <path d="M60 14l40 70H20z" strokeWidth="1.2" opacity=".55" />
          </g>
          <path d="M60 22l34 62H26z" className="fill-deep" strokeWidth="2.2" />
          <path d="M34 66s10-14 26-14 26 14 26 14-10 12-26 12-26-12-26-12z" className="fill-void" strokeWidth="1.6" />
          <circle cx="60" cy="65" r="8" className="fill-glow eye" strokeWidth="1.2" />
          <circle cx="60" cy="65" r="3" fill="#fff" stroke="none" />
          <path d="M60 4v10M18 24l8 6M102 24l-8 6" strokeWidth="1.6" />
        </>
      );
      break;
  }
  return (
    <svg className={`unit-art unit-art--enemy arch-${kind}`} viewBox="0 0 120 120" fill="none" stroke="currentColor" aria-hidden="true">
      <g className="art-float">{body}</g>
    </svg>
  );
});
