import { useMemo, useState } from "react";
import {
  EQUIPMENT_ATELIER_COSTS,
  EQUIPMENT_ELEMENT_LABELS,
  EQUIPMENT_RARITY_CONFIG,
  getEquipmentQuickForgeOptions,
  resolveEquipmentAtelierResult,
  STARTER_EQUIPMENT_DEFINITIONS,
} from "@cardastika/game-core";
import { CARD_ELEMENTS, type CardElement, type EquipmentDefinition, type PlayerEquipmentInventory } from "@cardastika/shared";
import { formatUiNumber } from "../i18n";
import { AppIcon } from "./AppIcon";
import { CurrencyIcon } from "./CurrencyDisplay";
import { ElementSymbol } from "./ElementSymbol";
import { EquipmentItemCard, EquipmentRack, EquipmentSprite, rarityStyle, type RackEntry } from "./EquipmentBook";

const DEFINITIONS_BY_ID = new Map(STARTER_EQUIPMENT_DEFINITIONS.map((definition) => [definition.id, definition]));

function shortName(definition: EquipmentDefinition) {
  return definition.name.split(" · ")[0];
}

function errorText(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  if (code === "not_enough_gold") return "Не вистачає золота.";
  if (code === "not_enough_shards") return "Не вистачає осколків.";
  return "Не вдалося. Спробуй ще раз.";
}

/** Batches the quick forge can take right now. */
export function useQuickForgeOptions(spareById: ReadonlyMap<string, number>) {
  return useMemo(() => getEquipmentQuickForgeOptions(spareById), [spareById]);
}

/** Owned legendary and mythic things, the only ones the atelier accepts. */
export function useAtelierItems(inventory: readonly PlayerEquipmentInventory[]) {
  return useMemo(() => inventory.flatMap((entry) => {
    const definition = DEFINITIONS_BY_ID.get(entry.itemId);
    return definition && definition.category === "things" && EQUIPMENT_ATELIER_COSTS[definition.rarity] && entry.quantity > 0
      ? [{ definition, quantity: entry.quantity }]
      : [];
  }), [inventory]);
}

interface QuickForgePanelProps {
  gold: number;
  onQuickForge: (batches: readonly { itemId: string; count: number }[]) => Promise<{ results: { itemId: string; count: number }[] }>;
  options: ReturnType<typeof useQuickForgeOptions>;
}

