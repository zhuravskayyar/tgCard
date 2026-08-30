import type { CSSProperties, ReactNode } from "react";
import { CURRENCY_ICON_SOURCES } from "./CurrencyDisplay";
import { ResourceIcon } from "./ResourceIcon";

export type AppIconName =
  | "home"
  | "profile"
  | "guild"
  | "duel"
  | "dungeon"
  | "campaign"
  | "arena"
  | "deck"
  | "deck-power"
  | "weak-cards"
  | "card-absorb"
  | "card-strength"
  | "card-reward"
  | "card-shards"
  | "element-cards"
  | "equipment"
  | "record"
  | "tournament"
  | "shop"
  | "battle-pass"
  | "ranking"
  | "collection"
  | "inventory"
  | "mail"
  | "tasks"
  | "lock"
  | "settings"
  | "chevron"
  | "close"
  | "silver"
  | "gold"
  | "arena-token"
  | "arena-shop"
  | "target"
  | "refresh";

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
  "deck-power": (
    <>
      <path d="M5 5.5h11.5a2 2 0 0 1 2 2V20H7a2 2 0 0 1-2-2V5.5Z" />
      <path d="M3.5 3.5h11a2 2 0 0 1 2 2M11.5 8 9 13h3l-1 4 4-6h-3l1-3Z" />
    </>
  ),
  "weak-cards": (
    <>
      <path d="m7 5 10 2-2.5 13-10-2L7 5Z" />
      <path d="m9 3 10 2-1 5M12 10v6m0 0-2-2m2 2 2-2" />
    </>
  ),
  "card-absorb": (
    <>
      <path d="M6 4h11a2 2 0 0 1 2 2v13H8a2 2 0 0 1-2-2V4Z" />
      <path d="M4 7v12a2 2 0 0 0 2 2h9M12 9v7m0 0-2-2m2 2 2-2" />
    </>
  ),
  "card-strength": (
    <>
      <rect x="5" y="4" width="14" height="16" rx="2" />
      <path d="m12 7 1.3 3 3.2.3-2.4 2.1.7 3.1-2.8-1.6-2.8 1.6.7-3.1-2.4-2.1 3.2-.3L12 7ZM12 20v2" />
    </>
  ),
  "card-reward": (
    <>
      <path d="M5 6h12a2 2 0 0 1 2 2v12H7a2 2 0 0 1-2-2V6Z" />
      <path d="M3 4h12a2 2 0 0 1 2 2M12 9l1 2 2.2.3-1.6 1.5.4 2.2-2-1-2 1 .4-2.2-1.6-1.5L11 11l1-2Z" />
    </>
  ),
  "card-shards": <path d="m12 2 7 4-2 12-5 4-5-4L5 6l7-4Z" />,
  "element-cards": (
    <>
      <path d="m5 7 7-4 7 4-7 4-7-4ZM5 12l7 4 7-4M5 17l7 4 7-4" />
      <path d="M12 3v18" />
    </>
  ),
  equipment: (
    <>
      <path d="M8 10a4 4 0 0 1 8 0v2h2v9H6v-9h2v-2Z" />
      <path d="M9 10V7a3 3 0 0 1 6 0v3M10 15h4M12 13v4" />
    </>
  ),
  record: (
    <>
      <path d="M8 4h8v5a4 4 0 0 1-8 0V4ZM10 16h4M12 13v3M7 20h10" />
      <path d="M8 6H4v2a4 4 0 0 0 4 4M16 6h4v2a4 4 0 0 1-4 4" />
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
  tasks: (
    <>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 2.5h6M8.5 9h7M8.5 13h7M8.5 17h4" />
      <path d="m6.5 9 .8.8 1.3-1.6" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10" width="14" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" />
    </>
  ),
  settings: (
    <>
      <path d="M12 8.1a3.9 3.9 0 1 0 0 7.8 3.9 3.9 0 0 0 0-7.8Z" />
      <path d="m19.4 13.2 1.2.9-1.7 2.9-1.4-.6a7.7 7.7 0 0 1-1.8 1l-.2 1.5h-3.4l-.2-1.5a7.7 7.7 0 0 1-1.8-1l-1.4.6-1.7-2.9 1.2-.9a7.3 7.3 0 0 1 0-2.4l-1.2-.9 1.7-2.9 1.4.6a7.7 7.7 0 0 1 1.8-1l.2-1.5h3.4l.2 1.5a7.7 7.7 0 0 1 1.8 1l1.4-.6 1.7 2.9-1.2.9a7.3 7.3 0 0 1 0 2.4Z" />
    </>
  ),
  chevron: <path d="m9 5 7 7-7 7" />,
  close: <path d="m5 5 14 14M19 5 5 19" />,
  silver: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m12 7 1.5 3 3.5.5-2.5 2.4.6 3.5-3.1-1.7-3.1 1.7.6-3.5L7 10.5l3.5-.5L12 7Z" />
    </>
  ),
  gold: <path d="M12 3.5 19.5 12 12 20.5 4.5 12 12 3.5Zm0 4L8 12l4 4.5 4-4.5-4-4.5Z" />,
  "arena-token": <circle cx="12" cy="12" r="8" />,
  "arena-shop": <path d="M4 8h16l-2 12H6L4 8Zm3-4h10l3 4H4l3-4ZM9 13h6" />,
  target: <path d="M12 3v3M12 18v3M3 12h3M18 12h3M7.2 7.2l2.1 2.1M14.7 14.7l2.1 2.1M16.8 7.2l-2.1 2.1M9.3 14.7l-2.1 2.1M12 7.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9Z" />,
  refresh: <path d="M20 11a8 8 0 0 0-14.7-4L3 10m0 0V5m0 5h5M4 13a8 8 0 0 0 14.7 4L21 14m0 0v5m0-5h-5" />,
};

