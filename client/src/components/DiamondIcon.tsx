import type { CSSProperties } from "react";
import "../styles/diamond.css";

export const DIAMOND_ICON_SRC = "/assets/ui/icons/icon-diamond-v1.webp";

/** The diamond sprite tinted sapphire, with a light glint and sparkles clipped to its silhouette. */
export function DiamondIcon({ size = 20 }: { size?: number }) {
  return (
    <span aria-hidden="true" className="diamond-icon" style={{ "--diamond-size": `${size}px` } as CSSProperties}>
      <img alt="" height={size} src={DIAMOND_ICON_SRC} width={size} />
    </span>
  );
}
