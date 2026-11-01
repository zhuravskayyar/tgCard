import { useId, type ReactNode } from "react";
import type { CardElement } from "@cardastika/shared";

export const GUILD_EMBLEM_OPTIONS = [
  { id: "shield-1", label: "Смуги" },
  { id: "shield-2", label: "Зубці" },
  { id: "shield-3", label: "Шахи" },
  { id: "shield-4", label: "Хрест" },
  { id: "shield-5", label: "Косий хрест" },
  { id: "shield-6", label: "Клепсидра" },
  { id: "shield-7", label: "Половина" },
  { id: "shield-8", label: "Навскіс" },
  { id: "shield-9", label: "Перев'язь" },
  { id: "shield-10", label: "Чверті" },
] as const;

// Paint for the charge; a guild without an element keeps plain umber ink.
const ELEMENT_PAINT: Record<CardElement, string> = { fire: "#a8281a", water: "#1c5f96", air: "#c9951f", earth: "#3b7d2a" };
const NEUTRAL_PAINT = "#3a2817";
const FIELD_PAINT = "#ecdfc2";
const SHIELD_SOURCE = "/assets/guild/emblem-unknown-v1.webp";
// The shield's inner face in the sprite's 512 grid, inside the bronze rim.
const SHIELD_FACE = "M103 140 Q 180 132 256 106 Q 332 132 409 140 Q 416 262 366 340 Q 322 400 256 428 Q 190 400 146 340 Q 96 262 103 140 Z";

// Charges are drawn across the whole 512 grid; the face clip trims them to the shield.
const CHARGES: Readonly<Record<string, ReactNode>> = {
  "shield-1": <><rect x="0" y="150" width="512" height="48" /><rect x="0" y="240" width="512" height="48" /><rect x="0" y="330" width="512" height="48" /></>,
  "shield-2": <path d="M0 0 H300 L216 80 L300 160 L216 240 L300 320 L216 400 L300 512 H0 Z" />,
  "shield-3": <path d="M100 100 H185 V195 H100 Z M270 100 H355 V195 H270 Z M185 195 H270 V290 H185 Z M355 195 H440 V290 H355 Z M100 290 H185 V385 H100 Z M270 290 H355 V385 H270 Z M185 385 H270 V480 H185 Z" />,
  "shield-4": <path d="M222 0 H290 V212 H512 V280 H290 V512 H222 V280 H0 V212 H222 Z" />,
  "shield-5": <path d="M60 60 L108 12 L256 198 L404 12 L452 60 L304 246 L452 432 L404 480 L256 294 L108 480 L60 432 L208 246 Z" />,
  "shield-6": <path d="M60 60 H452 L256 246 Z M60 450 H452 L256 246 Z" />,
  "shield-7": <rect x="0" y="0" width="256" height="512" />,
  "shield-8": <path d="M0 0 H512 L0 512 Z" />,
  "shield-9": <path d="M60 60 L124 0 L470 400 L410 460 Z" />,
  "shield-10": <path d="M0 0 H256 V246 H0 Z M256 246 H512 V512 H256 Z" />,
};

// Prize crests are awarded, never picked: the server rejects these ids from players.
const PRIZE_EMBLEMS: ReadonlySet<string> = new Set(["fleur", "bull", "eagle", "clover", "trident", "moon", "sun", "seadragon", "dragon", "tiger", "bear", "cobra", "lion", "bat", "tulip", "eye", "serpent", "fern", "star", "wolf", "lynx", "griffin"].map((name) => `prize-${name}`));

interface GuildEmblemProps {
  element?: CardElement | null;
  emblemId?: string;
}

// The painted bronze shield with a heraldic charge laid under its own metal: the sprite is
// multiplied back over the paint, so scratches and shading of the shield show through it.
export function GuildEmblem({ element, emblemId }: GuildEmblemProps) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const charge = emblemId ? CHARGES[emblemId] : undefined;
  const prize = emblemId && PRIZE_EMBLEMS.has(emblemId) ? emblemId : null;
  return <span className="guild-emblem" aria-hidden="true">
    <svg className="guild-emblem__shield" viewBox="0 0 512 512">
      <defs>
        <clipPath id={`${id}-face`}><path d={SHIELD_FACE} /></clipPath>
        <filter id={`${id}-worn`} x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence baseFrequency="0.035" numOctaves="2" seed="7" type="fractalNoise" />
          <feDisplacementMap in="SourceGraphic" scale="7" />
        </filter>
      </defs>
      <image height="512" href={SHIELD_SOURCE} width="512" />
      {charge ? <g clipPath={`url(#${id}-face)`}>
        <rect fill={FIELD_PAINT} height="512" width="512" />
        <g fill={element ? ELEMENT_PAINT[element] : NEUTRAL_PAINT} filter={`url(#${id}-worn)`}>{charge}</g>
        <image className="guild-emblem__metal" height="512" href={SHIELD_SOURCE} width="512" />
      </g> : null}
      {prize ? <>
        <g clipPath={`url(#${id}-face)`}>
          <rect fill={FIELD_PAINT} height="512" width="512" />
          <image className="guild-emblem__metal" height="512" href={SHIELD_SOURCE} width="512" />
        </g>
        <image height="268" href={`/assets/guild/${prize}-v1.webp`} width="268" x="122" y="128" />
      </> : null}
    </svg>
  </span>;
}
