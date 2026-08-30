import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { CSSProperties } from "react";
import {
  calculateEquipmentSummary,
  EQUIPMENT_ARTIFACT_SLOTS,
  EQUIPMENT_ELEMENT_LABELS,
  EQUIPMENT_RARITY_CONFIG,
  EQUIPMENT_SLOT_LABELS,
  EQUIPMENT_THING_SLOTS,
  STARTER_EQUIPMENT_DEFINITIONS,
} from "@cardastika/game-core";
import { EQUIPMENT_SLOTS, type CardElement, type CardRarity, type EquipmentCategory, type EquipmentDefinition, type EquipmentSlot, type EquippedEquipment, type PlayerEquipmentInventory } from "@cardastika/shared";
import { AppIcon } from "../components/AppIcon";
import { EquipmentIcon } from "../components/EquipmentIcon";
import { EquipmentArt, EquipmentLoadout } from "../components/EquipmentLoadout";
import { ElementSymbol } from "../components/ElementSymbol";
import { EQUIPMENT_ELEMENT_ORDER } from "../equipment/equipmentIcons";
import { getEquipmentSpritePath } from "../equipment/equipmentAssets";
import type { EquipmentInventoryStatus } from "../equipment/equipmentState";

interface EquipmentScreenProps {
  equipped: EquippedEquipment;
  inventory: readonly PlayerEquipmentInventory[];
  inventoryStatus: EquipmentInventoryStatus;
  initialItemId?: string | null;
  onBack: () => void;
  onEquippedChange: (equipped: EquippedEquipment) => void;
  onOpenForge: () => void;
}

type FilterValue = "all" | "none";
type SlotFilter = FilterValue | EquipmentSlot;
type ElementFilter = FilterValue | CardElement;

function getEquipmentCountLabel(count: number) {
  const lastTwoDigits = count % 100;
  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) return "предметів";
  switch (count % 10) {
    case 1: return "предмет";
    case 2:
    case 3:
    case 4: return "предмети";
    default: return "предметів";
  }
}

function getRarityStyle(rarity: CardRarity): CSSProperties {
  return { "--equipment-rarity": EQUIPMENT_RARITY_CONFIG[rarity].color } as CSSProperties;
}

function getRarityStatusLabel(rarity: CardRarity) {
  return {
    common: "Звичайний",
    uncommon: "Незвичайний",
    rare: "Рідкісний",
    epic: "Епічний",
    legendary: "Легендарний",
    mythic: "Міфічний",
  }[rarity];
}

function getEquipmentDetailTitle(definition: EquipmentDefinition) {
  const slotLabel = EQUIPMENT_SLOT_LABELS[definition.slot];
  return definition.category === "things" && definition.element
    ? `${slotLabel} · ${EQUIPMENT_ELEMENT_LABELS[definition.element]}`
    : slotLabel;
}

function FilterButton({ active, element, label, onClick, slot }: { active: boolean; element?: CardElement | "all"; label: string; onClick: () => void; slot?: EquipmentSlot | "all" }) {
  return (
    <button aria-label={label} aria-pressed={active} className={`equipment-filter-button${active ? " equipment-filter-button--active" : ""}`} onClick={onClick} title={label} type="button">
      {element ? <ElementSymbol element={element} size={17} /> : slot ? <EquipmentIcon name={slot} size={17} /> : null}
      <span className="equipment-filter-button__label">{label}</span>
    </button>
  );
}

function getBonusText(definition: EquipmentDefinition) {
  switch (definition.bonusType) {
    case "element_power": return `+${definition.bonusValue} сили стихії`;
    case "outgoing_damage": return `+${definition.bonusValue}% вихідного урону`;
    case "incoming_damage_reduction": return `-${definition.bonusValue}% вхідного урону`;
    case "damage_reflection": return `Відбиває ${definition.bonusValue}% урону`;
    case "health_reduction": return `-${definition.bonusValue}% HP вбивці`;
    case "save_once": return `Відродження з ${definition.bonusValue}% HP`;
    case "passive": return `+${definition.bonusValue} до пасивного рейтингу`;
  }
}