const gameIconSources: Partial<Record<AppIconName, string>> = {
  home: "/assets/ui/world-tree/game-icons/castle.svg",
  profile: "/assets/ui/world-tree/game-icons/black-knight-helm.svg",
  guild: "/assets/ui/world-tree/game-icons/templar-shield.svg",
  duel: "/assets/ui/world-tree/game-icons/crossed-swords.svg",
  dungeon: "/assets/ui/world-tree/game-icons/dungeon-gate.svg",
  campaign: "/assets/ui/world-tree/game-icons/tattered-banner.svg",
  arena: "/assets/ui/world-tree/game-icons/coliseum.svg",
  deck: "/assets/ui/world-tree/game-icons/card-random.svg",
  "deck-power": "/assets/ui/world-tree/game-icons/deck-power-winged-sword.svg",
  "weak-cards": "/assets/ui/world-tree/game-icons/weak-cards.svg",
  "card-absorb": "/assets/ui/world-tree/game-icons/card-absorb.svg",
  "card-strength": "/assets/ui/world-tree/game-icons/card-strength.svg",
  "card-reward": "/assets/ui/world-tree/game-icons/card-reward.svg",
  "card-shards": "/assets/ui/shop/icon_card_shard_v2.webp",
  "element-cards": "/assets/ui/world-tree/game-icons/element-cards.svg",
  equipment: "/assets/ui/world-tree/game-icons/equipment-backpack.svg",
  record: "/assets/ui/world-tree/game-icons/record-medallist.svg",
  tournament: "/assets/ui/world-tree/game-icons/laurels-trophy.svg",
  shop: "/assets/ui/world-tree/game-icons/shop.svg",
  "arena-shop": "/assets/arena/arena-shop.svg",
  target: "/assets/arena/target.svg",
  "battle-pass": "/assets/ui/world-tree/game-icons/crenel-crown.svg",
};

export function AppIcon({ name, size = 24 }: AppIconProps) {
  if (name === "silver" || name === "gold") {
    return <img alt="" aria-hidden="true" className={`app-icon currency-icon currency-icon--${name}`} height={size} src={CURRENCY_ICON_SOURCES[name]} width={size} />;
  }

  if (name === "arena-token") {
    return <ResourceIcon kind="arena-token" size={size} />;
  }

  const gameIconSource = gameIconSources[name];

  if (gameIconSource) {
    return (
      <span
        aria-hidden="true"
        className="app-icon app-icon--game"
        style={{
          "--app-icon-source": `url("${gameIconSource}")`,
          height: size,
          width: size,
        } as CSSProperties}
      />
    );
  }

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
