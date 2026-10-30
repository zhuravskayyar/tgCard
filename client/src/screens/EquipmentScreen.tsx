import { ScreenHeading } from "../components/ScreenHeading";
import { useMemo, useRef, useState } from "react";
import {
  calculateEquipmentSummary,
  EQUIPMENT_ARTIFACT_SLOTS,
  EQUIPMENT_ELEMENT_LABELS,
  EQUIPMENT_RARITY_CONFIG,
  EQUIPMENT_SLOT_LABELS,
  EQUIPMENT_THING_SLOTS,
  getEquipmentBattleModifiers,
  STARTER_EQUIPMENT_DEFINITIONS,
} from "@cardastika/game-core";
import { CARD_RARITIES, EQUIPMENT_SLOTS, type CardElement, type EquipmentCategory, type EquipmentDefinition, type EquipmentSlot, type EquippedEquipment, type PlayerEquipmentInventory } from "@cardastika/shared";
import { EquipmentIcon } from "../components/EquipmentIcon";
import { EquipmentDoll, EquipmentItemCard, EquipmentRack, getEquipmentBonusText, type RackEntry } from "../components/EquipmentBook";
import { ElementSymbol } from "../components/ElementSymbol";
import { EQUIPMENT_ELEMENT_ORDER } from "../equipment/equipmentIcons";
import type { EquipmentInventoryStatus } from "../equipment/equipmentState";

interface EquipmentScreenProps {
  equipped: EquippedEquipment;
  inventory: readonly PlayerEquipmentInventory[];
  inventoryStatus: EquipmentInventoryStatus;
  initialItemId?: string | null;
  onBack: () => void;
  onEquippedChange: (equipped: EquippedEquipment) => Promise<boolean>;
  onOpenForge: () => void;
  saveError: string | null;
  savePending: boolean;
}

