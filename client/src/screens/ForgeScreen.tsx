import { ScreenHeading } from "../components/ScreenHeading";
import { RibbonTitle } from "../components/RibbonTitle";
import { useEffect, useMemo, useState } from "react";
import {
  EQUIPMENT_FORGE_RECIPES,
  EQUIPMENT_RARITY_CONFIG,
  getEquipmentForgeChances,
  getEquipmentForgeRecipe,
  STARTER_EQUIPMENT_DEFINITIONS,
} from "@cardastika/game-core";
import type { CardElement, CardRarity, EquipmentCategory, EquippedEquipment, PlayerEquipmentAtelierResponse, PlayerEquipmentForgeResponse, PlayerEquipmentInventory, PlayerEquipmentQuickForgeResponse } from "@cardastika/shared";
import { AtelierPanel, QuickForgePanel, useAtelierItems, useQuickForgeOptions } from "../components/ForgeModes";
import { formatUiNumber } from "../i18n";
import { CurrencyIcon } from "../components/CurrencyDisplay";
import { EquipmentItemCard, EquipmentRack, EquipmentSprite, rarityStyle, type RackEntry } from "../components/EquipmentBook";
import type { EquipmentInventoryStatus } from "../equipment/equipmentState";

const FORGE_STRIKE_MS = 1500;
const RARITY_SHORT_LABELS: Readonly<Record<CardRarity, string>> = {
  common: "Звич.",
  uncommon: "Незв.",
  rare: "Рідк.",
  epic: "Епіч.",
  legendary: "Леген.",
  mythic: "Міф.",
};

interface ForgeScreenProps {
  cardShards: number;
  equipped: EquippedEquipment;
  gold: number;
  inventory: readonly PlayerEquipmentInventory[];
  inventoryStatus: EquipmentInventoryStatus;
  onBack: () => void;
  onChangeElement: (itemId: string, element: CardElement) => Promise<PlayerEquipmentAtelierResponse>;
  onForge: (itemIds: readonly string[]) => Promise<PlayerEquipmentForgeResponse>;
  onQuickForge: (batches: readonly { itemId: string; count: number }[]) => Promise<PlayerEquipmentQuickForgeResponse>;
}

