import type { ReactNode } from "react";

export type RibbonTitleSize = "small" | "medium" | "wide";
export type RibbonTitleElement = "h1" | "h2" | "h3" | "div";

interface RibbonTitleProps {
  as?: RibbonTitleElement;
  children: ReactNode;
  className?: string;
  id?: string;
  leading?: ReactNode;
  size?: RibbonTitleSize;
  trailing?: ReactNode;
}

export function RibbonTitle({ as = "h2", children, className = "", id, leading, size = "medium", trailing }: RibbonTitleProps) {
  const TitleElement = as;
  return <TitleElement className={`ribbon-title ribbon-title--${size}${className ? ` ${className}` : ""}`} id={id}>
    {leading ? <span className="ribbon-title__leading">{leading}</span> : null}
    <span className="ribbon-title__text">{children}</span>
    {trailing ? <span className="ribbon-title__trailing">{trailing}</span> : null}
  </TitleElement>;
}
