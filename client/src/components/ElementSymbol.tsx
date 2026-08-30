import type { CSSProperties } from "react";
import type { CardElement } from "@cardastika/shared";
import { ELEMENT_ICONS } from "../equipment/equipmentIcons";

export function ElementSymbol({ element, size }: { element: CardElement | "all"; size?: number }) {
  const style = {
    "--element-icon-source": `url("${ELEMENT_ICONS[element]}")`,
    ...(size ? { height: size, width: size } : {}),
  } as CSSProperties;
  return <span aria-hidden="true" className={`element-symbol element-symbol--asset element-symbol--${element}`} style={style} />;
}
