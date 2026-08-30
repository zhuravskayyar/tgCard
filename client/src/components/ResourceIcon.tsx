import type { CSSProperties } from "react";

export type ResourceIconKind = "arena-token" | "xp";

export const RESOURCE_ICON_SOURCES: Record<ResourceIconKind, string> = {
  "arena-token": "/assets/arena/arena-token-yellow-v1.png",
  xp: "/assets/ui/world-tree/experience-blue-v1.png",
};

export const ARENA_TOKEN_ICON_SOURCE = RESOURCE_ICON_SOURCES["arena-token"];

interface ResourceIconProps {
  kind: ResourceIconKind;
  size?: number;
}

export function ResourceIcon({ kind, size = 18 }: ResourceIconProps) {
  return (
    <img
      alt=""
      aria-hidden="true"
      className={`resource-icon resource-icon--${kind}`}
      height={size}
      src={RESOURCE_ICON_SOURCES[kind]}
      style={{ "--resource-icon-size": `${size}px` } as CSSProperties}
      width={size}
    />
  );
}
