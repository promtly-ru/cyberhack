import { memo, useId, type ReactNode } from 'react';
import { hash, r2, rng } from '../ui/rand';

/**
 * Процедурные портреты врагов (viewBox 120x120). Цвет — currentColor (--unit-color).
 * Архетип выбирается по id/тиру; элиты получают ауру и шипы, боссы — корону, орбиты и ядро.
 * Анимации — CSS-классы из polish.css (art-float, art-pulse, art-sway, art-spin ...).
 */
type Rand = () => number;

export type Archetype =
  | 'wall' | 'orb' | 'drone' | 'daemon' | 'crystal' | 'oracle'
  | 'spider' | 'worm' | 'hound' | 'mask' | 'hydra' | 'bomb' | 'swarm' | 'monolith' | 'kraken'
  | 'twin' | 'reaper' | 'siren' | 'phantom' | 'colossus' | 'leech' | 'turret'
  | 'cerberus' | 'chimera' | 'archon' | 'nexus' | 'singularity';

const EXACT: Record<string, Archetype> = {
  a1_drone: 'drone', a1_proxy: 'turret', a1_spam_bot: 'swarm', a1_antivirus: 'orb', a1_script_bot: 'spider',
  a1_cultist: 'mask', a1_ice_sentinel: 'crystal', a1_sentry_a: 'monolith', a1_sentry_b: 'turret', a1_phisher: 'leech',
  a1_rogue_scanner: 'orb', a1_cache_rat: 'spider', a1_elite_warden: 'colossus',
  a2_crypto_worm: 'worm', a2_tracer: 'drone', a2_honeypot: 'bomb', a2_firewall_daemon: 'wall', a2_admin_bot: 'mask',
  a2_ice_hound: 'hound', a2_packet_sniffer: 'spider', a2_ransom_bot: 'bomb', a2_data_warden: 'monolith',
  a2_data_wraith: 'phantom', a2_trap_node: 'bomb', a2_elite_hydra: 'hydra',
  a3_replicator: 'swarm', a3_killswitch: 'reaper', a3_netwatch: 'orb', a3_black_ice: 'crystal', a3_sec_daemon: 'daemon',
  a3_ai_hunter: 'spider', a3_swarm_node: 'swarm', a3_black_wall: 'wall', a3_mind_flayer: 'kraken', a3_ward: 'turret',
  a3_elite_colossus: 'colossus',
  a4_phantom: 'phantom', a4_leech: 'leech', a4_mirror: 'mask', a4_logic_bomb: 'bomb', a4_overseer: 'monolith',
  a4_nano: 'swarm', a4_core_guard: 'colossus', a4_siren: 'siren', a4_void_warden: 'reaper', a4_twin_core: 'twin',
  boss_cerberus: 'cerberus', boss_chimera: 'chimera', boss_omnis: 'oracle', boss_hydra: 'hydra',
  boss_leviathan: 'kraken', boss_archon: 'archon', boss_nexus: 'nexus', boss_singularity: 'singularity',
};

const RULES: [RegExp, Archetype][] = [
  [/singular|void_core|black_hole/, 'singularity'],
  [/nexus/, 'nexus'],
  [/archon|angel|judge/, 'archon'],
  [/leviathan|kraken|tentacle|flayer/, 'kraken'],
  [/hydra/, 'hydra'],
  [/cerber/, 'cerberus'],
  [/chimera/, 'chimera'],
  [/oracle|omnis|ai_|_ai|core|warden_ai/, 'oracle'],
  [/twin|dual|pair/, 'twin'],
  [/hound|wolf|dog/, 'hound'],
  [/worm|snake|serpent/, 'worm'],
  [/spider|crawl|rat|sniffer|bug/, 'spider'],
  [/swarm|nano|replic|spam|cloud/, 'swarm'],
  [/bomb|honey|trap|ransom|mine/, 'bomb'],
  [/phantom|wraith|ghost|shade/, 'phantom'],
  [/reaper|kill|void|death/, 'reaper'],
  [/siren|echo|voice|wave/, 'siren'],
  [/mirror|mask|cult|admin|face/, 'mask'],
  [/leech|phish|hook|parasite/, 'leech'],
  [/colossus|golem|giant|titan|guard/, 'colossus'],
  [/turret|proxy|ward|cannon/, 'turret'],
  [/sentinel|sentry|monolith|overseer|tower/, 'monolith'],
  [/wall|firewall|gate|barrier/, 'wall'],
  [/ice|crystal|cold|glass/, 'crystal'],
  [/virus|scan|watch/, 'orb'],
  [/trace|probe|drone|hunter|bot/, 'drone'],
  [/daemon|demon/, 'daemon'],
];

const FALLBACK: Archetype[] = ['wall', 'orb', 'drone', 'daemon', 'crystal', 'spider', 'mask', 'turret', 'monolith', 'leech'];