/** Identical items forged in whole batches: every result is certain. */
export function QuickForgePanel({ gold, onQuickForge, options }: QuickForgePanelProps) {
  const [skipped, setSkipped] = useState<ReadonlySet<string>>(new Set());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<{ itemId: string; count: number }[] | null>(null);
  const chosen = options.filter((option) => !skipped.has(option.itemId));
  const cost = chosen.reduce((total, option) => total + option.goldCost * option.available, 0);

  function toggle(itemId: string) {
    setSkipped((current) => {
      const next = new Set(current);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  async function forge() {
    if (!chosen.length || cost > gold || pending) return;
    setPending(true);
    setError(null);
    try {
      const response = await onQuickForge(chosen.map(({ available, itemId }) => ({ count: available, itemId })));
      setResults(response.results);
    } catch (forgeError) {
      setError(errorText(forgeError));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="eq-plate eq-recipe eq-quick-forge">
      <strong>Швидка кузня</strong>
      <span>Однакові речі переплавляються цілими наборами, тому результат завжди 100%.</span>
      {options.length ? (
        <ul className="eq-chances">
          {options.map((option) => {
            const from = DEFINITIONS_BY_ID.get(option.itemId);
            const to = DEFINITIONS_BY_ID.get(option.resultItemId);
            if (!from || !to) return null;
            const on = !skipped.has(option.itemId);
            // The whole row is one toggle, so the touch target is the full line.
            return (
              <li key={option.itemId} style={rarityStyle(to.rarity)}>
                <button aria-pressed={on} className={`eq-quick-forge__row${on ? "" : " eq-quick-forge__off"}`} onClick={() => toggle(option.itemId)} type="button">
                  <EquipmentSprite definition={to} />
                  <span className="eq-quick-forge__text"><strong>{shortName(from)}</strong><small>{option.available * option.inputCount} шт. → {option.available} × {EQUIPMENT_RARITY_CONFIG[to.rarity].label.toLowerCase()}</small></span>
                  <b>{on ? <><CurrencyIcon kind="gold" size={13} /> {formatUiNumber(option.goldCost * option.available)}</> : "Пропустити"}</b>
                </button>
              </li>
            );
          })}
        </ul>
      ) : results ? null : <span>Збери щонайменше 4 однакові речі однієї рідкості, щоб відкрити швидку кузню.</span>}
      {options.length ? <span>Разом: <CurrencyIcon kind="gold" size={15} /> <b>{formatUiNumber(cost)}</b></span> : null}
      {options.length ? (
        <button className="eq-button eq-button--leather" disabled={!chosen.length || cost > gold || pending} onClick={() => void forge()} type="button">
          {pending ? "Куємо…" : "Перекувати обране"}
        </button>
      ) : null}
      {error ? <p className="eq-note" role="alert">{error}</p> : null}
      {!error && chosen.length && cost > gold ? <p className="eq-note" role="status">Не вистачає золота.</p> : null}
      {results ? (
        <ul aria-label="Викувано" className="eq-chances" role="status">
          {results.map(({ count, itemId }) => {
            const definition = DEFINITIONS_BY_ID.get(itemId);
            return definition ? <li key={itemId} style={rarityStyle(definition.rarity)}><EquipmentSprite definition={definition} /><span>{shortName(definition)}</span><b>+{count}</b></li> : null;
          })}
        </ul>
      ) : null}
    </div>
  );
}

interface AtelierPanelProps {
  cardShards: number;
  gold: number;
  items: ReturnType<typeof useAtelierItems>;
  onChangeElement: (itemId: string, element: CardElement) => Promise<{ resultItemId: string }>;
}

/** Changes the element of a legendary or mythic thing. */
export function AtelierPanel({ cardShards, gold, items, onChangeElement }: AtelierPanelProps) {
  const [itemId, setItemId] = useState<string | null>(null);
  const [element, setElement] = useState<CardElement | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultItemId, setResultItemId] = useState<string | null>(null);
  const selected = items.find(({ definition }) => definition.id === itemId)?.definition;
  const cost = selected ? EQUIPMENT_ATELIER_COSTS[selected.rarity] : undefined;
  const canPay = cost ? gold >= cost.gold && cardShards >= cost.cardShards : false;
  const entries: RackEntry[] = items.map(({ definition, quantity }) => ({ definition, quantity, selected: definition.id === itemId ? 1 : 0 }));
  const result = resultItemId ? DEFINITIONS_BY_ID.get(resultItemId) : undefined;

  async function change() {
    if (!selected || !element || !canPay || pending) return;
    setPending(true);
    setError(null);
    try {
      const response = await onChangeElement(selected.id, element);
      setResultItemId(response.resultItemId);
      setItemId(null);
      setElement(null);
    } catch (changeError) {
      setError(errorText(changeError));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="eq-plate eq-recipe eq-atelier">
      <strong>Ательє</strong>
      <span>Тут легендарна чи міфічна річ змінює стихію. Рідкість і тип лишаються, одягнена річ лишається одягненою.</span>
      <EquipmentRack entries={entries} onPick={(entry) => { setItemId(entry.definition.id); setElement(null); }} />
      {selected ? (
        <>
          <div aria-label="Нова стихія" className="shop-tabs eq-atelier__elements" role="group">
            {CARD_ELEMENTS.filter((candidate) => candidate !== selected.element).map((candidate) => (
              <button aria-pressed={element === candidate} className={`shop-tab${element === candidate ? " shop-tab--active" : ""}`} key={candidate} onClick={() => setElement(candidate)} type="button">
                <span><ElementSymbol element={candidate} size={14} /> {EQUIPMENT_ELEMENT_LABELS[candidate]}</span>
              </button>
            ))}
          </div>
          {element ? <span>Стане: {shortName(resolveEquipmentAtelierResult(selected, element))}</span> : null}
          {cost ? (
            <span>
              Ціна: <CurrencyIcon kind="gold" size={15} /> <b>{formatUiNumber(cost.gold)}</b> · <AppIcon name="card-shards" size={15} /> <b>{formatUiNumber(cost.cardShards)}</b>
            </span>
          ) : null}
          <button className="eq-button eq-button--leather" disabled={!element || !canPay || pending} onClick={() => void change()} type="button">
            {pending ? "Перешиваємо…" : "Змінити стихію"}
          </button>
          {element && cost && gold < cost.gold ? <p className="eq-note" role="status">Не вистачає золота.</p> : null}
          {element && cost && gold >= cost.gold && cardShards < cost.cardShards ? <p className="eq-note" role="status">Не вистачає осколків.</p> : null}
        </>
      ) : <span>Обери річ зі сховища.</span>}
      {error ? <p className="eq-note" role="alert">{error}</p> : null}
      {result ? (
        <EquipmentItemCard celebrate definition={result} eyebrow="Нова стихія" onClose={() => setResultItemId(null)}>
          <button className="eq-button eq-button--leather" onClick={() => setResultItemId(null)} type="button">Забрати</button>
        </EquipmentItemCard>
      ) : null}
    </div>
  );
}
