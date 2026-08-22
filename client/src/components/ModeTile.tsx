import { AppIcon, type AppIconName } from "./AppIcon";

export type ModeAccent = "steel" | "emerald" | "gold" | "violet" | "arcane" | "bronze";

interface ModeTileProps {
  accent: ModeAccent;
  icon: AppIconName;
  onClick?: () => void;
  title: string;
}

export function ModeTile({ accent, icon, onClick, title }: ModeTileProps) {
  return (
    <button className={`mode-tile mode-tile--${accent}`} onClick={onClick} type="button">
      <span className="mode-tile__icon">
        <AppIcon name={icon} size={66} />
      </span>
      <span className="mode-tile__title">{title}</span>
    </button>
  );
}
