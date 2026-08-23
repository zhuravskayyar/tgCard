import type { ReactNode } from "react";

export type AppIconName =
  | "home"
  | "profile"
  | "guild"
  | "duel"
  | "dungeon"
  | "campaign"
  | "arena"
  | "deck"
  | "tournament"
  | "shop"
  | "battle-pass"
  | "ranking"
  | "collection"
  | "inventory"
  | "mail"
  | "lock"
  | "chevron"
  | "silver"
  | "gold";

interface AppIconProps {
  name: AppIconName;
  size?: number;
}

const paths: Record<AppIconName, ReactNode> = {
  home: (
    <>
      <path d="M3 20.5h18M5 18.5h14M6.5 8.5h11M8 8.5v8M12 8.5v8M16 8.5v8M4.5 6.5 12 2.5l7.5 4H4.5Z" />
    </>
  ),
  profile: (
    <>
      <path d="M7 9.5a5 5 0 0 1 10 0c0 3-2.2 5.5-5 5.5S7 12.5 7 9.5Z" />
      <path d="M4.5 21c.8-3.2 3.5-5 7.5-5s6.7 1.8 7.5 5M8 7.5h8" />
    </>
  ),
  guild: (
    <>
      <path d="M12 2.5 20 5v6.5c0 4.5-3.2 7.8-8 10-4.8-2.2-8-5.5-8-10V5l8-2.5Z" />
      <path d="m8 15 4-8 4 8M9.5 12h5" />
    </>
  ),
  duel: <path d="m5 3 6 6-2 2-6-6V3h2Zm14 0-6 6 2 2 6-6V3h-2ZM8 14l-4.5 4.5M16 14l4.5 4.5M2.5 17.5l4 4M21.5 17.5l-4 4" />,
  dungeon: (
    <>
      <path d="M4 21V8l3-3 2 2 3-4 3 4 2-2 3 3v13M8 21v-8a4 4 0 0 1 8 0v8" />
      <path d="M2.5 21h19M12 13v3" />
    </>
  ),
  campaign: (
    <>
      <path d="M5 21V3M6 4h12l-2 4 2 4H6" />
      <path d="m11.5 6.5.9 1.7 1.9.3-1.4 1.3.3 1.9-1.7-.9-1.7.9.3-1.9-1.4-1.3 1.9-.3.9-1.7Z" />
    </>
  ),
  arena: (
    <>
      <path d="M3 20.5h18M5 18.5V9a7 7 0 0 1 14 0v9.5M8 18.5v-8a4 4 0 0 1 8 0v8" />
      <path d="M3.5 8h17M12 6V3" />
    </>
  ),
  deck: (
    <>
      <rect x="6" y="4" width="12" height="16" rx="2" />
      <path d="M9 1.8h8.5a2.5 2.5 0 0 1 2.5 2.5V17M12 8l1.2 2.1 2.3.5-1.6 1.8.2 2.4-2.1-1-2.1 1 .2-2.4-1.6-1.8 2.3-.5L12 8Z" />
    </>
  ),
  tournament: (
    <>
      <path d="M7 4h10v5a5 5 0 0 1-10 0V4ZM9 18h6M12 14v4M7 6H3.5v2A4.5 4.5 0 0 0 8 12M17 6h3.5v2a4.5 4.5 0 0 1-4.5 4" />
      <path d="M7 21h10" />
    </>
  ),
  shop: (
    <>
      <path d="M3 7.5h18l-1.5-4h-15l-1.5 4Zm1 0v12h16v-12M8 19.5v-6h8v6" />
      <path d="M3 7.5c0 2 3 2.5 4.5.5 1.5 2 3.5 2 4.5 0 1 2 3 2 4.5 0 1.5 2 4.5 1.5 4.5-.5" />
    </>
  ),
  "battle-pass": <path d="m3.5 8 4 3 4.5-7 4.5 7 4-3-1.5 9H5L3.5 8ZM5 20h14M8.5 14h7" />,
  ranking: <path d="M4 21V13h4v8M10 21V7h4v14M16 21V3h4v18M2.5 21.5h19" />,
  collection: (
    <>
      <path d="M5 4.5h11.5a2 2 0 0 1 2 2v13H7a2 2 0 0 1-2-2v-13Z" />
      <path d="M8 2.5h9a2 2 0 0 1 2 2v12M9 8h5.5M9 11.5h5.5" />
    </>
  ),
  inventory: (
    <>
      <path d="M3 9h18v11H3V9ZM5 4h14l2 5H3l2-5ZM9 9v3h6V9" />
      <path d="M9.5 16h5" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m4.5 7 7.5 6 7.5-6" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10" width="14" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" />
    </>
  ),
  chevron: <path d="m9 5 7 7-7 7" />,
  silver: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m12 7 1.5 3 3.5.5-2.5 2.4.6 3.5-3.1-1.7-3.1 1.7.6-3.5L7 10.5l3.5-.5L12 7Z" />
    </>
  ),
  gold: <path d="M12 3.5 19.5 12 12 20.5 4.5 12 12 3.5Zm0 4L8 12l4 4.5 4-4.5-4-4.5Z" />,
};

export function AppIcon({ name, size = 24 }: AppIconProps) {
  return (
    <svg
      aria-hidden="true"
      className="app-icon"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
    >
      <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6">
        {paths[name]}
      </g>
    </svg>
  );
}
