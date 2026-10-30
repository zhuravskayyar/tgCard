import type { ReactNode, Ref } from "react";
import { AppIcon } from "./AppIcon";

interface ScreenHeadingProps {
  action?: ReactNode;
  backDisabled?: boolean;
  backLabel?: string;
  backTutorialTarget?: string;
  description?: ReactNode;
  eyebrow?: ReactNode;
  onBack?: () => void;
  ref?: Ref<HTMLElement>;
  tabIndex?: number;
  title: ReactNode;
  titleId?: string;
  titleFirst?: boolean;
}

export function ScreenHeading({ action, backDisabled = false, backLabel = "Назад", backTutorialTarget, description, eyebrow, onBack, ref, tabIndex, title, titleId, titleFirst = false }: ScreenHeadingProps) {
  const subtitle = eyebrow ? <span className="screen-heading__eyebrow">{eyebrow}</span> : null;

  return (
    <header className={`screen-heading${onBack ? " screen-heading--back" : ""}${action ? " screen-heading--action" : ""}`} ref={ref} tabIndex={tabIndex}>
      {onBack ? <button aria-label={backLabel} className="screen-heading__back" data-tutorial-target={backTutorialTarget} disabled={backDisabled} onClick={onBack} type="button"><AppIcon name="back" size={20} /></button> : null}
      <div className="screen-heading__copy">
        {titleFirst ? null : subtitle}
        <h1 id={titleId}>{title}</h1>
        {titleFirst ? subtitle : null}
        {description ? <p>{description}</p> : null}
      </div>
      {action ? <div className="screen-heading__action">{action}</div> : null}
    </header>
  );
}
