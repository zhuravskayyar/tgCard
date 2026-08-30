import type { CSSProperties } from "react";
import { EQUIPMENT_ICON_SOURCES, type EquipmentIconName } from "../equipment/equipmentIcons";

export function EquipmentIcon({ className = "", name, size = 24 }: { className?: string; name: EquipmentIconName; size?: number }) {
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
