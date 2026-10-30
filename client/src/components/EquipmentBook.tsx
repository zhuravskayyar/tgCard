import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { EQUIPMENT_ARTIFACT_SLOTS, EQUIPMENT_ELEMENT_LABELS, EQUIPMENT_RARITY_CONFIG, EQUIPMENT_SLOT_LABELS, EQUIPMENT_SLOT_SHORT_LABELS, EQUIPMENT_THING_SLOTS, STARTER_EQUIPMENT_DEFINITIONS } from "@cardastika/game-core";
import type { CardRarity, EquipmentDefinition, EquipmentSlot, EquippedEquipment } from "@cardastika/shared";
import { AppIcon } from "./AppIcon";
import { EquipmentIcon } from "./EquipmentIcon";
import { ElementSymbol } from "./ElementSymbol";
import { getEquipmentSpritePath } from "../equipment/equipmentAssets";

const RACK_CELLS = 8;

export function rarityStyle(rarity: CardRarity) {
  return { "--eq-rarity": EQUIPMENT_RARITY_CONFIG[rarity].color } as CSSProperties;
}

export function EquipmentSprite({ definition }: { definition: EquipmentDefinition }) {
  return <img alt="" className="eq-sprite" draggable={false} src={getEquipmentSpritePath(definition)} />;
}

export function getEquipmentBonusText(definition: EquipmentDefinition) {
  switch (definition.bonusType) {
    case "element_power": return `+${definition.bonusValue} сили карт`;
    case "outgoing_damage": return `+${definition.bonusValue}% урону`;
    case "incoming_damage_reduction": return definition.secondaryBonusValue
      ? `-${definition.bonusValue}% урону, ${definition.secondaryBonusValue}% назад`
      : `-${definition.bonusValue}% отриманого урону`;
    case "damage_reflection": return `${definition.bonusValue}% урону назад`;
    case "health_reduction": return `-${definition.bonusValue}% HP вбивці`;
    case "save_once": return `Повстання з ${definition.bonusValue}% HP`;
    case "passive": return `+${definition.bonusValue}`;
  }
}

/** The mage's sheet with things on the left and artifacts on the right. */
export function EquipmentDoll({ equipped, onSlot }: { equipped: EquippedEquipment; onSlot: (slot: EquipmentSlot, definition?: EquipmentDefinition) => void }) {
  const column = (slots: readonly EquipmentSlot[]) => slots.map((slot) => {
    const definition = STARTER_EQUIPMENT_DEFINITIONS.find(({ id }) => id === equipped[slot]);
    return (
      <button aria-label={`${EQUIPMENT_SLOT_LABELS[slot]}: ${definition?.name ?? "порожньо"}`} className="eq-doll__slot" key={slot} onClick={() => onSlot(slot, definition)} style={definition ? rarityStyle(definition.rarity) : undefined} type="button">
        <span className="eq-frame">
          {definition ? <><EquipmentSprite definition={definition} /><span aria-hidden="true" className="eq-gem" /></> : <span className="eq-frame__empty"><EquipmentIcon name={slot} size={24} /></span>}
        </span>
        <small>{EQUIPMENT_SLOT_SHORT_LABELS[slot]}</small>
      </button>
    );
  });
  return (
    <div aria-label="Одягнене спорядження" className="eq-doll">
      <div className="eq-doll__column eq-doll__column--left">{column(EQUIPMENT_THING_SLOTS)}</div>
      <div className="eq-doll__column eq-doll__column--right">{column(EQUIPMENT_ARTIFACT_SLOTS)}</div>
    </div>
  );
}

export interface RackEntry {
  definition: EquipmentDefinition;
  equipped?: boolean;
  quantity: number;
  selected?: number;
}

/** Items stand in the painted rack; every eight items add another rack below. */
export function EquipmentRack({ entries, onPick }: { entries: readonly RackEntry[]; onPick: (entry: RackEntry) => void }) {
  const rackCount = Math.max(1, Math.ceil(entries.length / RACK_CELLS));
  return (
    <div className="eq-racks">
      {Array.from({ length: rackCount }, (_, rackIndex) => (
        <div className="eq-rack" key={rackIndex}>
          {entries.slice(rackIndex * RACK_CELLS, (rackIndex + 1) * RACK_CELLS).map((entry) => (
            <button
              aria-label={`${entry.definition.name}, кількість ${entry.quantity}${entry.equipped ? ", одягнено" : ""}`}
              className={`eq-rack__item${entry.selected ? " eq-rack__item--selected" : ""}`}
              key={entry.definition.id}
              onClick={() => onPick(entry)}
              style={rarityStyle(entry.definition.rarity)}
              type="button"
            >
              <EquipmentSprite definition={entry.definition} />
              <span aria-hidden="true" className="eq-gem" />
              {entry.quantity > 1 ? <span aria-hidden="true" className="eq-rack__quantity">×{entry.quantity}</span> : null}
              {entry.equipped ? <span aria-hidden="true" className="eq-rack__worn">✓</span> : null}
              {entry.selected ? <span aria-hidden="true" className="eq-rack__picked">{entry.selected}</span> : null}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Leather item card from the sprite: art sits in the bronze recess, text on the parchment. */
/** Sparks thrown out of a point; the parent places it and sets --eq-glow. */
export function EquipmentSparks({ count = 18 }: { count?: number }) {
  return (
    <span aria-hidden="true" className="eq-sparks">
      {Array.from({ length: count }, (_, index) => <i key={index} style={{ "--i": index, "--turn": `${index / count}turn`, "--reach": `${70 + (index * 37) % 70}px` } as CSSProperties} />)}
    </span>
  );
}

export function EquipmentItemCard({ busy = false, celebrate = false, children, definition, eyebrow, onClose }: {
  busy?: boolean;
  celebrate?: boolean;
  children: ReactNode;
  definition: EquipmentDefinition;
  eyebrow?: ReactNode;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (!busyRef.current) onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...(panelRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled)") ?? [])];
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  const rarity = EQUIPMENT_RARITY_CONFIG[definition.rarity];
  return createPortal(
    <div className="eq-card-backdrop" onMouseDown={(event) => { if (!busy && event.currentTarget === event.target) onClose(); }}>
      <section aria-labelledby="eq-card-title" aria-modal="true" className="eq-card" ref={panelRef} role="dialog" style={rarityStyle(definition.rarity)}>
        <button aria-label="Закрити" className="eq-card__close" disabled={busy} onClick={onClose} ref={closeRef} type="button"><AppIcon name="close" size={16} /></button>
        <div className="eq-card__art">{celebrate ? <><span aria-hidden="true" className="eq-card__glow" /><EquipmentSparks /></> : null}<EquipmentSprite definition={definition} /></div>
        <div className="eq-card__body">
          {eyebrow ? <span className="eq-card__eyebrow">{eyebrow}</span> : null}
          <h2 id="eq-card-title">{definition.name.split(" · ")[0]}</h2>
          <span className="eq-card__meta"><span className="eq-gem eq-gem--inline" />{rarity.label}{definition.element ? <><ElementSymbol element={definition.element} size={14} />{EQUIPMENT_ELEMENT_LABELS[definition.element]}</> : null}</span>
          <strong className="eq-card__bonus">{getEquipmentBonusText(definition)}</strong>
          <p>{definition.description}</p>
          <div className="eq-card__actions">{children}</div>
        </div>
      </section>
    </div>,
    document.body,
  );
}