export function ForgeScreen({ cardShards, equipped, gold, inventory, inventoryStatus, onBack, onChangeElement, onForge, onQuickForge }: ForgeScreenProps) {
  const definitionsById = useMemo(() => new Map(STARTER_EQUIPMENT_DEFINITIONS.map((definition) => [definition.id, definition])), []);
  const equippedItemIds = useMemo(() => new Set(Object.values(equipped)), [equipped]);
  // An equipped copy never goes into the fire, so only spare copies count as material.
  const spareById = useMemo(() => new Map(inventory.map((entry) => [entry.itemId, entry.quantity - (equippedItemIds.has(entry.itemId) ? 1 : 0)])), [equippedItemIds, inventory]);

  // Quick forge opens with enough identical items; the atelier only for legendary and mythic owners.
  const quickForgeOptions = useQuickForgeOptions(spareById);
  const atelierItems = useAtelierItems(inventory);
  type ForgeMode = "forge" | "quick" | "atelier";
  const [requestedMode, setMode] = useState<ForgeMode>("forge");
  // An open tab stays while the player is on it, so the last results remain visible.
  const modes: readonly { id: ForgeMode; label: string }[] = [
    { id: "forge", label: "Кузня" },
    ...(quickForgeOptions.length || requestedMode === "quick" ? [{ id: "quick" as const, label: "Швидка кузня" }] : []),
    ...(atelierItems.length || requestedMode === "atelier" ? [{ id: "atelier" as const, label: "Ательє" }] : []),
  ];
  const mode = modes.some(({ id }) => id === requestedMode) ? requestedMode : "forge";
  const [rarity, setRarity] = useState<CardRarity>("common");
  const [category, setCategory] = useState<EquipmentCategory>("things");
  const [materialIds, setMaterialIds] = useState<string[]>([]);
  const [striking, setStriking] = useState(false);
  const [resultItemId, setResultItemId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recipe = getEquipmentForgeRecipe(rarity) ?? EQUIPMENT_FORGE_RECIPES[0]!;
  const canAfford = gold >= recipe.goldCost;
  const isFull = materialIds.length === recipe.inputCount;

  useEffect(() => {
    setMaterialIds([]);
    setError(null);
  }, [category, rarity]);

  const spareOfRarity = (target: CardRarity) => inventory.reduce((total, entry) => {
    const definition = definitionsById.get(entry.itemId);
    return definition?.rarity === target && definition.category === category ? total + Math.max(0, spareById.get(entry.itemId) ?? 0) : total;
  }, 0);

  // Things go into the fire only with things of the same type, so the first pick locks the slot.
  const lockedSlot = category === "things" && materialIds[0] ? definitionsById.get(materialIds[0])?.slot ?? null : null;
  const entries = useMemo<RackEntry[]>(() => inventory.flatMap((entry) => {
    const definition = definitionsById.get(entry.itemId);
    const spare = spareById.get(entry.itemId) ?? 0;
    if (!definition || spare < 1 || definition.rarity !== rarity || definition.category !== category) return [];
    if (lockedSlot && definition.slot !== lockedSlot) return [];
    return [{ definition, quantity: spare, selected: materialIds.filter((itemId) => itemId === entry.itemId).length }];
  }), [category, definitionsById, inventory, lockedSlot, materialIds, rarity, spareById]);

  const chances = useMemo(() => isFull
    ? getEquipmentForgeChances(materialIds.flatMap((itemId) => definitionsById.get(itemId) ?? []))
    : [], [definitionsById, isFull, materialIds]);

  function pickMaterial(entry: RackEntry) {
    const id = entry.definition.id;
    setMaterialIds((current) => current.length < recipe.inputCount && current.filter((itemId) => itemId === id).length < entry.quantity ? [...current, id] : current);
  }

  /** Fills free places with the most plentiful spare items, keeping what the player already chose. */
  function autofill() {
    setMaterialIds((current) => {
      const next = [...current];
      // Without a pick yet, things fill from the type with the most spare copies.
      let pool = entries;
      if (category === "things" && next.length === 0) {
        const totals = new Map<string, number>();
        for (const entry of entries) totals.set(entry.definition.slot, (totals.get(entry.definition.slot) ?? 0) + entry.quantity);
        const bestSlot = [...totals].sort((left, right) => right[1] - left[1])[0]?.[0];
        pool = entries.filter((entry) => entry.definition.slot === bestSlot);
      }
      for (const entry of [...pool].sort((left, right) => right.quantity - left.quantity)) {
        let free = entry.quantity - next.filter((itemId) => itemId === entry.definition.id).length;
        while (free > 0 && next.length < recipe.inputCount) {
          next.push(entry.definition.id);
          free -= 1;
        }
      }
      return next;
    });
  }

  async function strike() {
    if (!isFull || !canAfford || striking) return;
    setStriking(true);
    setError(null);
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    try {
      const [result] = await Promise.all([
        onForge(materialIds),
        new Promise((resolve) => setTimeout(resolve, reduceMotion ? 0 : FORGE_STRIKE_MS)),
      ]);
      setMaterialIds([]);
      setResultItemId(result.resultItemId);
    } catch (forgeError) {
      setError(forgeError instanceof Error && forgeError.message === "not_enough_gold" ? "Не вистачає золота." : "Не вдалося викувати. Спробуй ще раз.");
    } finally {
      setStriking(false);
    }
  }

  const resultDefinition = resultItemId ? definitionsById.get(resultItemId) : undefined;

  return (
    <section aria-labelledby="forge-screen-title" className="forge-screen eq-screen">
      <ScreenHeading onBack={() => onBack()} title="Кузня" titleId="forge-screen-title" />

      {modes.length > 1 ? (
        <div aria-label="Режим кузні" className="shop-tabs" role="tablist">
          {modes.map(({ id, label }) => (
            <button aria-selected={mode === id} className={`shop-tab${mode === id ? " shop-tab--active" : ""}`} key={id} onClick={() => setMode(id)} role="tab" type="button"><span>{label}</span></button>
          ))}
        </div>
      ) : null}

      {/* The forge picture is the stage: materials lie on it, right by the anvil. */}
      <div className={`eq-forge-scene${striking ? " eq-forge-scene--striking" : ""}`}>
        <span aria-hidden="true" className="eq-forge-scene__embers">{Array.from({ length: 9 }, (_, index) => <i key={index} style={{ "--i": index } as React.CSSProperties} />)}</span>
        {striking ? <>
          <span aria-hidden="true" className="eq-forge-scene__flash" />
          <span aria-hidden="true" className="eq-forge-scene__sparks">{Array.from({ length: 14 }, (_, index) => <i key={index} style={{ "--spark": index } as React.CSSProperties} />)}</span>
        </> : null}
        {mode === "forge" ? (
          <div aria-label="Матеріали" className="eq-forge-scene__materials" style={{ "--eq-columns": recipe.inputCount } as React.CSSProperties}>
            {Array.from({ length: recipe.inputCount }, (_, index) => {
              const definition = definitionsById.get(materialIds[index] ?? "");
              return (
                <button aria-label={definition ? `Прибрати: ${definition.name}` : `Порожнє місце ${index + 1}`} className="eq-material" disabled={!definition || striking} key={index} onClick={() => setMaterialIds((current) => current.filter((_, currentIndex) => currentIndex !== index))} style={definition ? rarityStyle(definition.rarity) : undefined} type="button">
                  <span className="eq-frame">{definition ? <EquipmentSprite definition={definition} /> : null}</span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      {mode === "quick" ? <QuickForgePanel gold={gold} onQuickForge={onQuickForge} options={quickForgeOptions} /> : null}
      {mode === "atelier" ? <AtelierPanel cardShards={cardShards} gold={gold} items={atelierItems} onChangeElement={onChangeElement} /> : null}

      {mode === "forge" ? <>
      <div aria-label="Рідкість матеріалів" className="eq-steps" role="tablist">
        {EQUIPMENT_FORGE_RECIPES.map((step) => (
          <button aria-selected={rarity === step.inputRarity} className={`eq-step${rarity === step.inputRarity ? " eq-step--active" : ""}${spareOfRarity(step.inputRarity) === 0 ? " eq-step--empty" : ""}`} key={step.inputRarity} onClick={() => setRarity(step.inputRarity)} role="tab" style={rarityStyle(step.inputRarity)} type="button">
            <span className="eq-frame"><b>{spareOfRarity(step.inputRarity)}</b><small>{RARITY_SHORT_LABELS[step.inputRarity]}</small></span>
          </button>
        ))}
      </div>

      <div className="eq-plate eq-recipe eq-recipe--compact">
        <strong>{recipe.inputCount} × {EQUIPMENT_RARITY_CONFIG[recipe.inputRarity].label.toLowerCase()} → 1 × {EQUIPMENT_RARITY_CONFIG[recipe.outputRarity].label.toLowerCase()}<span className="eq-recipe__price"><CurrencyIcon kind="gold" size={18} /><b>{formatUiNumber(recipe.goldCost)}</b></span></strong>
        {chances.length ? (
          <ul className="eq-chances">
            {chances.map(({ chancePct, definition }) => <li key={definition.id} style={rarityStyle(definition.rarity)}><EquipmentSprite definition={definition} /><span>{definition.name.split(" · ")[0]}</span><b>{chancePct}%</b></li>)}
          </ul>
        ) : null}
      </div>

      <div className="eq-forge-actions">
        <button className="eq-button eq-button--parchment" disabled={isFull || striking || !entries.length} onClick={autofill} type="button">Заповнити</button>
        <button className="eq-button eq-button--leather" disabled={!isFull || !canAfford || striking} onClick={() => void strike()} type="button">{striking ? "Куємо…" : "Кувати"}</button>
      </div>
      {error ? <p className="eq-note" role="alert">{error}</p> : null}
      {!error && isFull && !canAfford ? <p className="eq-note" role="status">Не вистачає золота.</p> : null}

      <section aria-labelledby="forge-storage-title" className="eq-storage">
        <RibbonTitle as="h3" id="forge-storage-title" size="small">Сховище</RibbonTitle>
        <div className="shop-tabs" role="tablist" aria-label="Вид спорядження">
          {(["things", "artifacts"] as const).map((tab) => (
            <button aria-selected={category === tab} className={`shop-tab${category === tab ? " shop-tab--active" : ""}`} key={tab} onClick={() => setCategory(tab)} role="tab" type="button"><span>{tab === "things" ? "Речі" : "Артефакти"}</span></button>
          ))}
        </div>
        <EquipmentRack entries={entries} onPick={pickMaterial} />
        {inventoryStatus === "loading" ? <p className="eq-note">Завантаження сховища…</p> : null}
        {inventoryStatus === "error" ? <p className="eq-note">Не вдалося завантажити сховище.</p> : null}
        {inventoryStatus === "ready" && !entries.length ? <p className="eq-note">Вільних речей цієї рідкості немає. Одягнені речі в кування не йдуть.</p> : null}
      </section>
      </> : null}

      {resultDefinition ? (
        <EquipmentItemCard celebrate definition={resultDefinition} eyebrow="Викувано" onClose={() => setResultItemId(null)}>
          <button className="eq-button eq-button--leather" onClick={() => setResultItemId(null)} type="button">Забрати</button>
        </EquipmentItemCard>
      ) : null}
    </section>
  );
}
