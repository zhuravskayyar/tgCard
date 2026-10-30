import type { CSSProperties } from "react";
import { EQUIPMENT_ICON_SOURCES, type EquipmentIconName } from "../equipment/equipmentIcons";

export function EquipmentIcon({ className = "", name, size = 24 }: { className?: string; name: EquipmentIconName; size?: number }) {
  const source = EQUIPMENT_ICON_SOURCES[name];
  // Painted icons carry their own colours; only silhouettes are tinted through a mask.
  if (source.endsWith(".webp")) {
    return <img alt="" aria-hidden="true" className={`equipment-icon equipment-icon--painted${className ? ` ${className}` : ""}`} height={size} src={source} width={size} />;
  }
  return (
    <span
      aria-hidden="true"
      className={`equipment-icon${className ? ` ${className}` : ""}`}
      style={{
        "--equipment-icon-source": `url("${EQUIPMENT_ICON_SOURCES[name]}")`,
        height: size,
        width: size,
      } as CSSProperties}
    />
  );
}
