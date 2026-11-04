import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { EQUIPMENT_RARITY_CONFIG, STARTER_EQUIPMENT_DEFINITIONS } from "@cardastika/game-core";
import type { EquipmentChestOffer, PlayerEquipmentInventory } from "@cardastika/shared";
import { getApiEndpoint } from "../api/config";
import { getPlayerAuthHeader, getTelegramInitData } from "../telegram";
import { formatUiNumber } from "../i18n";
import { CurrencyIcon } from "./CurrencyDisplay";
import { EquipmentItemCard, EquipmentSparks, rarityStyle } from "./EquipmentBook";
import { openEquipmentChest } from "../telegram/equipment";

const CHEST_SHAKE_MS = 800;
const CHEST_BURST_MS = 750;
const CHEST_SPRITES = ["chest-locked-v1", "chest-ready-v1", "chest-final-v1"];

interface EquipmentChestSectionProps {
  onInventoryChange: (inventory: PlayerEquipmentInventory[]) => void;
  onSilverChange: (silver: number) => void;
  silver: number;
}

export function EquipmentChestSection({ onInventoryChange, onSilverChange, silver }: EquipmentChestSectionProps) {
  const [offers, setOffers] = useState<EquipmentChestOffer[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [stage, setStage] = useState<{ burst: boolean; offer: EquipmentChestOffer; spriteIndex: number } | null>(null);
  const [lastOffer, setLastOffer] = useState<EquipmentChestOffer | null>(null);
  const [resultItemId, setResultItemId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const credential = getTelegramInitData();
    if (!credential) {
      setLoadFailed(true);
      return;
    }
    const controller = new AbortController();
    fetch(getApiEndpoint("/api/shop/equipment-chests"), { headers: { Authorization: getPlayerAuthHeader(credential) }, cache: "no-store", signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("chests_failed");
        return response.json() as Promise<{ offers: EquipmentChestOffer[] }>;
      })
      .then((body) => setOffers(body.offers))
      .catch((loadError: unknown) => {
        if (!(loadError instanceof DOMException && loadError.name === "AbortError")) setLoadFailed(true);
      });
    return () => controller.abort();
  }, []);

  async function open(offer: EquipmentChestOffer) {
    const credential = getTelegramInitData();
    if (!credential || openingId) return;
    const spriteIndex = Math.max(0, offers?.findIndex(({ id }) => id === offer.id) ?? 0);
    setOpeningId(offer.id);
    setStage({ burst: false, offer, spriteIndex });
    setResultItemId(null);
    setError(null);
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    try {
      const [result] = await Promise.all([
        openEquipmentChest(credential, offer.id),
        new Promise((resolve) => setTimeout(resolve, reduceMotion ? 0 : CHEST_SHAKE_MS)),
      ]);
      if (!reduceMotion) {
        setStage({ burst: true, offer, spriteIndex });
        await new Promise((resolve) => setTimeout(resolve, CHEST_BURST_MS));
      }
      onInventoryChange(result.inventory);
      onSilverChange(result.silver);
      setLastOffer(offer);
      setResultItemId(result.resultItemId);
    } catch (openError) {
      setError(openError instanceof Error && openError.message === "not_enough_silver" ? "Не вистачає срібла." : "Не вдалося відкрити скриню.");
    } finally {
      setOpeningId(null);
      setStage(null);
    }
  }

  const result = resultItemId ? STARTER_EQUIPMENT_DEFINITIONS.find(({ id }) => id === resultItemId) : undefined;

  return (
    <section aria-label="Скрині спорядження" className="card-workshop">
      {!offers && !loadFailed ? <p className="eq-note">Відчиняємо комору…</p> : null}
      {loadFailed ? <p className="eq-note">Не вдалося завантажити скрині.</p> : null}
      {error ? <p className="eq-note" role="alert">{error}</p> : null}
      <div className="workshop-list">
        {offers?.map((offer, index) => {
          const canAfford = silver >= offer.price;
          return (
            <article className={`workshop-card${canAfford ? " workshop-card--available" : ""}`} key={offer.id}>
              <div className="workshop-card__shelf">
                <div className="workshop-card__art eq-chest" style={rarityStyle(offer.rarity)}><img alt="" src={`/assets/ui/battle-pass-map/${CHEST_SPRITES[index] ?? CHEST_SPRITES[0]}.webp`} />{canAfford ? <span aria-hidden="true" className="eq-chest__motes">{Array.from({ length: 5 }, (_, mote) => <i key={mote} style={{ "--i": mote } as React.CSSProperties} />)}</span> : null}</div>
                <div className="workshop-card__copy">
                  <div className="workshop-card__title-row"><strong>{offer.name}</strong></div>
                  <span className="workshop-card__meta">{EQUIPMENT_RARITY_CONFIG[offer.rarity].label} річ або артефакт</span>
                </div>
              </div>
              <div className="workshop-card__purchase">
                <button aria-label={`Відкрити ${offer.name} за ${offer.price} срібла`} className="workshop-card__craft" disabled={!canAfford || openingId !== null} onClick={() => void open(offer)} type="button">
                  {openingId === offer.id ? "Відкриваємо…" : <><span>{canAfford ? "Відкрити за" : "Потрібно"}</span><CurrencyIcon kind="silver" size={18} /><strong>{formatUiNumber(offer.price)}</strong></>}
                </button>
              </div>
            </article>
          );
        })}
      </div>
      {stage ? createPortal(
        <div aria-hidden="true" className={`eq-chest-stage${stage.burst ? " eq-chest-stage--burst" : ""}`} style={rarityStyle(stage.offer.rarity)}>
          <span className="eq-chest-stage__rays" />
          <div className="eq-chest-stage__chest">
            <img alt="" src={`/assets/ui/battle-pass-map/${stage.burst ? "chest-open-v1" : CHEST_SPRITES[stage.spriteIndex] ?? CHEST_SPRITES[0]}.webp`} />
            {stage.burst ? <EquipmentSparks count={28} /> : null}
          </div>
        </div>,
        document.body,
      ) : null}
      {result ? (
        <EquipmentItemCard celebrate definition={result} eyebrow="Зі скрині" onClose={() => setResultItemId(null)}>
          <button className="eq-button eq-button--leather" onClick={() => setResultItemId(null)} type="button">Забрати</button>
          {lastOffer && silver >= lastOffer.price ? <button className="eq-button eq-button--parchment" onClick={() => void open(lastOffer)} type="button">Ще одну</button> : null}
        </EquipmentItemCard>
      ) : null}
    </section>
  );
}
