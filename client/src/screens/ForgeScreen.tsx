import { ScreenHeading } from "../components/ScreenHeading";
import { useEffect, useMemo, useState } from "react";
import {
  EQUIPMENT_FORGE_RECIPES,
  EQUIPMENT_RARITY_CONFIG,
  getEquipmentForgeChances,
  getEquipmentForgeRecipe,
  STARTER_EQUIPMENT_DEFINITIONS,
} from "@cardastika/game-core";
import type { CardRarity, EquipmentCategory, EquippedEquipment, PlayerEquipmentForgeResponse, PlayerEquipmentInventory } from "@cardastika/shared";
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
  equipped: EquippedEquipment;
  gold: number;
  inventory: readonly PlayerEquipmentInventory[];
  inventoryStatus: EquipmentInventoryStatus;
  onBack: () => void;
  onForge: (itemIds: readonly string[]) => Promise<PlayerEquipmentForgeResponse>;
}

export function ForgeScreen({ equipped, gold, inventory, inventoryStatus, onBack, onForge }: ForgeScreenProps) {
  const definitionsById = useMemo(() => new Map(STARTER_EQUIPMENT_DEFINITIONS.map((definition) => [definition.id, definition])), []);
  const equippedItemIds = useMemo(() => new Set(Object.values(equipped)), [equipped]);
  // An equipped copy never goes into the fire, so only spare copies count as material.
  const spareById = useMemo(() => new Map(inventory.map((entry) => [entry.itemId, entry.quantity - (equippedItemIds.has(entry.itemId) ? 1 : 0)])), [equippedItemIds, inventory]);

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

  const entries = useMemo<RackEntry[]>(() => inventory.flatMap((entry) => {
    const definition = definitionsById.get(entry.itemId);
    const spare = spareById.get(entry.itemId) ?? 0;
    if (!definition || spare < 1 || definition.rarity !== rarity || definition.category !== category) return [];
    return [{ definition, quantity: spare, selected: materialIds.filter((itemId) => itemId === entry.itemId).length }];
  }), [category, definitionsById, inventory, materialIds, rarity, spareById]);

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
      for (const entry of [...entries].sort((left, right) => right.quantity - left.quantity)) {
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
      <ScreenHeading eyebrow="ПЕРЕКОВКА СПОРЯДЖЕННЯ" onBack={() => onBack()} title="КУЗНЯ" titleId="forge-screen-title" />

      <div className={`eq-forge-scene${striking ? " eq-forge-scene--striking" : ""}`}>
        <span aria-hidden="true" className="eq-forge-scene__embers">{Array.from({ length: 9 }, (_, index) => <i key={index} style={{ "--i": index } as React.CSSProperties} />)}</span>
        {striking ? <>
          <span aria-hidden="true" className="eq-forge-scene__flash" />
          <span aria-hidden="true" className="eq-forge-scene__sparks">{Array.from({ length: 14 }, (_, index) => <i key={index} style={{ "--spark": index } as React.CSSProperties} />)}</span>
        </> : null}
      </div>

      <div aria-label="Рідкість матеріалів" className="eq-steps" role="tablist">
        {EQUIPMENT_FORGE_RECIPES.map((step) => (
          <button aria-selected={rarity === step.inputRarity} className={`eq-step${rarity === step.inputRarity ? " eq-step--active" : ""}`} key={step.inputRarity} onClick={() => setRarity(step.inputRarity)} role="tab" style={rarityStyle(step.inputRarity)} type="button">
            <span className="eq-frame"><span className="eq-gem eq-gem--center" /><b>{spareOfRarity(step.inputRarity)}</b></span>
            <small>{RARITY_SHORT_LABELS[step.inputRarity]}</small>
          </button>
        ))}
      </div>

      <div className="eq-plate eq-recipe">
        <strong>{recipe.inputCount} × {EQUIPMENT_RARITY_CONFIG[recipe.inputRarity].label.toLowerCase()} → 1 {EQUIPMENT_RARITY_CONFIG[recipe.outputRarity].label.toLowerCase()}</strong>
        <span>Ціна кування: <CurrencyIcon kind="gold" size={15} /> <b>{formatUiNumber(recipe.goldCost)}</b></span>
        {chances.length ? (
          <ul className="eq-chances">
            {chances.map(({ chancePct, definition }) => <li key={definition.id} style={rarityStyle(definition.rarity)}><EquipmentSprite definition={definition} /><span>{definition.name.split(" · ")[0]}</span><b>{chancePct}%</b></li>)}
          </ul>
        ) : <span>Що більше однакових речей, то вищий шанс саме на них.</span>}
      </div>

      <div aria-label="Матеріали" className={`eq-materials eq-materials--${recipe.inputCount}`}>
        {Array.from({ length: recipe.inputCount }, (_, index) => {
          const definition = definitionsById.get(materialIds[index] ?? "");
          return (
            <button aria-label={definition ? `Прибрати: ${definition.name}` : `Порожнє місце ${index + 1}`} className="eq-material" disabled={!definition || striking} key={index} onClick={() => setMaterialIds((current) => current.filter((_, currentIndex) => currentIndex !== index))} style={definition ? rarityStyle(definition.rarity) : undefined} type="button">
              <span className="eq-frame">{definition ? <EquipmentSprite definition={definition} /> : null}</span>
            </button>
          );
        })}
      </div>

      <div className="eq-forge-actions">
        <button className="eq-button eq-button--parchment" disabled={isFull || striking || !entries.length} onClick={autofill} type="button">Заповнити</button>
        <button className="eq-button eq-button--leather" disabled={!isFull || !canAfford || striking} onClick={() => void strike()} type="button">{striking ? "Куємо…" : "Кувати"}</button>
      </div>
      {error ? <p className="eq-note" role="alert">{error}</p> : null}
      {!error && isFull && !canAfford ? <p className="eq-note" role="status">Не вистачає золота.</p> : null}

      <section aria-label="Матеріали у сховищі" className="eq-storage">
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

      {resultDefinition ? (
        <EquipmentItemCard celebrate definition={resultDefinition} eyebrow="Викувано" onClose={() => setResultItemId(null)}>
          <button className="eq-button eq-button--leather" onClick={() => setResultItemId(null)} type="button">Забрати</button>
        </EquipmentItemCard>
      ) : null}
    </section>
  );
}