export function EquipmentScreen({ equipped, inventory, inventoryStatus, initialItemId = null, onBack, onEquippedChange, onOpenForge }: EquipmentScreenProps) {
  const initialDefinition = initialItemId ? STARTER_EQUIPMENT_DEFINITIONS.find((definition) => definition.id === initialItemId) : undefined;
  const [category, setCategory] = useState<EquipmentCategory>(initialDefinition?.category ?? "things");
  const [elementFilter, setElementFilter] = useState<ElementFilter>("all");
  const [selectedItemId, setSelectedItemId] = useState<string | null>(initialItemId);
  const [slotFilter, setSlotFilter] = useState<SlotFilter>("all");

  const definitionsById = useMemo(() => new Map(STARTER_EQUIPMENT_DEFINITIONS.map((definition) => [definition.id, definition])), []);
  const inventoryById = useMemo(() => new Map(inventory.map((entry) => [entry.itemId, entry.quantity])), [inventory]);
  const equippedDefinitions = useMemo(() => EQUIPMENT_SLOTS.flatMap((slot) => {
    const itemId = equipped[slot];
    const definition = itemId ? definitionsById.get(itemId) : undefined;
    return definition ? [definition] : [];
  }), [definitionsById, equipped]);
  const summary = useMemo(() => calculateEquipmentSummary(equippedDefinitions), [equippedDefinitions]);
  const equippedItemIds = useMemo(() => new Set(Object.values(equipped).filter((itemId): itemId is string => itemId !== null)), [equipped]);
  const selectedItem = selectedItemId && (inventoryById.get(selectedItemId) ?? 0) > 0 ? definitionsById.get(selectedItemId) : undefined;
  const hasEquippedItems = equippedDefinitions.length > 0;
  const hasElementBonuses = equippedDefinitions.some((definition) => definition.category === "things" && definition.element !== null);
  const inventoryItemCount = inventory.reduce((total, entry) => total + Math.max(0, entry.quantity), 0);

  function inventoryCategoryCount(targetCategory: EquipmentCategory) {
    return inventory.reduce((total, entry) => {
      const definition = definitionsById.get(entry.itemId);
      return definition?.category === targetCategory ? total + Math.max(0, entry.quantity) : total;
    }, 0);
  }

  const visibleItems = useMemo(() => STARTER_EQUIPMENT_DEFINITIONS.filter((definition) => {
    const quantity = inventoryById.get(definition.id) ?? 0;
    return definition.isEnabled
      && quantity > 0
      && definition.category === category
      && (slotFilter === "all" || definition.slot === slotFilter)
      && (elementFilter === "all" || (elementFilter === "none" ? definition.element === null : definition.element === elementFilter));
  }), [category, elementFilter, inventoryById, slotFilter]);

  useEffect(() => {
    if (selectedItem && !visibleItems.some((definition) => definition.id === selectedItem.id)) setSelectedItemId(null);
  }, [selectedItem, visibleItems]);

  function selectSlot(slot: EquipmentSlot, definition?: EquipmentDefinition) {
    setCategory(EQUIPMENT_THING_SLOTS.includes(slot as typeof EQUIPMENT_THING_SLOTS[number]) ? "things" : "artifacts");
    setSelectedItemId(definition?.id ?? null);
  }

  function equipItem(definition: EquipmentDefinition) {
    if ((inventoryById.get(definition.id) ?? 0) < 1) return;
    onEquippedChange({ ...equipped, [definition.slot]: definition.id });
    setSelectedItemId(null);
  }

  function unequipItem(definition: EquipmentDefinition) {
    if (equipped[definition.slot] !== definition.id) return;
    onEquippedChange({ ...equipped, [definition.slot]: null });
    setSelectedItemId(null);
  }

  const selectedIsEquipped = selectedItem ? equipped[selectedItem.slot] === selectedItem.id : false;
  const selectedSlotHasOtherItem = selectedItem ? Boolean(equipped[selectedItem.slot] && !selectedIsEquipped) : false;
  const selectedRarity = selectedItem ? EQUIPMENT_RARITY_CONFIG[selectedItem.rarity] : null;

  return (
    <section className="equipment-screen" aria-labelledby="equipment-screen-title">
      <header className="equipment-heading equipment-heading--cardastika">
        <button aria-label="Назад" className="screen-back equipment-heading__back" onClick={onBack} type="button"><AppIcon name="chevron" size={18} /></button>
        <div><span>МІФИЧНИЙ АРСЕНАЛ</span><h1 id="equipment-screen-title">СПОРЯДЖЕННЯ</h1></div>
        <div aria-label={hasEquippedItems ? `Рейтинг спорядження ${summary.equipmentRating}` : "Спорядження не екіпіровано"} className={`equipment-rating${hasEquippedItems ? "" : " equipment-rating--empty"}`}>
          {hasEquippedItems ? <><small>Рейтинг</small><strong>{summary.equipmentRating}</strong></> : <small>Порожньо</small>}
        </div>
      </header>

      {hasEquippedItems ? (
        <section aria-label="Стан спорядження" className="equipment-summary">
          <div><span>Бонус спорядження</span><strong>+{summary.adjustedItemBonusTotal}</strong></div>
          <div><span>Артефакти</span><strong>{summary.artifactBonuses.length} активні</strong></div>
        </section>
      ) : (
        <section aria-label="Порожнє спорядження" className="equipment-empty-summary">
          <strong>Спорядження ще не екіпіровано</strong>
          <span>Отримуйте предмети в підземеллях, подіях і нагородах.</span>
        </section>
      )}

      <EquipmentLoadout equipped={equipped} onSelectSlot={selectSlot} />

      {hasElementBonuses || summary.activeSets.length > 0 ? (
        <section aria-label="Бонуси стихій" className="equipment-loadout-meta">
          {hasElementBonuses ? <div className="equipment-element-total-strip">
            {EQUIPMENT_ELEMENT_ORDER.map((element) => (
              <span className={`equipment-element-total equipment-element-total--${element}`} key={element}>
                <ElementSymbol element={element} size={16} /> <strong>+{summary.elementBonuses[element]}</strong>
              </span>
            ))}
          </div> : null}
          {summary.activeSets.length > 0 ? <div className="equipment-active-set-pill">{summary.activeSets[0]?.label}</div> : null}
        </section>
      ) : null}

      <section aria-labelledby="equipment-inventory-heading" className="equipment-inventory">
        <div className="equipment-section-heading"><div><span>СХОВИЩЕ МАНДРІВНИКА</span><h2 id="equipment-inventory-heading">ІНВЕНТАР</h2></div>{inventoryStatus === "ready" ? <span className="equipment-count">{inventoryItemCount} {getEquipmentCountLabel(inventoryItemCount)}</span> : null}</div>

        <div aria-label="Категорія спорядження" className="equipment-category-tabs" role="tablist">
          <button aria-selected={category === "things"} className={category === "things" ? "equipment-category-tab equipment-category-tab--active" : "equipment-category-tab"} onClick={() => setCategory("things")} role="tab" type="button"><span>Речі</span>{inventoryStatus === "ready" ? <small>{inventoryCategoryCount("things")}</small> : null}</button>
          <button aria-selected={category === "artifacts"} className={category === "artifacts" ? "equipment-category-tab equipment-category-tab--active" : "equipment-category-tab"} onClick={() => setCategory("artifacts")} role="tab" type="button"><span>Артефакти</span>{inventoryStatus === "ready" ? <small>{inventoryCategoryCount("artifacts")}</small> : null}</button>
        </div>

        <div aria-label="Фільтр слотів" className="equipment-filter-group" role="group">
          <FilterButton active={slotFilter === "all"} label="Усі" onClick={() => setSlotFilter("all")} slot="all" />
          {(category === "things" ? EQUIPMENT_THING_SLOTS : EQUIPMENT_ARTIFACT_SLOTS).map((slot) => (
            <FilterButton active={slotFilter === slot} key={slot} label={EQUIPMENT_SLOT_LABELS[slot]} onClick={() => setSlotFilter(slot)} slot={slot} />
          ))}
        </div>
        <div aria-label="Фільтр стихій" className="equipment-filter-group equipment-filter-group--elements" role="group">
          <FilterButton active={elementFilter === "all"} element="all" label="Усі стихії" onClick={() => setElementFilter("all")} />
          {EQUIPMENT_ELEMENT_ORDER.map((element) => <FilterButton active={elementFilter === element} element={element} key={element} label={EQUIPMENT_ELEMENT_LABELS[element]} onClick={() => setElementFilter(element)} />)}
        </div>

        <div className="equipment-items-grid">
          {visibleItems.map((definition) => {
            const isSelected = definition.id === selectedItemId;
            const isEquipped = equippedItemIds.has(definition.id);
            const quantity = inventoryById.get(definition.id) ?? 0;
            return (
              <button aria-label={`${definition.name}, ${EQUIPMENT_RARITY_CONFIG[definition.rarity].label}, кількість ${quantity}`} aria-pressed={isSelected} className={`equipment-item-card${isSelected ? " equipment-item-card--selected" : ""}${isEquipped ? " equipment-item-card--equipped" : ""}`} key={definition.id} onClick={() => { setCategory(definition.category); setSelectedItemId(definition.id); }} style={getRarityStyle(definition.rarity)} type="button">
                <EquipmentArt definition={definition} showElement={false} showFallbackIcon={false} slot={definition.slot} />
                <span aria-hidden="true" className="equipment-item-card__quantity">x{quantity}</span>
              </button>
            );
          })}
        </div>
        {inventoryStatus === "loading" ? <p className="equipment-empty">Завантаження інвентарю…</p> : null}
        {inventoryStatus === "unavailable" ? <p className="equipment-empty">Інвентар доступний після запуску через Telegram.</p> : null}
        {inventoryStatus === "error" ? <p className="equipment-empty">Не вдалося завантажити інвентар.</p> : null}
        {inventoryStatus === "ready" && !visibleItems.length ? <p className={`equipment-empty${inventoryItemCount === 0 ? " equipment-empty--no-items" : ""}`}>{inventoryItemCount > 0 ? "За цими фільтрами предметів не знайдено." : <><span className="equipment-empty__icon"><EquipmentIcon name="equipment" size={18} /></span><strong>Спорядження ще не знайдено</strong><span>Отримуйте предмети в підземеллях і нагородах.</span></>}</p> : null}
        <button className="equipment-forge-button" onClick={onOpenForge} type="button"><EquipmentIcon name="forge" size={18} /><span>Кузня</span><small>Перекувати спорядження</small></button>
      </section>

      {selectedItem && typeof document !== "undefined" ? createPortal(
        <div className="equipment-sheet-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setSelectedItemId(null); }}>
          <section aria-labelledby="equipment-item-detail-heading" aria-modal="true" className="equipment-item-sheet" role="dialog">
            <button aria-label="Закрити" className="equipment-sheet-close" onClick={() => setSelectedItemId(null)} type="button"><AppIcon name="close" size={17} /></button>
            <div className="equipment-item-detail__preview" style={getRarityStyle(selectedItem.rarity)}><img alt="" className="equipment-item-detail__raw-sprite" src={getEquipmentSpritePath(selectedItem)} /></div>
            <div className="equipment-item-detail__content">
              <div className="equipment-item-detail__eyebrow"><span className="equipment-item-detail__element">{selectedItem.element ? <><ElementSymbol element={selectedItem.element} size={14} /> {EQUIPMENT_ELEMENT_LABELS[selectedItem.element]}</> : "Без стихії"}</span><b className="equipment-item-detail__rarity" style={{ color: selectedRarity?.color }}>{getRarityStatusLabel(selectedItem.rarity)}</b></div>
              <h2 id="equipment-item-detail-heading">{getEquipmentDetailTitle(selectedItem)}</h2>
              <p className="equipment-item-detail__bonus">{getBonusText(selectedItem)}</p>
              <p>{selectedItem.description}</p>
              <blockquote>{selectedItem.flavorText}</blockquote>
              <div className={`equipment-item-detail__actions${selectedIsEquipped ? " equipment-item-detail__actions--equipped" : ""}`}>
                {selectedIsEquipped ? <><span className="equipment-equipped-status">Одягнено</span><button className="equipment-action equipment-action--primary" onClick={() => unequipItem(selectedItem)} type="button">Зняти</button></> : <button className="equipment-action equipment-action--primary" onClick={() => equipItem(selectedItem)} type="button">{selectedSlotHasOtherItem ? "Замінити" : "Одягнути"}</button>}
              </div>
            </div>
          </section>
        </div>,
        document.body,
      ) : null}
    </section>
  );
}
