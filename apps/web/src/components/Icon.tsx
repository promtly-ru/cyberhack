import type { ReactNode } from 'react';

/** Векторные иконки 24×24, обводка currentColor. */
const P: Record<string, ReactNode> = {
  // --- Узлы карты ---
  combat: (
    <>
      <circle cx="12" cy="12" r="7" />
      <path d="M12 2v5M12 17v5M2 12h5M17 12h5" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
    </>
  ),
  elite: (
    <>
      <path d="M4 2.5l3.2 5.5M20 2.5l-3.2 5.5" />
      <path d="M6 11.5a6 6 0 0 1 12 0v3.5l-2 2V20H8v-3l-2-2z" />
      <circle cx="9.6" cy="12.6" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="14.4" cy="12.6" r="1.4" fill="currentColor" stroke="none" />
      <path d="M11 20v-2.2M13 20v-2.2" />
    </>
  ),
  event: (
    <>
      <path d="M12 2l10 10-10 10L2 12z" />
      <path d="M9.6 9.6a2.5 2.5 0 1 1 3.4 2.3c-.7.3-1 .8-1 1.5v.6" />
      <circle cx="12" cy="16.8" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  shop: (
    <>
      <rect x="5" y="5" width="14" height="14" rx="2" />
      <path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" />
      <path d="M14 9.6c-.4-.6-1.1-1-2-1-1.2 0-2 .6-2 1.5s.9 1.3 2 1.5 2 .6 2 1.5-.8 1.5-2 1.5c-.9 0-1.6-.4-2-1M12 7.4v1.2M12 15.4v1.2" />
    </>
  ),
  rest: (
    <>
      <path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z" />
      <path d="M12 8v8M8 12h8" />
    </>
  ),
  treasure: (
    <>
      <path d="M12 2l9 5v10l-9 5-9-5V7z" />
      <path d="M3 7l9 5 9-5M12 12v10" />
      <path d="M7.5 9.5l4.5 2.5" opacity=".5" />
    </>
  ),
  boss: (
    <>
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3.3" />
      <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
      <path d="M12 1v2M4.6 3.4L6 4.8M19.4 3.4L18 4.8" />
    </>
  ),
  // --- Намерения ---
  attack: (
    <>
      <path d="M21 3l-1.5 5.5L10 18l-4-4 9.5-9.5z" />
      <path d="M4 12l8 8M6.5 17.5L3 21" />
    </>
  ),
  defend: <path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z" />,
  block: (
    <>
      <path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z" />
      <path d="M12 6v12" opacity=".45" />
    </>
  ),
  buff: <path d="M6 12l6-6 6 6M6 19l6-6 6 6" />,
  debuff: (
    <>
      <path d="M12 2.5c3 4.5 6.5 7.6 6.5 11.3a6.5 6.5 0 0 1-13 0C5.5 10.1 9 7 12 2.5z" />
      <path d="M9 13.5l3 3 3-3" />
    </>
  ),
  unknown: (
    <>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M9.4 9.3a2.7 2.7 0 1 1 3.7 2.5c-.7.3-1.1.9-1.1 1.6v.6" />
      <circle cx="12" cy="17" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  // --- Статусы ---
  vulnerable: (
    <>
      <path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z" />
      <path d="M12.5 5.5l-2.5 4.5 3.5 2-3 5" />
    </>
  ),
  weak: (
    <>
      <path d="M20 4l-6.5 6.5M10.5 13.5L4 20" />
      <path d="M20 4h-4M20 4v4" />
      <path d="M8 16l-3.5-3.5M11.5 19.5L8 16" />
    </>
  ),
  frail: (
    <>
      <path d="M12 2l8.7 5v10L12 22l-8.7-5V7z" />
      <path d="M12 2l-1 6 3 3-2 5 1 6" />
    </>
  ),
  poison: (
    <>
      <circle cx="12" cy="12" r="5" />
      <path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l2.8 2.8M16.2 16.2L19 19M5 19l2.8-2.8M16.2 7.8L19 5" />
      <circle cx="10.5" cy="11" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="13.6" cy="13.2" r=".9" fill="currentColor" stroke="none" />
    </>
  ),
  strength: (
    <>
      <path d="M12 3l6 6.5h-3.8V16H9.8V9.5H6z" />
      <path d="M5 20h14" />
    </>
  ),
  dexterity: (
    <>
      <path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z" />
      <path d="M8.5 13l3.5-3.5 3.5 3.5" />
    </>
  ),
  thorns: <path d="M12 2l1.9 5.6 5.7-1.9-3.6 4.7 4.9 3-5.9.7.8 5.9-3.8-4.4-3.8 4.4.8-5.9-5.9-.7 4.9-3-3.6-4.7 5.7 1.9z" />,
  regen: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v9M7.5 12h9" />
    </>
  ),
  status: (
    <>
      <path d="M12 2l8.7 5v10L12 22l-8.7-5V7z" />
      <circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none" />
    </>
  ),
  // --- Интерфейс ---
  energy: <path d="M13.5 2L4.5 13.5h6.5l-1 8.5 9-11.5h-6.5z" />,
  hp: (
    <>
      <path d="M12 20.5s-8-5-8-10.8a4.5 4.5 0 0 1 8-2.8 4.5 4.5 0 0 1 8 2.8c0 5.8-8 10.8-8 10.8z" />
      <path d="M6.8 11.5h2.6l1.4-2.3 2 4.6 1.5-2.3h2.9" />
    </>
  ),
  gold: (
    <>
      <path d="M12 2l8.6 5v10L12 22l-8.6-5V7z" />
      <path d="M15 9.6a3.6 3.6 0 1 0 0 4.8M12 6.4v2M12 15.6v2" />
    </>
  ),
  deck: (
    <>
      <rect x="8" y="3.5" width="12" height="16" rx="1.8" />
      <path d="M5 6.5v12.5a2 2 0 0 0 2 2h9" />
    </>
  ),
  draw: (
    <>
      <rect x="6" y="2.5" width="12" height="15" rx="1.8" />
      <path d="M12 7v6M9.3 10.5L12 13.2l2.7-2.7M5 21h14" />
    </>
  ),
  discard: (
    <>
      <rect x="4" y="4.5" width="11" height="15" rx="1.8" transform="rotate(-8 9.5 12)" />
      <path d="M14 12h7M18 9l3 3-3 3" />
    </>
  ),
  exhaust: <path d="M12 22c-4 0-7-2.8-7-6.6 0-3 2-5 3.5-6.5.3 2 1.3 3 2.5 3.5C10.5 9 12 5.5 14.5 2c.5 3.5 4.5 6.5 4.5 11.5 0 4.7-3 8.5-7 8.5z" />,
  floor: (
    <>
      <path d="M12 3l9 4.8-9 4.8-9-4.8z" />
      <path d="M3 12.2l9 4.8 9-4.8M3 16.4l9 4.8 9-4.8" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" />
      <circle cx="12" cy="12" r="6.6" />
    </>
  ),
  map: (
    <>
      <path d="M3 6l6-2.5 6 2.5 6-2.5v14.5l-6 2.5-6-2.5-6 2.5z" />
      <path d="M9 3.5v14.5M15 6v14.5" />
    </>
  ),
  close: <path d="M5 5l14 14M19 5L5 19" />,
  back: <path d="M15 4l-8 8 8 8" />,
  check: <path d="M4.5 12.5l5 5 10-11" />,
  lock: (
    <>
      <rect x="4.5" y="10.5" width="15" height="10.5" rx="1.8" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
      <path d="M12 14.5v2.5" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c.8-4.3 4-6.5 8-6.5s7.2 2.2 8 6.5" />
    </>
  ),
  trophy: (
    <>
      <path d="M7 3.5h10v5a5 5 0 0 1-10 0z" />
      <path d="M7 5H3.5c0 3 1.5 4.6 3.8 4.9M17 5h3.5c0 3-1.5 4.6-3.8 4.9M12 13.5V17M8 21h8M9 17h6v4H9z" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M3.5 10h17M8 2.8v4M16 2.8v4" />
      <path d="M8 14h2M12 14h2M16 14h.5M8 17h2M12 17h2" />
    </>
  ),
  play: <path d="M7 4.5v15l12-7.5z" />,
  sound: (
    <>
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
      <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />
    </>
  ),
  mute: (
    <>
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
      <path d="M16 9.5l5 5M21 9.5l-5 5" />
    </>
  ),
  skull: (
    <>
      <path d="M5 11a7 7 0 0 1 14 0v3.5l-2 1.8V20H7v-3.7l-2-1.8z" />
      <circle cx="9.3" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="14.7" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <path d="M11 20v-2.5M13 20v-2.5" />
    </>
  ),
  flag: (
    <>
      <path d="M5 21V3.5" />
      <path d="M5 4h12l-2.5 4 2.5 4H5" />
    </>
  ),
  terminal: (
    <>
      <rect x="2.5" y="4" width="19" height="16" rx="2" />
      <path d="M6.5 9.5l3 2.5-3 2.5M11.5 15h5" />
    </>
  ),
  github: (
    <path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21" />
  ),
  google: (
    <>
      <path d="M20.5 12.2c0-.6 0-1.2-.2-1.7H12v3.3h4.8a4.1 4.1 0 0 1-1.8 2.7v2.2h2.9c1.7-1.6 2.6-3.9 2.6-6.5z" />
      <path d="M12 21c2.4 0 4.5-.8 5.9-2.2L15 16.6c-.8.5-1.8.9-3 .9-2.3 0-4.3-1.6-5-3.7H4v2.3A9 9 0 0 0 12 21z" />
      <path d="M7 13.8a5.4 5.4 0 0 1 0-3.5V8H4a9 9 0 0 0 0 8.1z" />
      <path d="M12 6.6c1.3 0 2.5.5 3.4 1.3l2.6-2.6A9 9 0 0 0 4 8l3 2.3c.7-2.1 2.7-3.7 5-3.7z" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3.5 6l8.5 7 8.5-7" />
    </>
  ),
  logout: (
    <>
      <path d="M14 4h4.5a1.5 1.5 0 0 1 1.5 1.5v13a1.5 1.5 0 0 1-1.5 1.5H14" />
      <path d="M10 8l-4 4 4 4M6 12h10" />
    </>
  ),
  trash: (
    <>
      <path d="M4 6.5h16M9.5 6.5V4h5v2.5M6 6.5l1 14h10l1-14" />
      <path d="M10 10.5v6M14 10.5v6" />
    </>
  ),
  upgrade: (
    <>
      <path d="M12 3v14M6.5 8.5L12 3l5.5 5.5" />
      <path d="M5 21h14" />
    </>
  ),
};

export type IconName = keyof typeof P;

export function hasIcon(name: string): boolean {
  return name in P;
}

interface Props {
  name: string;
  size?: number | string;
  className?: string;
  strokeWidth?: number;
  title?: string;
}

export function Icon({ name, size = 20, className, strokeWidth = 1.8, title }: Props) {
  const body = P[name] ?? P.status;
  return (
    <svg
      className={className ? `icon ${className}` : 'icon'}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title ? <title>{title}</title> : null}
      {body}
    </svg>
  );
}
