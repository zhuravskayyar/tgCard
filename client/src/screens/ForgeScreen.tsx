import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  CARD_ELEMENTS,
  CARD_RARITIES,
  type CardElement,
  type CardRarity,
  type EquipmentCategory,
  type EquippedEquipment,
  type EquipmentSlot,
  type PlayerEquipmentInventory,
} from "@cardastika/shared";
import {
  EQUIPMENT_ELEMENT_LABELS,
  EQUIPMENT_ARTIFACT_SLOTS,
  EQUIPMENT_FORGE_RECIPES,
  EQUIPMENT_RARITY_CONFIG,
  EQUIPMENT_SLOT_LABELS,
  EQUIPMENT_THING_SLOTS,
  STARTER_EQUIPMENT_DEFINITIONS,
  getEquipmentForgeRecipe,
  resolveEquipmentForgeResult,
} from "@cardastika/game-core";
import { AppIcon } from "../components/AppIcon";
import { CurrencyIcon } from "../components/CurrencyDisplay";
import { EquipmentArt } from "../components/EquipmentLoadout";
import { EquipmentIcon } from "../components/EquipmentIcon";
import type { EquipmentInventoryStatus } from "../equipment/equipmentState";
import { ElementSymbol } from "../components/ElementSymbol";

interface ForgeScreenProps {
  equipped: EquippedEquipment;
  inventory: readonly PlayerEquipmentInventory[];
  inventoryStatus: EquipmentInventoryStatus;
  onBack: () => void;
}

type ElementFilter = CardElement | "all";

const FORGE_ASSET_PATH = "/assets/ui/world-tree/forge-anvil-furnace.png";
const RARITY_SHORT_LABELS: Readonly<Record<CardRarity, string>> = {
  common: "Звич.",
  uncommon: "Незвич.",
  rare: "Рідк.",
  epic: "Епіч.",
  legendary: "Легенд.",
  mythic: "Міфіч.",
};

function formatNumber(value: number) {
  return value.toLocaleString("uk-UA");
}

function rarityStyle(rarity: CardRarity) {
  return { "--forge-rarity-color": EQUIPMENT_RARITY_CONFIG[rarity].color } as CSSProperties;
}

function ForgeFilterButton({ active, element, label, onClick, slot }: { active: boolean; element?: CardElement | "all"; label: string; onClick: () => void; slot?: EquipmentSlot | "all" }) {
  return (
    <button aria-label={label} aria-pressed={active} className={`equipment-filter-button${active ? " equipment-filter-button--active" : ""}`} onClick={onClick} title={label} type="button">
      {element ? <ElementSymbol element={element} size={17} /> : slot ? <EquipmentIcon name={slot} size={17} /> : null}
      <span className="equipment-filter-button__label">{label}</span>
    </button>
  );
}

function getSelectedQuantity(selectedMaterialIds: readonly string[], itemId: string) {
  return selectedMaterialIds.reduce((total, selectedItemId) => total + (selectedItemId === itemId ? 1 : 0), 0);
}

