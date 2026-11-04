import { useCallback, useRef, type ReactNode } from "react";
import { useGyroscopeCardTilt } from "../hooks/useGyroscopeCardTilt";

interface RewardCardSurfaceProps {
  ariaLabel?: string;
  children: ReactNode;
  className: string;
  interactive?: boolean;
  onClick?: () => void;
}

export function RewardCardSurface({ ariaLabel, children, className, interactive = false, onClick }: RewardCardSurfaceProps) {
  const cardRef = useRef<HTMLElement | null>(null);
  const attachCard = useCallback((card: HTMLElement | null) => { cardRef.current = card; }, []);
  useGyroscopeCardTilt(cardRef);
  const classes = `shop-reveal__card${interactive ? " shop-reveal__card--interactive" : ""} ${className}`;

  return interactive ? (
    <button aria-label={ariaLabel} className={classes} onClick={onClick} ref={attachCard} type="button">{children}</button>
  ) : (
    <div aria-label={ariaLabel} className={classes} ref={attachCard} role="img">{children}</div>
  );
}
