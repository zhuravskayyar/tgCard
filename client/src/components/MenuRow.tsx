import { AppIcon, type AppIconName } from "./AppIcon";
import { Badge } from "./Badge";
import { MenuTextureSlices } from "./MenuTextureSlices";

interface MenuRowProps {
  active?: boolean;
  badge?: string;
  compact?: boolean;
  disabled?: boolean;
  icon: AppIconName;
  metalTexture?: boolean;
  onClick?: () => void;
  attention?: boolean;
  title: string;
}

export function MenuRow({ active: _active = false, attention = false, badge, compact = false, disabled = false, icon, metalTexture = false, onClick, title }: MenuRowProps) {
  return (
    <button
      className={`menu-row${compact ? " menu-row--compact" : ""}${attention ? " menu-row--attention" : ""}${metalTexture ? " menu-row--metal-texture" : ""}`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {metalTexture ? <MenuTextureSlices /> : null}
      <span className="menu-row__icon">
        <AppIcon name={icon} size={23} />
      </span>
      <span className="menu-row__title">{title}</span>
      <span className="menu-row__action">
        {attention ? <span aria-hidden="true" className="menu-row__indicator" /> : badge ? <Badge value={badge} /> : null}
      </span>
    </button>
  );
}
