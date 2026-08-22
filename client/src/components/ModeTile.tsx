import { AppIcon, type AppIconName } from "./AppIcon";

export type ModeAccent = "steel" | "emerald" | "gold" | "violet" | "arcane" | "bronze";

interface ModeTileProps {
  accent: ModeAccent;
  icon: AppIconName;
  title: string;
}

export function ModeTile({ accent, icon, title }: ModeTileProps) {
  return (
    <button className={`mode-tile mode-tile--${accent}`} type="button">
      <span className="mode-tile__icon">
        <AppIcon name={icon} size={66} />
      </span>
      <span className="mode-tile__title">{title}</span>
    </button>
  );
}
