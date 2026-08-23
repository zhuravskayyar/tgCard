import { AppIcon, type AppIconName } from "./AppIcon";
import { Badge } from "./Badge";

interface MenuRowProps {
  active?: boolean;
  badge?: string;
  compact?: boolean;
  disabled?: boolean;
  icon: AppIconName;
  onClick?: () => void;
  title: string;
}

export function MenuRow({ active = false, badge, compact = false, disabled = false, icon, onClick, title }: MenuRowProps) {
  return (
    <button
      className={`menu-row${compact ? " menu-row--compact" : ""}`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <span className="menu-row__icon">
        <AppIcon name={icon} size={23} />
      </span>
      <span className="menu-row__title">{title}</span>
      <span className="menu-row__action">
        {active ? <span aria-label="Активна" className="menu-row__status" /> : null}
        {badge ? <Badge value={badge} /> : null}
        <AppIcon name="chevron" size={18} />
      </span>
    </button>
  );
}
