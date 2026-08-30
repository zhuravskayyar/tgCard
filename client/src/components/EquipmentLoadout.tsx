import { useEffect, useState, type CSSProperties } from "react";
import {
  EQUIPMENT_ARTIFACT_SLOTS,
  EQUIPMENT_RARITY_CONFIG,
  EQUIPMENT_SLOT_LABELS,
  EQUIPMENT_THING_SLOTS,
  STARTER_EQUIPMENT_DEFINITIONS,
} from "@cardastika/game-core";
import { EQUIPMENT_SLOTS, type EquipmentDefinition, type EquipmentSlot, type EquippedEquipment } from "@cardastika/shared";
import { EquipmentIcon } from "./EquipmentIcon";
import { ElementSymbol } from "./ElementSymbol";
import { getEquipmentRarityClass, getEquipmentSpritePath } from "../equipment/equipmentAssets";

interface EquipmentArtProps {
  className?: string;
  definition?: EquipmentDefinition;
  showFallbackIcon?: boolean;
  showElement?: boolean;
  slot: EquipmentSlot;
}

export function EquipmentArt({ className = "", definition, showElement = true, showFallbackIcon = true, slot }: EquipmentArtProps) {
  const element = definition?.element ?? null;
  const spritePath = definition ? getEquipmentSpritePath(definition) : null;
  const [failedSpritePath, setFailedSpritePath] = useState<string | null>(null);

  useEffect(() => {
    setFailedSpritePath(null);
  }, [spritePath]);

  const rarityClass = definition ? getEquipmentRarityClass(definition.rarity) : "";
  const showSprite = Boolean(spritePath && failedSpritePath !== spritePath);

  return (
    <span
      aria-hidden="true"
      className={`equipment-art${definition ? " equipment-art--filled" : " equipment-art--empty"}${definition ? ` equipment-art--${definition.category}` : ""}${rarityClass ? ` ${rarityClass}` : ""}${className ? ` ${className}` : ""}`}
      style={definition ? { "--equipment-rarity": EQUIPMENT_RARITY_CONFIG[definition.rarity].color } as CSSProperties : undefined}
    >
      <span className="equipment-art__background" />
      {definition && showSprite ? <img alt="" className="equipment-art__sprite" onError={() => setFailedSpritePath(spritePath)} src={spritePath ?? ""} /> : showFallbackIcon || !definition ? <EquipmentIcon name={slot} size={30} /> : null}
      {definition ? <span className="equipment-art__rarity" /> : null}
      {definition ? <span className="equipment-art__vfx" /> : null}
      {showElement && element ? <span className={`equipment-art__element equipment-art__element--${element}`}><ElementSymbol element={element} size={13} /></span> : null}
    </span>
  );
}

export function EquipmentSlotCard({ definition, onSelect, slot }: { definition?: EquipmentDefinition; onSelect?: () => void; slot: EquipmentSlot }) {
  return (
    <button
      aria-label={`${EQUIPMENT_SLOT_LABELS[slot]}: ${definition?.name ?? "Порожній слот"}`}
      className={`equipment-slot equipment-slot--${slot}${definition ? ` equipment-slot--filled ${getEquipmentRarityClass(definition.rarity)}` : " equipment-slot--empty"}`}
      disabled={!onSelect}
      onClick={onSelect}
      style={definition ? { "--equipment-rarity": EQUIPMENT_RARITY_CONFIG[definition.rarity].color } as CSSProperties : undefined}
      type="button"
    >
      <span className="slotFrame">
        <EquipmentArt definition={definition} showElement={false} slot={slot} />
        {definition ? <span aria-label="Одягнено" className="equippedMark" /> : null}
      </span>
    </button>
  );
}

export function EquipmentCharacter({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`equipment-character${compact ? " equipment-character--compact" : ""}`}>
      <div aria-hidden="true" className="equipment-character__sceneBackgroundLayer characterBackground" />
      <div aria-hidden="true" className="equipment-character__sceneOverlayLayer characterOverlay" />
      <div className="equipment-character__characterLayer equipment-character__frame">
        <div className="characterSilhouette">
          <img alt="Силует мага" className="equipment-character__mage" src="/assets/profile/mage-silhouette.webp" />
        </div>
        <div aria-hidden="true" className="equipment-character__sceneFxLayer characterAura" />
        <div aria-hidden="true" className="equipment-character__sceneFxLayer characterForegroundEffects" />
      </div>
    </div>
  );
}

export function EquipmentLoadout({
  className = "",
  compact = false,
  equipped,
  onSelectSlot,
  readonly = false,
}: {
  className?: string;
  compact?: boolean;
  equipped: EquippedEquipment;
  onSelectSlot?: (slot: EquipmentSlot, definition?: EquipmentDefinition) => void;
  readonly?: boolean;
}) {
  const definitionsById = new Map(STARTER_EQUIPMENT_DEFINITIONS.map((definition) => [definition.id, definition]));
  const definitionsBySlot = new Map(
    EQUIPMENT_SLOTS.flatMap((slot) => {
      const itemId = equipped[slot];
      const definition = itemId ? definitionsById.get(itemId) : undefined;
      return definition ? [[slot, definition] as const] : [];
    }),
  );

  return (
    <div aria-label={readonly ? "Перегляд спорядження" : "Екіпіроване спорядження"} className={`equipment-loadout-panel${compact ? " equipment-loadout-panel--compact" : ""}${className ? ` ${className}` : ""}`}>
      <div className="equipment-loadout__layer equipment-loadout__layer--equipmentSlots equipment-loadout__column equipment-loadout__column--left">
        {EQUIPMENT_THING_SLOTS.map((slot) => {
          const definition = definitionsBySlot.get(slot);
          return <EquipmentSlotCard definition={definition} key={slot} onSelect={onSelectSlot && !readonly ? () => onSelectSlot(slot, definition) : undefined} slot={slot} />;
        })}
      </div>
      <EquipmentCharacter compact={compact} />
      <div className="equipment-loadout__layer equipment-loadout__layer--equipmentSlots equipment-loadout__column equipment-loadout__column--right">
        {EQUIPMENT_ARTIFACT_SLOTS.map((slot) => {
          const definition = definitionsBySlot.get(slot);
          return <EquipmentSlotCard definition={definition} key={slot} onSelect={onSelectSlot && !readonly ? () => onSelectSlot(slot, definition) : undefined} slot={slot} />;
        })}
      </div>
    </div>
  );
}

export function getEquipmentDefinition(itemId: string | null | undefined) {
  return itemId ? STARTER_EQUIPMENT_DEFINITIONS.find((definition) => definition.id === itemId) : undefined;
}