export function ForgeScreen({ equipped, inventory, inventoryStatus, onBack }: ForgeScreenProps) {
  const definitionsById = useMemo(
    () => new Map(STARTER_EQUIPMENT_DEFINITIONS.map((definition) => [definition.id, definition])),
    [],
  );
  const inventoryQuantityById = useMemo(() => {
    const quantities = new Map<string, number>();
    for (const entry of inventory) {
      quantities.set(entry.itemId, (quantities.get(entry.itemId) ?? 0) + Math.max(0, entry.quantity));
    }
    return quantities;
  }, [inventory]);
  const equippedItemIds = useMemo(
    () => new Set(Object.values(equipped).filter((itemId): itemId is string => itemId !== null)),
    [equipped],
  );

  const [selectedInputRarity, setSelectedInputRarity] = useState<CardRarity>("rare");
  const [category, setCategory] = useState<EquipmentCategory>("things");
  const [slot, setSlot] = useState<EquipmentSlot | "all">("all");
  const [element, setElement] = useState<ElementFilter>("all");
  const [selectedMaterialIds, setSelectedMaterialIds] = useState<string[]>([]);
  const activeRecipe = getEquipmentForgeRecipe(selectedInputRarity) ?? EQUIPMENT_FORGE_RECIPES[0]!;
  const inputRarityLabel = EQUIPMENT_RARITY_CONFIG[activeRecipe.inputRarity].label;
  const outputRarityLabel = EQUIPMENT_RARITY_CONFIG[activeRecipe.outputRarity].label;

  useEffect(() => {
    setSelectedMaterialIds([]);
  }, [selectedInputRarity, category, slot, element]);

  useEffect(() => {
    setSlot("all");
  }, [category]);

  const inventoryItemCount = inventory.reduce((total, entry) => total + Math.max(0, entry.quantity), 0);
  const inventoryCategoryCount = (inventoryCategory: EquipmentCategory) => inventory.reduce((total, entry) => {
    return definitionsById.get(entry.itemId)?.category === inventoryCategory ? total + Math.max(0, entry.quantity) : total;
  }, 0);

  const visibleInventory = useMemo(() => inventory
    .map((entry) => ({
      definition: definitionsById.get(entry.itemId),
      quantity: Math.max(0, entry.quantity),
    }))
    .filter(({ definition, quantity }) => Boolean(
      definition
      && quantity > 0
      && definition.isEnabled
      && definition.category === category
      && (slot === "all" || definition.slot === slot)
      && (element === "all" || definition.element === element),
    ))
    .sort((left, right) => (left.definition?.slot ?? "").localeCompare(right.definition?.slot ?? "")),
  [activeRecipe.inputRarity, category, definitionsById, element, inventory, slot]);

  const selectedDefinitions = useMemo(
    () => selectedMaterialIds.flatMap((itemId) => {
      const definition = definitionsById.get(itemId);
      return definition ? [definition] : [];
    }),
    [definitionsById, selectedMaterialIds],
  );
  const previewResult = useMemo(() => {
    if (selectedDefinitions.length !== activeRecipe.inputCount) return null;
    try {
      return resolveEquipmentForgeResult(selectedDefinitions, () => 0);
    } catch {
      return null;
    }
  }, [activeRecipe.inputCount, selectedDefinitions]);
  const selectedCount = selectedMaterialIds.length;
  const progressPercent = Math.min(100, Math.round((selectedCount / activeRecipe.inputCount) * 100));
  const isReady = selectedCount === activeRecipe.inputCount && previewResult !== null;

  function addMaterial(itemId: string) {
    const definition = definitionsById.get(itemId);
    const availableQuantity = inventoryQuantityById.get(itemId) ?? 0;
    if (!definition || definition.category !== category || definition.rarity !== activeRecipe.inputRarity) return;
    setSelectedMaterialIds((current) => {
      if (current.length >= activeRecipe.inputCount || getSelectedQuantity(current, itemId) >= availableQuantity) return current;
      return [...current, itemId];
    });
  }

  function removeMaterial(index: number) {
    setSelectedMaterialIds((current) => current.filter((_, currentIndex) => currentIndex !== index));
  }

  return (
    <section aria-labelledby="forge-screen-title" className="forge-screen forge-screen--cardastika">
      <header className="equipment-heading equipment-heading--cardastika">
        <button aria-label="Назад" className="screen-back equipment-heading__back" onClick={onBack} type="button"><AppIcon name="chevron" size={18} /></button>
        <div><span>МАЙСТЕРНЯ СПОРЯДЖЕННЯ</span><h1 id="forge-screen-title">КУЗНЯ</h1></div>
      </header>

      <section aria-labelledby="forge-recipe-title" className="forge-workshop">
        <div className="forge-workshop__heading">
          <div className="equipment-section-heading">
            <div><span>ПЕРЕКОВУВАННЯ</span><h2 id="forge-recipe-title">Обери ступінь</h2></div>
            <span className="equipment-section-heading__rule" />
          </div>
          <p>Перетворюй зайве спорядження на сильніші речі.</p>
        </div>

        <div aria-label="Ступінь рідкості" className="forge-rarity-scale" role="tablist">
          {CARD_RARITIES.map((rarity) => {
            const recipe = EQUIPMENT_FORGE_RECIPES.find((candidate) => candidate.inputRarity === rarity);
            const isActive = rarity === activeRecipe.inputRarity;
            return (
              <button
                aria-selected={isActive}
                className={`forge-rarity-step${isActive ? " forge-rarity-step--active" : ""}${recipe ? "" : " forge-rarity-step--locked"}`}
                disabled={!recipe}
                key={rarity}
                onClick={() => recipe && setSelectedInputRarity(rarity)}
                role="tab"
                style={rarityStyle(rarity)}
                title={recipe ? `${EQUIPMENT_RARITY_CONFIG[rarity].label}: ${recipe.inputCount} предметів` : "Міфічне спорядження вже не перековується"}
                type="button"
              >
                <span className="forge-rarity-step__connector" />
                <span className="forge-rarity-step__dot" />
                <span>{RARITY_SHORT_LABELS[rarity]}</span>
                <small>{recipe?.inputCount ?? "—"}</small>
              </button>
            );
          })}
        </div>

        <div className="forge-active-recipe">
          <div>
            <span>АКТИВНИЙ РЕЦЕПТ</span>
            <strong>{activeRecipe.inputCount} × {inputRarityLabel} <b>+</b> {formatNumber(activeRecipe.goldCost)} золота <b>→</b> {outputRarityLabel}</strong>
          </div>
          <span className="forge-active-recipe__rarity" style={rarityStyle(activeRecipe.outputRarity)}>{RARITY_SHORT_LABELS[activeRecipe.outputRarity]}</span>
        </div>

        <div className={`forge-stage${isReady ? " forge-stage--ready" : ""}`}>
          <div className="forge-stage__materials">
            <div className="forge-stage__eyebrow"><span>МАТЕРІАЛИ</span><small>{inputRarityLabel}</small></div>
            <div className={`forge-material-slots forge-material-slots--${activeRecipe.inputCount}`}>
              {Array.from({ length: activeRecipe.inputCount }, (_, index) => {
                const itemId = selectedMaterialIds[index];
                const definition = itemId ? definitionsById.get(itemId) : undefined;
                return (
                  <button
                    aria-label={definition ? `${definition.name}, прибрати зі слота` : `Порожній слот ${index + 1}`}
                    className={`forge-material-slot${definition ? " forge-material-slot--filled" : ""}`}
                    disabled={!definition}
                    key={`${index}-${itemId ?? "empty"}`}
                    onClick={() => removeMaterial(index)}
                    style={definition ? rarityStyle(definition.rarity) : undefined}
                    type="button"
                  >
                    {definition ? <EquipmentArt className="forge-material-slot__art" definition={definition} slot={definition.slot} /> : <span className="forge-material-slot__empty">+</span>}
                    {definition ? <small>{index + 1}</small> : null}
                  </button>
                );
              })}
            </div>
          </div>

          <div aria-hidden="true" className="forge-stage__anvil">
            <span className="forge-stage__heat" />
            <span className="forge-stage__spark forge-stage__spark--one" />
            <span className="forge-stage__spark forge-stage__spark--two" />
            <span className="forge-stage__spark forge-stage__spark--three" />
            <img alt="" className="forge-stage__asset" src={FORGE_ASSET_PATH} />
            <span className="forge-stage__anvil-label">{isReady ? "ГОТОВО ДО УДАРУ" : "ДОДАЙ МАТЕРІАЛИ"}</span>
          </div>

          <div className={`forge-stage__result${previewResult ? " forge-stage__result--filled" : ""}`}>
            <span className="forge-stage__eyebrow"><span>РЕЗУЛЬТАТ</span><small>{outputRarityLabel}</small></span>
            <div className="forge-result__slot">
              {previewResult ? <EquipmentArt className="forge-result__art" definition={previewResult} slot={previewResult.slot} /> : <><EquipmentIcon name="forge" size={25} /><small>Очікує матеріали</small></>}
            </div>
            <strong>{previewResult?.name ?? `Нова річ · ${outputRarityLabel}`}</strong>
            {previewResult ? <small className="forge-stage__result-note">Попередній вигляд результату</small> : null}
          </div>
        </div>

        <div className="forge-progress">
          <div className="forge-progress__copy"><span>ПІДГОТОВКА</span><strong>{selectedCount} / {activeRecipe.inputCount} предметів</strong></div>
          <div aria-label={`Підготовлено ${progressPercent}%`} aria-valuemax={100} aria-valuemin={0} aria-valuenow={progressPercent} className="forge-progress__track" role="progressbar"><span style={{ width: `${progressPercent}%` }} /></div>
          <div className="forge-progress__cost"><CurrencyIcon kind="gold" size={16} /><strong>{formatNumber(activeRecipe.goldCost)}</strong><span>золота</span></div>
        </div>
        <button aria-label={`Перекувати за ${formatNumber(activeRecipe.goldCost)} золота`} className="forge-action" disabled={!isReady} type="button"><EquipmentIcon name="forge" size={17} /><span>ПЕРЕКУВАТИ</span><small>{isReady ? "Умови виконано" : `Потрібно ще ${Math.max(0, activeRecipe.inputCount - selectedCount)}`}</small></button>
      </section>

      <section aria-label="Інвентар кузні" className="forge-inventory">
        <div className="equipment-section-heading">
          <div><span>СКЛАД КУЗНІ</span><h2>Ваше спорядження</h2></div>
          <span className="equipment-section-heading__rule" />
        </div>
        <div className="equipment-category-tabs" role="tablist">
          {(["things", "artifacts"] as const).map((inventoryCategory) => (
            <button aria-selected={category === inventoryCategory} className={`equipment-category-tab${category === inventoryCategory ? " equipment-category-tab--active" : ""}`} key={inventoryCategory} onClick={() => setCategory(inventoryCategory)} role="tab" type="button">
              {inventoryCategory === "things" ? "Речі" : "Артефакти"} <small>{inventoryStatus === "ready" ? inventoryCategoryCount(inventoryCategory) : "—"}</small>
            </button>
          ))}
        </div>
        <div aria-label="Фільтр слотів" className="equipment-filter-group" role="group">
          <ForgeFilterButton active={slot === "all"} label="Усі" onClick={() => setSlot("all")} slot="all" />
          {(category === "things" ? EQUIPMENT_THING_SLOTS : EQUIPMENT_ARTIFACT_SLOTS).map((equipmentSlot) => (
            <ForgeFilterButton active={slot === equipmentSlot} key={equipmentSlot} label={EQUIPMENT_SLOT_LABELS[equipmentSlot]} onClick={() => setSlot(equipmentSlot)} slot={equipmentSlot} />
          ))}
        </div>
        <div aria-label="Фільтр стихій" className="equipment-filter-group equipment-filter-group--elements" role="group">
          <ForgeFilterButton active={element === "all"} element="all" label="Усі стихії" onClick={() => setElement("all")} />
          {CARD_ELEMENTS.map((cardElement) => <ForgeFilterButton active={element === cardElement} element={cardElement} key={cardElement} label={EQUIPMENT_ELEMENT_LABELS[cardElement]} onClick={() => setElement(cardElement)} />)}
        </div>

        {inventoryStatus === "ready" && visibleInventory.length > 0 ? (
          <div className="forge-inventory__grid">
            {visibleInventory.map(({ definition, quantity }) => {
              if (!definition) return null;
              const selectedQuantity = getSelectedQuantity(selectedMaterialIds, definition.id);
              const canUseAsMaterial = definition.rarity === activeRecipe.inputRarity;
              const isEquipped = equippedItemIds.has(definition.id);
              return (
                <button
                  aria-label={`${definition.name}, ${EQUIPMENT_RARITY_CONFIG[definition.rarity].label}, ${quantity} шт.${canUseAsMaterial ? " Додати до матеріалів" : ` Потрібен рецепт для ${EQUIPMENT_RARITY_CONFIG[definition.rarity].label}`}`}
                  aria-pressed={selectedQuantity > 0}
                  className={`equipment-item-card${isEquipped ? " equipment-item-card--equipped" : ""}${!canUseAsMaterial ? " equipment-item-card--forge-unavailable" : ""}`}
                  disabled={!canUseAsMaterial || selectedQuantity >= quantity}
                  key={definition.id}
                  onClick={() => addMaterial(definition.id)}
                  style={rarityStyle(definition.rarity)}
                  type="button"
                >
                  <EquipmentArt definition={definition} showElement={false} showFallbackIcon={false} slot={definition.slot} />
                  <span aria-hidden="true" className="equipment-item-card__quantity">x{quantity}</span>
                  {selectedQuantity > 0 ? <span className="forge-inventory__item-selected">{selectedQuantity}</span> : null}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="forge-inventory__empty">{inventoryStatus === "loading" ? "Завантаження інвентарю…" : inventoryStatus === "error" ? "Не вдалося завантажити інвентар." : inventoryStatus === "unavailable" ? "Інвентар доступний після запуску через Telegram." : inventoryItemCount > 0 ? "За цими фільтрами предметів не знайдено." : "У вас ще немає спорядження."}</p>
        )}
        {inventoryStatus === "ready" && visibleInventory.length > 0 ? <p className="forge-inventory__hint">Натисни на предмет потрібної рідкості, щоб додати його в слот. Натисни на слот, щоб прибрати.</p> : null}
      </section>

      <button className="forge-back-button" onClick={onBack} type="button"><EquipmentIcon name="equipment" size={17} /> Спорядження</button>
    </section>
  );
}
