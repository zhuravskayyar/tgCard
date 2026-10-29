import { useId, useMemo, type CSSProperties } from "react";
import type { CardElement, CardRarity } from "@cardastika/shared";
import { renderBrightCutElementEmblem } from "../cards/brightCutModel";

interface ElementMedallionProps {
  element: CardElement;
  rarity?: CardRarity;
  size?: number;
}

// The exact card medallion with a light sweep and element glow layered on top.
export function ElementMedallion({ element, rarity = "common", size }: ElementMedallionProps) {
  const id = `element-medallion-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const markup = useMemo(() => renderBrightCutElementEmblem({ element, id, rarity }), [element, id, rarity]);
  const style = size ? ({ "--medallion-size": `${size}px` } as CSSProperties) : undefined;

  return (
    <span aria-hidden="true" className={`element-medallion element-medallion--${element}`} style={style}>
      <span className="element-medallion__glow" />
      <span className="element-medallion__emblem" dangerouslySetInnerHTML={{ __html: markup }} />
      <span className="element-medallion__shine" />
    </span>
  );
}