export function EquipmentScreen({ equipped, inventory, inventoryStatus, initialItemId = null, onBack, onEquippedChange, onOpenForge, saveError, savePending }: EquipmentScreenProps) {
  const definitionsById = useMemo(() => new Map(STARTER_EQUIPMENT_DEFINITIONS.map((definition) => [definition.id, definition])), []);
  const initialDefinition = initialItemId ? definitionsById.get(initialItemId) : undefined;
  const [category, setCategory] = useState<EquipmentCategory>(initialDefinition?.category ?? "things");
  const [slotFilter, setSlotFilter] = useState<EquipmentSlot | "all">("all");
  const [elementFilter, setElementFilter] = useState<CardElement | "all">("all");
  const [selectedItemId, setSelectedItemId] = useState<string | null>(initialItemId);
  const rackRef = useRef<HTMLElement>(null);

  const inventoryById = useMemo(() => new Map(inventory.map((entry) => [entry.itemId, entry.quantity])), [inventory]);
  const equippedDefinitions = useMemo(() => EQUIPMENT_SLOTS.flatMap((slot) => {
    const definition = definitionsById.get(equipped[slot] ?? "");
    return definition ? [definition] : [];
  }), [definitionsById, equipped]);
  const summary = useMemo(() => calculateEquipmentSummary(equippedDefinitions), [equippedDefinitions]);
  const modifiers = getEquipmentBattleModifiers(summary);
  const activeSetIds = new Set(summary.activeSets.map((set) => set.id));
  const hasThings = equippedDefinitions.some((definition) => definition.category === "things");
  const effects = [
    modifiers.outgoingDamagePct ? `+${modifiers.outgoingDamagePct}% урону` : null,
    modifiers.incomingDamageReductionPct ? `-${modifiers.incomingDamageReductionPct}% отриманого` : null,
    modifiers.damageReflectionPct ? `${modifiers.damageReflectionPct}% назад` : null,
    modifiers.reviveHpPct ? `повстання ${modifiers.reviveHpPct}%` : null,
    modifiers.voodooHpReductionPct ? `прокляття ${modifiers.voodooHpReductionPct}%` : null,
  ].filter(Boolean);

  const entries = useMemo<RackEntry[]>(() => STARTER_EQUIPMENT_DEFINITIONS
    .filter((definition) => (
      definition.isEnabled
      && (inventoryById.get(definition.id) ?? 0) > 0
      && definition.category === category
      && (slotFilter === "all" || definition.slot === slotFilter)
      && (category === "artifacts" || elementFilter === "all" || definition.element === elementFilter)
    ))
    .sort((left, right) => CARD_RARITIES.indexOf(right.rarity) - CARD_RARITIES.indexOf(left.rarity))
    .map((definition) => ({ definition, equipped: equipped[definition.slot] === definition.id, quantity: inventoryById.get(definition.id) ?? 0 })),
  [category, elementFilter, equipped, inventoryById, slotFilter]);

  const categoryCount = (target: EquipmentCategory) => inventory.reduce((total, entry) => definitionsById.get(entry.itemId)?.category === target ? total + entry.quantity : total, 0);

  function chooseCategory(next: EquipmentCategory) {
    setCategory(next);
    setSlotFilter("all");
    setElementFilter("all");
  }

  function openSlot(slot: EquipmentSlot, definition?: EquipmentDefinition) {
    if (definition) {
      setSelectedItemId(definition.id);
      return;
    }
    setCategory((EQUIPMENT_THING_SLOTS as readonly EquipmentSlot[]).includes(slot) ? "things" : "artifacts");
    setSlotFilter(slot);
    setElementFilter("all");
    rackRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const selectedItem = selectedItemId && (inventoryById.get(selectedItemId) ?? 0) > 0 ? definitionsById.get(selectedItemId) : undefined;
  const selectedIsEquipped = selectedItem ? equipped[selectedItem.slot] === selectedItem.id : false;
  const currentInSlot = selectedItem && !selectedIsEquipped ? definitionsById.get(equipped[selectedItem.slot] ?? "") : undefined;

  async function applySelected(nextItemId: string | null) {
    if (!selectedItem || savePending) return;
    if (await onEquippedChange({ ...equipped, [selectedItem.slot]: nextItemId })) setSelectedItemId(null);
  }

  return (
    <section className="equipment-screen eq-screen" aria-labelledby="equipment-screen-title">
      <ScreenHeading eyebrow="ОБЛАДУНОК МАГА" onBack={onBack} title="СПОРЯДЖЕННЯ" titleId="equipment-screen-title" />

      <EquipmentDoll equipped={equipped} onSlot={openSlot} />

      <section aria-label="Сила спорядження" className="eq-plate eq-summary">
        <div className="eq-summary__elements">
          {EQUIPMENT_ELEMENT_ORDER.map((element) => (
            <span aria-label={`${EQUIPMENT_ELEMENT_LABELS[element]}: +${summary.elementBonuses[element]}`} key={element}><ElementSymbol element={element} size={18} /><strong>+{summary.elementBonuses[element]}</strong></span>
          ))}
        </div>
        {effects.length ? <p className="eq-summary__effects">{effects.join(" · ")}</p> : null}
        <p className={activeSetIds.has("single_rarity") ? "eq-set eq-set--active" : "eq-set"}><b>Єдиний гарт</b> 4 речі однієї рідкості: +25%</p>
        <p className={activeSetIds.has("elemental_harmony") ? "eq-set eq-set--active" : "eq-set"}><b>Коло чотирьох стихій</b> 4 різні стихії: бонус на всі карти</p>
        {!hasThings ? <p className="eq-summary__hint">Торкнись порожнього місця, щоб вибрати річ.</p> : null}
      </section>

      <button className="eq-button eq-button--leather" onClick={onOpenForge} type="button">До кузні</button>

      <section aria-label="Сховище" className="eq-storage" ref={rackRef}>
        <div className="shop-tabs" role="tablist" aria-label="Вид спорядження">
          {(["things", "artifacts"] as const).map((tab) => (
            <button aria-selected={category === tab} className={`shop-tab${category === tab ? " shop-tab--active" : ""}`} key={tab} onClick={() => chooseCategory(tab)} role="tab" type="button">
              <span>{tab === "things" ? "Речі" : "Артефакти"}{inventoryStatus === "ready" ? ` · ${categoryCount(tab)}` : ""}</span>
            </button>
          ))}
        </div>

        <div aria-label="Фільтр за місцем" className="eq-filters" role="group">
          <button aria-pressed={slotFilter === "all"} className={`eq-filter${slotFilter === "all" ? " eq-filter--active" : ""}`} onClick={() => setSlotFilter("all")} type="button"><span>Усі</span></button>
          {(category === "things" ? EQUIPMENT_THING_SLOTS : EQUIPMENT_ARTIFACT_SLOTS).map((slot) => (
            <button aria-label={EQUIPMENT_SLOT_LABELS[slot]} aria-pressed={slotFilter === slot} className={`eq-filter${slotFilter === slot ? " eq-filter--active" : ""}`} key={slot} onClick={() => setSlotFilter(slot)} title={EQUIPMENT_SLOT_LABELS[slot]} type="button"><EquipmentIcon name={slot} size={20} /></button>
          ))}
        </div>
        {category === "things" ? (
          <div aria-label="Фільтр за стихією" className="eq-filters" role="group">
            <button aria-pressed={elementFilter === "all"} className={`eq-filter${elementFilter === "all" ? " eq-filter--active" : ""}`} onClick={() => setElementFilter("all")} type="button"><span>Усі</span></button>
            {EQUIPMENT_ELEMENT_ORDER.map((element) => (
              <button aria-label={EQUIPMENT_ELEMENT_LABELS[element]} aria-pressed={elementFilter === element} className={`eq-filter${elementFilter === element ? " eq-filter--active" : ""}`} key={element} onClick={() => setElementFilter(element)} title={EQUIPMENT_ELEMENT_LABELS[element]} type="button"><ElementSymbol element={element} size={20} /></button>
            ))}
          </div>
        ) : null}

        <EquipmentRack entries={entries} onPick={(entry) => setSelectedItemId(entry.definition.id)} />
        {inventoryStatus === "loading" ? <p className="eq-note">Завантаження сховища…</p> : null}
        {inventoryStatus === "unavailable" ? <p className="eq-note">Сховище доступне після входу в гру.</p> : null}
        {inventoryStatus === "error" ? <p className="eq-note">Не вдалося завантажити сховище.</p> : null}
        {inventoryStatus === "ready" && !entries.length ? <p className="eq-note">{inventory.length ? "Таких речей у сховищі немає." : "Сховище порожнє. Спорядження можна придбати в крамниці арени."}</p> : null}
      </section>

      {selectedItem ? (
        <EquipmentItemCard busy={savePending} definition={selectedItem} eyebrow={EQUIPMENT_SLOT_LABELS[selectedItem.slot]} onClose={() => setSelectedItemId(null)}>
          {currentInSlot ? <span className="eq-card__current">Зараз: {EQUIPMENT_RARITY_CONFIG[currentInSlot.rarity].label.toLowerCase()}, {getEquipmentBonusText(currentInSlot)}</span> : null}
          {saveError ? <span className="eq-card__error" role="alert">{saveError}</span> : null}
          <button className="eq-button eq-button--leather" disabled={savePending} onClick={() => void applySelected(selectedIsEquipped ? null : selectedItem.id)} type="button">
            {savePending ? "Зберігаємо…" : selectedIsEquipped ? "Зняти" : currentInSlot ? "Замінити" : "Одягнути"}
          </button>
        </EquipmentItemCard>
      ) : null}
    </section>
  );
}
