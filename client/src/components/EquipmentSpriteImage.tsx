import type { CSSProperties } from "react";
import type { EquipmentDefinition } from "@cardastika/shared";
import { getEquipmentSpritePath } from "../equipment/equipmentAssets";

/**
 * One ink-and-cream sprite per item type. Things get their element by multiplying
 * an element colour over the sprite's own silhouette: black ink stays, cream takes the tint.
 */
export function EquipmentSpriteImage({ className, definition, onError }: { className: string; definition: Pick<EquipmentDefinition, "assetKey" | "category" | "element" | "slot">; onError?: () => void }) {
  const src = getEquipmentSpritePath(definition);
  const element = definition.category === "things" ? definition.element : undefined;
  return (
    <span
      aria-hidden="true"
      className={`${className} equipment-sprite${element ? ` equipment-sprite--${element}` : ""}`}
      style={element ? { "--equipment-sprite-mask": `url("${src}")` } as CSSProperties : undefined}
    >
      <img alt="" draggable={false} onError={onError} src={src} />
    </span>
  );
}