export function archetypeFor(defId: string, tier: string): Archetype {
  const id = defId.toLowerCase();
  const ex = EXACT[id];
  if (ex) return ex;
  for (const [re, a] of RULES) if (re.test(id)) return a;
  if (tier === 'boss') return 'oracle';
  return FALLBACK[hash(id) % FALLBACK.length] ?? 'orb';
}

const Eye = ({ x, y, r = 3.4, cls = '' }: { x: number; y: number; r?: number; cls?: string }) => (
  <g className={`eye ${cls}`}>
    <circle cx={x} cy={y} r={r} className="fill-glow" strokeWidth=".8" />
    <circle cx={x} cy={y} r={r * 0.38} fill="#fff" stroke="none" />
  </g>
);

const origin = (x: number, y: number) => ({ transformOrigin: `${x}px ${y}px` });

function body(kind: Archetype, r: Rand, uid: string, tier: string): ReactNode {
  switch (kind) {
    case 'wall': {
      const rows: ReactNode[] = [];
      for (let y = 34; y < 92; y += 10) {
        const off = (y / 10) % 2 ? 0 : 7;
        for (let x = 22 + off; x < 98; x += 14) rows.push(<rect key={`${x}-${y}`} x={x} y={y} width={12} height={8} strokeWidth=".7" opacity={r2(0.35 + r() * 0.5)} className={r() < 0.12 ? 'fill-glow-soft' : undefined} />);
      }
      return (
        <>
          <path d="M60 10l44 14v38c0 26-20 42-44 50-24-8-44-24-44-50V24z" className="fill-deep" strokeWidth="2.2" />
          <clipPath id={`${uid}c`}><path d="M60 14l40 13v35c0 24-18 38-40 46-22-8-40-22-40-46V27z" /></clipPath>
          <g clipPath={`url(#${uid}c)`}>{rows}</g>
          <path d="M34 58h52" strokeWidth="4" className="visor" />
          <path d="M34 58h52" stroke="#fff" strokeWidth="1.2" opacity=".9" />
          <path d="M16 24l-6-8M104 24l6-8M60 10V2" strokeWidth="1.8" />
          <g className="art-scan"><path d="M26 40h68" strokeWidth="1" stroke="#fff" opacity=".5" /></g>
        </>
      );
    }
    case 'orb':
      return (
        <>
          <path d="M30 96c-6 8-14 10-20 10M90 96c6 8 14 10 20 10M48 100l-6 16M72 100l6 16" strokeWidth="1.6" opacity=".7" />
          <circle cx="60" cy="58" r="40" className="fill-deep" strokeWidth="2" />
          <g className="spin-slow" style={origin(60, 58)}><circle cx="60" cy="58" r="48" strokeDasharray="10 6 2 6" strokeWidth="1.2" opacity=".75" /></g>
          <path d="M26 44a40 40 0 0138-24M96 72a40 40 0 01-38 26" strokeWidth="1" opacity=".5" />
          <circle cx="60" cy="58" r="22" strokeWidth="1.4" />
          <Eye x={60} y={58} r={12} cls="art-pulse" />
          <path d="M22 58h14M84 58h14M60 18v10M60 88v10" strokeWidth="1.2" />
        </>
      );
    case 'drone':
      return (
        <>
          <path d="M30 58L4 44v28zM90 58l26-14v28z" className="fill-glow-soft" strokeWidth="1.4" />
          <path d="M60 16l30 42-30 42-30-42z" className="fill-deep" strokeWidth="2" />
          <path d="M60 16v84M42 40h36M42 76h36M44 58h32" strokeWidth=".8" opacity=".5" />
          <g className="spin" style={origin(60, 58)}><path d="M60 58L60 30" strokeWidth="2" className="visor" /></g>
          <Eye x={60} y={58} r={9} cls="art-pulse" />
          <circle cx="60" cy="58" r="28" strokeWidth=".7" strokeDasharray="3 5" opacity=".7" />
          <path d="M10 56v4M14 52v12M106 56v4M110 52v12" strokeWidth="1.4" opacity=".7" />
        </>
      );
    case 'daemon':
      return (
        <>
          <path d="M28 30L14 4l26 18M92 30l14-26-26 18" strokeWidth="2" className="fill-glow-soft" />
          <path d="M60 18c-24 0-38 18-38 40 0 16 8 28 18 36l4 16h32l4-16c10-8 18-20 18-36 0-22-14-40-38-40z" className="fill-deep" strokeWidth="2" />
          <path d="M40 54l14 6M80 54l-14 6" strokeWidth="2.6" className="visor" />
          <Eye x={47} y={66} /><Eye x={73} y={66} />
          <path d="M46 92l5-6 5 6 4-6 4 6 5-6 5 6" strokeWidth="1.4" />
          <path d="M60 20v18M36 40l8 10M84 40l-8 10" strokeWidth="1" opacity=".5" />
        </>
      );
    case 'crystal': {
      const shards: ReactNode[] = [];
      const n = 6 + Math.floor(r() * 3);
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.4;
        const len = 34 + r() * 30;
        const bx = 60 + Math.cos(a + Math.PI / 2) * 6;
        const tx = r2(60 + Math.cos(a) * len);
        const ty = r2(86 + Math.sin(a) * len);
        shards.push(<path key={i} d={`M${r2(bx - 8)} 88L${tx} ${ty}L${r2(bx + 8)} 88z`} className={i % 2 ? 'fill-glow-soft' : 'fill-deep'} strokeWidth="1.6" />);
        shards.push(<path key={`f${i}`} d={`M${r2(bx)} 88L${tx} ${ty}`} strokeWidth=".7" stroke="#fff" opacity=".45" />);
      }
      return (
        <>
          {shards}
          <path d="M26 88h68l-8 16H34z" className="fill-deep" strokeWidth="2" />
          <path d="M44 96h32" strokeWidth="3" className="visor" />
          <g className="art-twinkle"><path d="M60 14v12M54 20h12" strokeWidth="1.4" stroke="#fff" /></g>
        </>
      );
    }
    case 'oracle':
      return (
        <>
          <g className="spin-slow" style={origin(60, 60)}>
            <circle cx="60" cy="60" r="56" strokeDasharray="2 8" strokeWidth="1.6" />
            <circle cx="60" cy="60" r="50" strokeDasharray="30 10 4 10" strokeWidth="1" opacity=".7" />
          </g>
          <g className="spin-rev" style={origin(60, 60)}><path d="M60 14l40 70H20z" strokeWidth="1.2" opacity=".55" /></g>
          <path d="M60 22l34 62H26z" className="fill-deep" strokeWidth="2.2" />
          <path d="M34 66s10-14 26-14 26 14 26 14-10 12-26 12-26-12-26-12z" className="fill-void" strokeWidth="1.6" />
          <Eye x={60} y={65} r={8} cls="art-pulse" />
          <path d="M60 4v10M18 24l8 6M102 24l-8 6M60 84v14" strokeWidth="1.6" />
        </>
      );
    case 'spider': {
      const legs: ReactNode[] = [];
      for (let i = 0; i < 4; i++) {
        const y = 48 + i * 7;
        const k = 18 + i * 3;
        legs.push(<path key={`l${i}`} className="art-leg" style={{ animationDelay: `${i * 0.18}s`, ...origin(44, y) }} d={`M46 ${y}L${30 - i * 2} ${y - 18 + i * 2}L${14 - i * 2} ${y + k - 6}`} strokeWidth="2" fill="none" />);
        legs.push(<path key={`r${i}`} className="art-leg" style={{ animationDelay: `${i * 0.18 + 0.09}s`, ...origin(74, y) }} d={`M74 ${y}L${90 + i * 2} ${y - 18 + i * 2}L${106 + i * 2} ${y + k - 6}`} strokeWidth="2" fill="none" />);
      }
      return (
        <>
          {legs}
          <ellipse cx="60" cy="80" rx="20" ry="22" className="fill-deep" strokeWidth="2" />
          <path d="M60 62v36M48 74h24M46 86h28" strokeWidth=".8" opacity=".5" />
          <ellipse cx="60" cy="48" rx="18" ry="14" className="fill-deep" strokeWidth="2" />
          <Eye x={52} y={46} r={2.8} /><Eye x={68} y={46} r={2.8} /><Eye x={60} y={41} r={2} /><Eye x={60} y={52} r={1.8} />
          <path d="M54 58l-3 8M66 58l3 8" strokeWidth="2" />
        </>
      );
    }
    case 'worm': {
      const segs: ReactNode[] = [];
      const n = 8;
      for (let i = n - 1; i >= 0; i--) {
        const t = i / (n - 1);
        const x = 30 + Math.sin(t * 5) * 18 + t * 40;
        const y = 98 - t * 66;
        const rad = 8 + (1 - t) * 8;
        segs.push(
          <g key={i} className="art-seg" style={{ animationDelay: `${i * 0.12}s`, ...origin(x, y) }}>
            <circle cx={r2(x)} cy={r2(y)} r={r2(rad)} className="fill-deep" strokeWidth="2" />
            <path d={`M${r2(x - rad * 0.6)} ${r2(y)}h${r2(rad * 1.2)}`} strokeWidth=".8" opacity=".6" />
            {i % 2 ? <circle cx={r2(x)} cy={r2(y)} r={2} className="fill-glow-soft" strokeWidth=".6" /> : null}
          </g>,
        );
      }
      const hx = 30 + Math.sin(0) * 18;
      return (
        <>
          {segs}
          <path d={`M${hx - 8} 94q8 12 16 0`} strokeWidth="2" />
          <Eye x={hx - 4} y={96} r={2.6} /><Eye x={hx + 5} y={96} r={2.6} />
          <path d="M70 18l6-10M76 30l12-6M84 42l14-2" strokeWidth="1.4" opacity=".7" />
        </>
      );
    }
    case 'hound':
      return (
        <>
          <path d="M18 100l8-30 20-12h32l22 12 10 30" className="fill-deep" strokeWidth="2" />
          <path d="M28 100v14M44 100v14M78 100v14M94 100v14" strokeWidth="3" />
          <path d="M38 58l-8-26 18 10M82 58l8-26-18 10" className="fill-deep" strokeWidth="2" />
          <path d="M34 58c0-14 12-22 26-22s26 8 26 22l-4 14H38z" className="fill-deep" strokeWidth="2" />
          <path d="M38 58h44" strokeWidth="1" opacity=".5" />
          <Eye x={48} y={52} r={3} cls="art-pulse" /><Eye x={72} y={52} r={3} cls="art-pulse" />
          <path d="M46 70l4 6 4-6 6 6 6-6 4 6 4-6" strokeWidth="1.6" fill="#fff" fillOpacity=".12" />
          <path d="M60 36v-8M30 80h18M72 80h18" strokeWidth="1.2" opacity=".6" />
        </>
      );
    case 'mask':
      return (
        <>
          <path d="M20 24c10-10 26-14 40-14s30 4 40 14c4 30-6 62-40 86C26 86 16 54 20 24z" className="fill-deep" strokeWidth="2.2" />
          <path d="M60 10v100M26 40c10 6 24 8 34 8s24-2 34-8" strokeWidth=".8" opacity=".4" />
          <path d="M30 48l22 8-4 10-20-6zM90 48l-22 8 4 10 20-6z" className="fill-glow-soft" strokeWidth="1.8" />
          <Eye x={44} y={59} r={3.4} /><Eye x={76} y={59} r={3.4} />
          <path d="M60 62l-5 16h10z" strokeWidth="1.2" opacity=".7" />
          <path d="M42 90q18 12 36 0M46 90v8M54 92v10M62 92v10M70 92v8" strokeWidth="1.6" />
          <path d="M28 28l-10-8M92 28l10-8" strokeWidth="1.6" />
        </>
      );
    case 'hydra': {
      const heads: ReactNode[] = [];
      const xs = [24, 42, 60, 78, 96];
      xs.forEach((x, i) => {
        const up = 10 + Math.abs(i - 2) * 10;
        heads.push(
          <g key={i} className="art-sway" style={{ animationDelay: `${i * 0.35}s`, ...origin(60, 100) }}>
            <path d={`M60 100C${x} 90 ${x - 6 + (i - 2) * 4} 60 ${x} ${up + 20}`} strokeWidth="5" opacity=".9" />
            <path d={`M60 100C${x} 90 ${x - 6 + (i - 2) * 4} 60 ${x} ${up + 20}`} strokeWidth="2" className="visor" opacity=".35" />
            <path d={`M${x - 8} ${up + 20}l8-18 8 18-3 10h-10z`} className="fill-deep" strokeWidth="1.8" />
            <Eye x={x - 3} y={up + 22} r={1.9} /><Eye x={x + 3} y={up + 22} r={1.9} />
          </g>,
        );
      });
      return (
        <>
          {heads}
          <path d="M26 112c4-14 18-20 34-20s30 6 34 20z" className="fill-deep" strokeWidth="2" />
          <path d="M44 106h32" strokeWidth="1" opacity=".5" />
        </>
      );
    }
    case 'bomb':
      return (
        <>
          <path d="M60 28q10-10 16-8" strokeWidth="2" />
          <circle cx="78" cy="19" r="4" className="fill-glow art-pulse" strokeWidth=".6" />
          <path d="M80 11l3-5M86 17l5-2M82 23l5 3" strokeWidth="1.4" className="art-twinkle" />
          <circle cx="60" cy="66" r="36" className="fill-deep" strokeWidth="2.2" />
          <path d="M50 28h20v8H50z" className="fill-deep" strokeWidth="1.8" />
          <path d="M28 54a36 36 0 0132-26" strokeWidth="1" opacity=".5" />
          <g className="art-pulse" style={origin(60, 68)}>
            <path d="M60 50l14 24H46z" className="fill-glow-soft" strokeWidth="1.8" />
            <path d="M60 58v8" strokeWidth="2.4" /><circle cx="60" cy="71" r="1.5" className="fill-glow" stroke="none" />
          </g>
          <path d="M26 74h12M82 74h12M36 90h10M74 90h10" strokeWidth="1.6" opacity=".7" />
        </>
      );
    case 'swarm': {
      const bits: ReactNode[] = [];
      for (let i = 0; i < 34; i++) {
        const a = r() * 6.28;
        const d = Math.sqrt(r()) * 44;
        const x = 60 + Math.cos(a) * d;
        const y = 60 + Math.sin(a) * d * 0.8;
        const s = 2.2 + r() * 3.6;
        bits.push(
          <g key={i} className="art-swarm" style={{ animationDelay: `${r2(r() * 2)}s`, ...origin(x, y) }}>
            <path d={`M${r2(x)} ${r2(y - s)}l${r2(s)} ${r2(s)}l${r2(-s)} ${r2(s)}l${r2(-s)} ${r2(-s)}z`} className={r() < 0.25 ? 'fill-glow' : 'fill-deep'} strokeWidth="1" />
          </g>,
        );
      }
      return (
        <>
          <circle cx="60" cy="60" r="48" strokeDasharray="2 6" strokeWidth=".8" opacity=".5" className="spin-slow" style={origin(60, 60)} />
          {bits}
          <Eye x={60} y={58} r={5} cls="art-pulse" />
        </>
      );
    }
    case 'monolith':
      return (
        <>
          <path d="M42 112l-6-92 24-14 24 14-6 92z" className="fill-deep" strokeWidth="2.2" />
          <path d="M60 6v106M38 40h44M40 82h40" strokeWidth=".8" opacity=".45" />
          <path d="M44 56q16-14 32 0q-16 14-32 0z" className="fill-void" strokeWidth="1.6" />
          <Eye x={60} y={56} r={5.5} cls="art-pulse" />
          <path d="M20 90l16-8M100 90l-16-8M26 108h68" strokeWidth="1.6" opacity=".7" />
          <g className="spin-slow" style={origin(60, 14)}><path d="M52 14h16" strokeWidth="1.4" /><circle cx="60" cy="14" r="4" strokeWidth="1" /></g>
        </>
      );
    case 'kraken': {
      const t: ReactNode[] = [];
      for (let i = 0; i < 7; i++) {
        const x = 18 + i * 14;
        const dir = i < 3 ? -1 : 1;
        t.push(
          <g key={i} className="art-sway" style={{ animationDelay: `${i * 0.3}s`, ...origin(x, 70) }}>
            <path d={`M${x} 70c${dir * 14} 14 ${-dir * 12} 26 ${dir * 6} 44`} strokeWidth="6" opacity=".9" />
            <path d={`M${x} 70c${dir * 14} 14 ${-dir * 12} 26 ${dir * 6} 44`} strokeWidth="2.4" className="visor" opacity=".3" />
            <circle cx={x + dir * 5} cy={96} r="1.6" className="fill-glow" stroke="none" opacity=".7" />
          </g>,
        );
      }
      return (
        <>
          {t}
          <path d="M16 70C16 28 36 8 60 8s44 20 44 62c-12 8-28 10-44 10S28 78 16 70z" className="fill-deep" strokeWidth="2.2" />
          <path d="M60 8v28M36 18l10 24M84 18L74 42" strokeWidth="1" opacity=".4" />
          <Eye x={44} y={50} r={5} cls="art-pulse" /><Eye x={76} y={50} r={5} cls="art-pulse" /><Eye x={60} y={38} r={3.2} />
          <path d="M40 66q20 8 40 0" strokeWidth="1.6" />
        </>
      );
    }
    case 'twin':
      return (
        <>
          <g className="spin-slow" style={origin(60, 60)}><circle cx="60" cy="60" r="54" strokeDasharray="6 8" strokeWidth="1.2" opacity=".7" /></g>
          <path d="M44 40l-30 20 30 20 14-20z" className="fill-deep" strokeWidth="2" />
          <path d="M76 40l30 20-30 20-14-20z" className="fill-deep" strokeWidth="2" />
          <path d="M58 60h4" strokeWidth="3" className="visor" />
          <g className="art-pulse" style={origin(34, 60)}><circle cx="34" cy="60" r="9" className="fill-glow-soft" strokeWidth="1.4" /><Eye x={34} y={60} r={4.5} /></g>
          <g className="art-pulse" style={{ animationDelay: '.5s', ...origin(86, 60) }}><circle cx="86" cy="60" r="9" className="fill-glow-soft" strokeWidth="1.4" /><Eye x={86} y={60} r={4.5} /></g>
          <path d="M44 40V20M76 40V20M44 80v20M76 80v20" strokeWidth="1.6" />
          <path d="M44 20h32M44 100h32" strokeWidth="1" strokeDasharray="3 3" opacity=".7" />
        </>
      );
    case 'reaper':
      return (
        <>
          <path d="M96 4v112" strokeWidth="2.4" />
          <path d="M96 6c-26 0-42 14-48 34 10-8 22-12 38-12z" className="fill-glow-soft" strokeWidth="2" />
          <path d="M60 14C36 14 24 34 24 56l-8 56h56l-8-56c0-22-4-42-4-42z" className="fill-deep art-sway" style={origin(60, 112)} strokeWidth="2.2" />
          <path d="M34 36C38 24 48 18 60 18s22 6 26 18c-4 20-14 28-26 28S38 56 34 36z" className="fill-void" strokeWidth="1.8" />
          <Eye x={50} y={44} r={3.6} /><Eye x={70} y={44} r={3.6} />
          <path d="M30 100l-8 14M46 104l-4 10M74 104l4 10M90 100l8 14" strokeWidth="1.4" opacity=".6" />
        </>
      );
    case 'siren':
      return (
        <>
          {[44, 36, 28, 20].map((rad, i) => (
            <circle key={rad} cx="60" cy="56" r={rad} strokeWidth="1.2" opacity={r2(0.8 - i * 0.14)} strokeDasharray={i % 2 ? '4 4' : undefined} className="art-ring" style={{ animationDelay: `${i * 0.25}s`, ...origin(60, 56) }} />
          ))}
          <path d="M60 14c-14 0-22 12-22 26 0 10 4 16 8 22l-4 32h36l-4-32c4-6 8-12 8-22 0-14-8-26-22-26z" className="fill-deep" strokeWidth="2" />
          <path d="M18 56h12l6-14 8 30 8-40 8 52 8-36 6 8h28" strokeWidth="1.6" opacity=".9" />
          <Eye x={52} y={34} r={2.8} /><Eye x={68} y={34} r={2.8} />
          <ellipse cx="60" cy="48" rx="5" ry="3.4" className="fill-glow-soft" strokeWidth="1.2" />
        </>
      );
    case 'phantom':
      return (
        <>
          <g className="art-ghost">
            <path d="M24 108V52C24 26 40 10 60 10s36 16 36 42v56l-9-9-9 9-9-9-9 9-9-9-9 9-9-9z" className="fill-deep" strokeWidth="2" opacity=".9" />
            <path d="M24 108V52C24 26 40 10 60 10s36 16 36 42v56l-9-9-9 9-9-9-9 9-9-9-9 9-9-9z" transform="translate(6 -3)" strokeWidth=".8" opacity=".35" className="k2" />
            <ellipse cx="46" cy="48" rx="7" ry="10" className="fill-void" strokeWidth="1.2" />
            <ellipse cx="74" cy="48" rx="7" ry="10" className="fill-void" strokeWidth="1.2" />
            <Eye x={46} y={50} r={3} cls="art-pulse" /><Eye x={74} y={50} r={3} cls="art-pulse" />
            <ellipse cx="60" cy="74" rx="8" ry="11" className="fill-void" strokeWidth="1.2" />
            <path d="M34 80q-14 6-20 22M86 80q14 6 20 22" strokeWidth="1.6" opacity=".7" />
          </g>
        </>
      );
    case 'colossus':
      return (
        <>
          <path d="M8 56l22-8 6 26-24 10z M112 56l-22-8-6 26 24 10z" className="fill-deep" strokeWidth="2" />
          <path d="M34 52h52l6 40-14 22H42L28 92z" className="fill-deep" strokeWidth="2.2" />
          <path d="M42 58h36v34H42zM60 58v34M42 75h36" strokeWidth=".9" opacity=".5" />
          <rect x="48" y="62" width="24" height="10" className="fill-glow-soft art-pulse" strokeWidth="1.4" />
          <path d="M42 52l4-22h28l4 22z" className="fill-deep" strokeWidth="2" />
          <path d="M48 40h24" strokeWidth="3.4" className="visor" /><path d="M48 40h24" stroke="#fff" strokeWidth="1" opacity=".9" />
          <path d="M20 20l12 22M100 20L88 42M14 100h16M90 100h16" strokeWidth="1.8" opacity=".8" />
          <circle cx="60" cy="82" r="5" className="fill-glow eye" strokeWidth=".8" />
        </>
      );
    case 'leech':
      return (
        <>
          <path d="M60 14C30 14 14 40 20 70c4 20 20 36 40 36s36-16 40-36c6-30-10-56-40-56z" className="fill-deep" strokeWidth="2.2" />
          <g className="art-pulse" style={origin(60, 66)}>
            <circle cx="60" cy="66" r="22" className="fill-void" strokeWidth="1.8" />
            {Array.from({ length: 16 }, (_, i) => {
              const a = (i / 16) * Math.PI * 2;
              return <path key={i} d={`M${r2(60 + Math.cos(a) * 22)} ${r2(66 + Math.sin(a) * 22)}L${r2(60 + Math.cos(a) * 15)} ${r2(66 + Math.sin(a) * 15)}`} strokeWidth="1.6" />;
            })}
            <circle cx="60" cy="66" r="6" className="fill-glow" strokeWidth=".8" />
          </g>
          <Eye x={38} y={36} r={3} /><Eye x={82} y={36} r={3} />
          <path d="M28 96l-10 14M92 96l10 14M60 106v10" strokeWidth="2" opacity=".7" />
          <path d="M44 24q16-8 32 0" strokeWidth="1" opacity=".5" />
        </>
      );
    case 'turret':
      return (
        <>
          <path d="M26 112l8-26h52l8 26z" className="fill-deep" strokeWidth="2.2" />
          <path d="M40 86v-14h40v14" className="fill-deep" strokeWidth="2" />
          <g className="art-aim" style={origin(60, 60)}>
            <circle cx="60" cy="58" r="22" className="fill-deep" strokeWidth="2.2" />
            <path d="M80 52h30v12H80z" className="fill-deep" strokeWidth="2" />
            <path d="M110 55v6" strokeWidth="3" className="visor" />
            <Eye x={58} y={58} r={8} cls="art-pulse" />
          </g>
          <path d="M36 98h48M44 90v16M76 90v16" strokeWidth="1" opacity=".5" />
          <path d="M20 20l12 12M100 20L88 32M60 10v12" strokeWidth="1.4" opacity=".6" />
        </>
      );
    case 'cerberus':
      return (
        <>
          <path d="M10 112c0-30 18-46 50-46s50 16 50 46z" className="fill-deep" strokeWidth="2.4" />
          {[[28, 42], [60, 28], [92, 42]].map(([x = 0, y = 0], i) => (
            <g key={i} className="art-sway" style={{ animationDelay: `${i * 0.4}s`, ...origin(60, 72) }}>
              <path d={`M60 72L${x} ${y + 24}`} strokeWidth="7" opacity=".85" />
              <path d={`M${x - 14} ${y + 10}l5-20 9 10h10l9-10 5 20-6 18h-26z`} className="fill-deep" strokeWidth="2" />
              <Eye x={x - 5} y={y + 12} r={2.6} cls="art-pulse" /><Eye x={x + 5} y={y + 12} r={2.6} cls="art-pulse" />
              <path d={`M${x - 6} ${y + 24}l3 4 3-4 3 4 3-4`} strokeWidth="1.4" />
            </g>
          ))}
          <path d="M34 98h52M44 88h32" strokeWidth="1.2" opacity=".5" />
        </>
      );
    case 'chimera':
      return (
        <>
          <path d="M60 60C30 30 10 34 2 8c20 8 38 6 58 30M60 60c30-30 50-26 58-52-20 8-38 6-58 30" className="fill-glow-soft" strokeWidth="1.8" />
          <path d="M26 112l8-44 26-14 26 14 8 44z" className="fill-deep" strokeWidth="2.2" />
          <g className="art-sway" style={origin(60, 80)}>
            <path d="M42 66c-8-16-4-36 18-40 22 4 26 24 18 40z" className="fill-deep" strokeWidth="2" />
            <path d="M40 34l-8-16 16 8M80 34l8-16-16 8" strokeWidth="2" />
            <Eye x={52} y={46} r={3} cls="art-pulse" /><Eye x={68} y={46} r={3} cls="art-pulse" />
            <path d="M50 58l5 5 5-5 5 5 5-5" strokeWidth="1.4" />
          </g>
          <path d="M92 104c14-6 20-18 14-30" strokeWidth="5" className="art-sway" style={origin(92, 104)} />
          <circle cx="106" cy="72" r="5" className="fill-glow eye" strokeWidth=".8" />
        </>
      );
    case 'archon':
      return (
        <>
          <g className="spin-slow" style={origin(60, 50)}>
            <circle cx="60" cy="50" r="38" strokeWidth="1.4" strokeDasharray="1 5" />
            <circle cx="60" cy="50" r="46" strokeWidth=".8" opacity=".6" />
          </g>
          <path d="M60 62C40 54 14 50 4 20c22 4 38 10 56 30M60 62c20-8 46-12 56-42-22 4-38 10-56 30" className="fill-glow-soft" strokeWidth="1.8" />
          <path d="M60 52C40 52 14 62 6 92c22-6 38-14 54-24M60 52c20 0 46 10 54 40-22-6-38-14-54-24" className="fill-deep" strokeWidth="1.6" opacity=".85" />
          <path d="M40 112l6-56h28l6 56z" className="fill-deep" strokeWidth="2.2" />
          <circle cx="60" cy="38" r="14" className="fill-deep" strokeWidth="2.2" />
          <path d="M52 38h16" strokeWidth="3" className="visor" />
          <circle cx="60" cy="14" r="16" strokeWidth="1.6" className="art-pulse" style={origin(60, 14)} />
          <path d="M60 64v38M50 76h20" strokeWidth="1.4" />
        </>
      );
    case 'nexus':
      return (
        <>
          <g className="spin-slow" style={origin(60, 60)}>
            <ellipse cx="60" cy="60" rx="56" ry="18" strokeWidth="1.2" strokeDasharray="6 4" />
            <circle cx="116" cy="60" r="3" className="fill-glow" stroke="none" />
          </g>
          <g className="spin-rev" style={origin(60, 60)}>
            <ellipse cx="60" cy="60" rx="18" ry="56" strokeWidth="1.2" strokeDasharray="4 6" opacity=".8" />
            <circle cx="60" cy="4" r="3" className="fill-glow" stroke="none" />
          </g>
          <path d="M60 14l38 22v48L60 106 22 84V36z" className="fill-deep" strokeWidth="2.4" />
          <path d="M60 14v92M22 36l76 48M98 36L22 84" strokeWidth=".8" opacity=".4" />
          <path d="M60 36l22 12v24L60 84 38 72V48z" className="fill-void" strokeWidth="1.8" />
          <Eye x={60} y={60} r={9} cls="art-pulse" />
          <path d="M60 4v10M26 22l6 6M94 22l-6 6" strokeWidth="1.8" />
        </>
      );
    case 'singularity':
      return (
        <>
          <g className="spin-slow" style={origin(60, 60)}>
            {[56, 46, 36].map((rad, i) => (
              <ellipse key={rad} cx="60" cy="60" rx={rad} ry={rad * 0.34} strokeWidth={r2(2.2 - i * 0.5)} strokeDasharray={i === 1 ? '20 6' : undefined} opacity={r2(0.9 - i * 0.2)} transform="rotate(-18 60 60)" />
            ))}
          </g>
          <g className="spin-rev" style={origin(60, 60)}>
            <path d="M60 4c8 20 8 36 0 56M60 116c-8-20-8-36 0-56M4 60c20-8 36-8 56 0M116 60c-20 8-36 8-56 0" strokeWidth="1.2" opacity=".6" />
          </g>
          <circle cx="60" cy="60" r="22" className="fill-void" strokeWidth="2.4" />
          <circle cx="60" cy="60" r="26" strokeWidth=".8" strokeDasharray="2 3" className="art-pulse" style={origin(60, 60)} />
          <circle cx="60" cy="60" r="8" className="fill-glow art-pulse" strokeWidth="0" style={origin(60, 60)} />
          <circle cx="60" cy="60" r="3" fill="#fff" stroke="none" />
          {Array.from({ length: 14 }, (_, i) => {
            const a = r() * 6.28;
            const d = 30 + r() * 28;
            return <circle key={i} cx={r2(60 + Math.cos(a) * d)} cy={r2(60 + Math.sin(a) * d)} r={r2(0.8 + r() * 1.6)} className="fill-glow" stroke="none" opacity=".7" />;
          })}
        </>
      );
  }
  void tier;
  return null;
}

