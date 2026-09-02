import type { ReactNode } from "react";
import { AppIcon, type AppIconName } from "./AppIcon";
import { Badge } from "./Badge";
import { MenuTextureSlices } from "./MenuTextureSlices";

interface MenuRowProps {
  active?: boolean;
  badge?: string;
  compact?: boolean;
  detail?: string;
  disabled?: boolean;
  icon: AppIconName;
  iconSrc?: string;
  locked?: boolean;
  metalTexture?: boolean;
  onClick?: () => void;
  attention?: boolean;
  actionContent?: ReactNode;
  title: string;
}

export function MenuRow({ active: _active = false, actionContent, attention = false, badge, compact = false, detail, disabled = false, icon, iconSrc, locked = false, metalTexture = false, onClick, title }: MenuRowProps) {
  return (
    <button
      className={`menu-row${compact ? " menu-row--compact" : ""}${attention ? " menu-row--attention" : ""}${metalTexture ? " menu-row--metal-texture" : ""}`}
      disabled={disabled}
      aria-label={locked ? `${title}: поки недоступно` : undefined}
      onClick={onClick}
      type="button"
    >
      {metalTexture ? <MenuTextureSlices /> : null}
      <span className="menu-row__icon">
        {iconSrc ? <img alt="" aria-hidden="true" className="menu-row__icon-image" src={iconSrc} /> : <AppIcon name={icon} size={23} />}
      </span>
      <span className="menu-row__title">{title}</span>
      <span className="menu-row__action">
        {actionContent ?? (locked ? <AppIcon name="lock" size={14} /> : attention ? <span aria-hidden="true" className="menu-row__indicator" /> : detail ? <span className="menu-row__detail">{detail}</span> : badge ? <Badge value={badge} /> : null)}
      </span>
    </button>
  );
}
