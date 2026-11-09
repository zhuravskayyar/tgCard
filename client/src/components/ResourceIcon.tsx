import type { CSSProperties } from "react";

export type ResourceIconKind = "xp";

export const RESOURCE_ICON_SOURCES: Record<ResourceIconKind, string> = {
  xp: "/assets/ui/profile/xp.png",
};

interface ResourceIconProps {
  className?: string;
  kind: ResourceIconKind;
  size?: number;
}

export function ResourceIcon({ className, kind, size = 18 }: ResourceIconProps) {
  return (
    <img
      alt=""
      aria-hidden="true"
      className={`resource-icon resource-icon--${kind}${className ? ` ${className}` : ""}`}
      height={size}
      src={RESOURCE_ICON_SOURCES[kind]}
      style={{ "--resource-icon-size": `${size}px` } as CSSProperties}
      width={size}
    />
  );
}
