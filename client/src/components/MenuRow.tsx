import { AppIcon, type AppIconName } from "./AppIcon";
import { Badge } from "./Badge";

interface MenuRowProps {
  badge?: string;
  icon: AppIconName;
  title: string;
}

export function MenuRow({ badge, icon, title }: MenuRowProps) {
  return (
    <button className="menu-row" type="button">
      <span className="menu-row__icon">
        <AppIcon name={icon} size={23} />
      </span>
      <span className="menu-row__title">{title}</span>
      <span className="menu-row__action">
        {badge ? <Badge value={badge} /> : null}
        <AppIcon name="chevron" size={18} />
      </span>
    </button>
  );
}
