import { AppIcon, type AppIconName } from "./AppIcon";

export type ModeAccent = "bronze" | "gold";

interface ModeTileProps {
  accent: ModeAccent;
  dataTutorialTarget?: string;
  icon: AppIconName;
  iconSrc?: string;
  onClick?: () => void;
  status?: string;
  title: string;
}

export function ModeTile({ accent, dataTutorialTarget, icon, iconSrc, onClick, status, title }: ModeTileProps) {
  return (
    <button aria-disabled={!onClick} className={`mode-tile mode-tile--${accent}${!onClick ? " mode-tile--disabled" : ""}`} data-mode={icon} data-tutorial-target={dataTutorialTarget} disabled={!onClick} onClick={onClick} type="button">
      <span className="mode-tile__icon">
        {iconSrc ? <img alt="" aria-hidden="true" className="mode-tile__sprite" src={iconSrc} /> : <AppIcon name={icon} size={58} />}
      </span>
      <span className="mode-tile__title">{title}</span>
      {status ? <span className="mode-tile__status">{status}</span> : null}
    </button>
  );
}
