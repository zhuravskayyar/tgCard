import { AppIcon, type AppIconName } from "./AppIcon";

export type ModeAccent = "steel" | "emerald" | "gold" | "violet" | "arcane" | "red";

interface ModeTileProps {
  accent: ModeAccent;
  dataTutorialTarget?: string;
  icon: AppIconName;
  onClick?: () => void;
  status?: string;
  title: string;
}

export function ModeTile({ accent, dataTutorialTarget, icon, onClick, status, title }: ModeTileProps) {
  return (
    <button aria-disabled={!onClick} className={`mode-tile mode-tile--${accent}${!onClick ? " mode-tile--disabled" : ""}`} data-tutorial-target={dataTutorialTarget} disabled={!onClick} onClick={onClick} type="button">
      <span className="mode-tile__icon">
        <AppIcon name={icon} size={58} />
      </span>
      <span className="mode-tile__title">{title}</span>
      {status ? <span className="mode-tile__status">{status}</span> : null}
    </button>
  );
}
