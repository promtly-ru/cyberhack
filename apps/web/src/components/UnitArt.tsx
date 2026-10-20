import { memo } from 'react';
import type { ClassId } from '../game/engine';

export const CLASS_COLOR: Record<ClassId, string> = {
  netrunner: '#00f0ff',
  phreaker: '#e8ff3a',
  ghost: '#b48cff',
  samurai: '#ff5a36',
  engineer: '#ff9d1c',
  biohacker: '#3dff8a',
  droneop: '#4da3ff',
  chrono: '#ff4fd8',
  vabanker: '#ffd23f',
};

export const PlayerArt = memo(function PlayerArt({ classId }: { classId: ClassId }) {
  return (
    <svg className="unit-art unit-art--player" viewBox="0 0 120 150" fill="none" stroke="currentColor" style={{ color: CLASS_COLOR[classId] }} aria-hidden="true">
      <ellipse cx="60" cy="146" rx="46" ry="4" className="fill-glow-soft" stroke="none" opacity=".7" />
      <g className="art-float">
        {/* Плечевые накладки и свечение сердечника */}
        <path d="M6 150c0-14 6-24 14-30l12 10-8 20zM114 150c0-14-6-24-14-30l-12 10 8 20z" className="fill-deep" strokeWidth="1.4" />
        <path d="M10 140h10M100 140h10" strokeWidth="1.4" opacity=".7" />
        <g className="art-breathe" style={{ transformOrigin: '60px 130px' }}>
        {/* Тело */}
        <path d="M12 150c2-30 20-44 48-44s46 14 48 44z" className="fill-deep" strokeWidth="1.6" />
        <path d="M40 112l20 22 20-22" strokeWidth="1.2" opacity=".6" />
        <path d="M60 114v30" strokeWidth="1" opacity=".5" />
        <circle cx="60" cy="126" r="3.2" className="fill-glow art-pulse" stroke="none" style={{ transformOrigin: '60px 126px' }} />
        </g>
        {/* Капюшон */}
        <path d="M60 8C34 8 21 31 21 58l-4 40c12 9 27 13 43 13s31-4 43-13l-4-40C99 31 86 8 60 8z" className="fill-deep" strokeWidth="2" />
        <path d="M60 8c-6 10-8 20-8 30M30 40c6 4 10 10 12 18M90 40c-6 4-10 10-12 18" strokeWidth="1" opacity=".45" />
        {/* Лицо в тени */}
        <path d="M60 30c-14 0-23 13-23 29 0 15 10 26 23 26s23-11 23-26c0-16-9-29-23-29z" className="fill-void" strokeWidth="1.2" />
        {/* Визор */}
        <path d="M40 54h40l-4 9H44z" className="fill-glow visor" strokeWidth="1.4" />
        <path d="M44 58.5h32" stroke="#fff" strokeWidth="1" opacity=".85" />
        <rect className="art-visor-scan" x="44" y="55" width="6" height="7" fill="#fff" stroke="none" opacity=".55" />
        <path d="M22 50c0-18 10-34 30-40" strokeWidth="1.6" opacity=".55" />
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
        {classId === 'droneop' ? (
          <>
            <circle cx="14" cy="30" r="5" className="fill-glow-soft" strokeWidth="1.6" />
            <path d="M6 30h16M14 24v12" strokeWidth="1.2" opacity=".7" />
            <circle cx="106" cy="42" r="4" className="fill-glow-soft" strokeWidth="1.6" />
            <path d="M99 42h14" strokeWidth="1.2" opacity=".7" />
          </>
        ) : null}
        {classId === 'vabanker' ? (
          <>
            <path d="M44 14l-8 10 8 10 8-10zM76 14l-8 10 8 10 8-10z" className="fill-glow-soft" strokeWidth="1.4" />
            <path d="M40 24h8M72 24h8" strokeWidth="1" opacity=".7" />
            <circle cx="60" cy="16" r="3" className="fill-glow" strokeWidth="1.2" />
          </>
        ) : null}
        {classId === 'chrono' ? (
          <>
            <circle cx="60" cy="16" r="9" className="fill-glow-soft" strokeWidth="1.6" />
            <path d="M60 16v-5M60 16l4 3" strokeWidth="1.6" />
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

export { EnemyArt } from './EnemyArt';