/** Украшения тира: ореол и шипы у элит; корона, орбиты и частицы у боссов. */
function tierFrame(tier: string, uid: string): { back: ReactNode; front: ReactNode } {
  if (tier === 'elite') {
    return {
      back: (
        <>
          <circle cx="60" cy="62" r="58" className="art-pulse" style={origin(60, 62)} strokeWidth="1.2" strokeDasharray="3 5" opacity=".7" />
          <circle cx="60" cy="62" r="58" fill={`url(#${uid}a)`} stroke="none" />
        </>
      ),
      front: <path d="M6 22l8 4M114 22l-8 4M6 100l8-4M114 100l-8-4" strokeWidth="2" opacity=".85" />,
    };
  }
  if (tier === 'boss') {
    return {
      back: (
        <>
          <circle cx="60" cy="60" r="64" fill={`url(#${uid}a)`} stroke="none" />
          <g className="spin-slow" style={origin(60, 60)}>
            <circle cx="60" cy="60" r="62" strokeWidth=".8" strokeDasharray="1 7" opacity=".7" />
          </g>
          {Array.from({ length: 8 }, (_, i) => (
            <rect key={i} x={10 + i * 14} y={6} width="1.6" height="8" className="fill-glow art-rise" stroke="none" style={{ animationDelay: `${i * 0.4}s` }} />
          ))}
        </>
      ),
      front: (
        <g className="art-crown">
          <path d="M42 4l6 8 6-10 6 10 6-10 6 10 6-8-3 12H45z" className="fill-glow-soft" strokeWidth="1.6" />
          <circle cx="60" cy="2" r="2" className="fill-glow" stroke="none" />
        </g>
      ),
    };
  }
  return { back: null, front: null };
}

export const EnemyArt = memo(function EnemyArt({ defId, tier }: { defId: string; tier: 'normal' | 'elite' | 'boss' }) {
  const uid = useId().replace(/:/g, '');
  const kind = archetypeFor(defId, tier);
  const r = rng(defId);
  const { back, front } = tierFrame(tier, uid);
  return (
    <svg className={`unit-art unit-art--enemy arch-${kind} tier-art-${tier}`} viewBox="0 0 120 120" fill="none" stroke="currentColor" aria-hidden="true">
      <defs>
        <radialGradient id={`${uid}a`}>
          <stop offset="0.55" stopColor="currentColor" stopOpacity="0" />
          <stop offset="1" stopColor="currentColor" stopOpacity={tier === 'boss' ? 0.12 : 0.14} />
        </radialGradient>
      </defs>
      {back}
      <g className="art-float">{body(kind, r, uid, tier)}</g>
      {front}
    </svg>
  );
});
