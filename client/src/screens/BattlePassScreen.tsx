import { ScreenHeading } from "../components/ScreenHeading";
import { useEffect, useRef, useState } from "react";
import type { PlayerCardInstance } from "@cardastika/shared";
import { ConfirmationDialog } from "../components/ConfirmationDialog";
import { BattlePassApiError } from "../telegram/battlePass";
import { STARTER_EQUIPMENT_DEFINITIONS } from "@cardastika/game-core";
import { CardFxWrapper } from "../components/CardFxWrapper";
import { EquipmentItemCard } from "../components/EquipmentBook";
import { CardHud } from "../components/CardHud";
import { CurrencyIcon } from "../components/CurrencyDisplay";
import { Lariska } from "../components/Lariska";
import { useBattlePass } from "../hooks/useBattlePass";
import { playSound } from "../audio";
import { OwnedItems, RewardCatalog, RewardTrack } from "./battlePass/RewardTrack";

const DIAMOND_ASSET = "/assets/ui/icons/icon-diamond-v1.webp";
const WALK_DELAY_MS = 500;
const WALK_MS = 1_500;

function formatRemaining(endsAt: string, now: number) {
  const remaining = Math.max(0, new Date(endsAt).getTime() - now);
  const days = Math.floor(remaining / 86_400_000);
  const hours = Math.floor(remaining % 86_400_000 / 3_600_000);
  return `${days} д ${hours} год`;
}

/** Counts diamonds up from the last shown value, so the pin walks the trail on the map. */
function useWalkingDiamonds(diamonds: number) {
  const [shown, setShown] = useState(0);
  const shownRef = useRef(0);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      shownRef.current = diamonds;
      setShown(diamonds);
      return undefined;
    }
    const from = shownRef.current;
    let frame = 0;
    let startedAt = 0;
    const tick = (now: number) => {
      startedAt ||= now;
      const progress = Math.min(1, Math.max(0, (now - startedAt - WALK_DELAY_MS) / WALK_MS));
      const value = from + (diamonds - from) * (1 - (1 - progress) ** 3);
      shownRef.current = value;
      setShown(value);
      if (progress < 1) frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [diamonds]);
  return shown;
}

function CardRewardReveal({ card, onClose }: { card: PlayerCardInstance; onClose: () => void }) {
  return (
    <div className="treasure-card-reveal" role="dialog" aria-modal="true" aria-labelledby="treasure-card-title">
      <button aria-label="Закрити" className="treasure-card-reveal__backdrop" onClick={onClose} type="button" />
      <section className="treasure-card-reveal__letter">
        <h2 id="treasure-card-title">Скарб знайдено!</h2>
        <div className={`campaign-boss-reward-card deck-card--${card.element} deck-card--${card.rarity}`}>
          <CardFxWrapper artKey={card.artKey} cardId={card.cardId} element={card.element} rarity={card.rarity}>
            <CardHud element={card.element} level={card.level} power={card.finalPower} rarity={card.rarity} showLevel />
          </CardFxWrapper>
          {card.vip ? <img alt="VIP" className="reward-track__card-crest" src="/assets/ui/battle-pass/bp-vip-crest-v1.webp" /> : null}
        </div>
        <strong>{card.displayName ?? card.code}</strong>
        <small>Рівень {card.level}. Карта додана до колекції.</small>
        <button className="treasure-card-reveal__close" onClick={onClose} type="button">Забрати</button>
      </section>
    </div>
  );
}

export function BattlePassScreen({ onBack, onEquipmentGranted, onPlayerSummaryChange }: { onBack: () => void; onEquipmentGranted: () => void; onPlayerSummaryChange: (balance: { gold: number; silver: number }) => void }) {
  const { claimMilestone, purchaseVip, retry, state } = useBattlePass();
  const [claimedItemId, setClaimedItemId] = useState<string | null>(null);
  const claimedItem = claimedItemId ? STARTER_EQUIPMENT_DEFINITIONS.find(({ id }) => id === claimedItemId) : undefined;
  const walkingDiamonds = useWalkingDiamonds(state.status === "ready" ? state.data.battlePass.diamonds : 0);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [claimedCard, setClaimedCard] = useState<PlayerCardInstance | null>(null);
  const [vipConfirmationOpen, setVipConfirmationOpen] = useState(false);
  /** The item description page: undefined while the track is shown, null for the whole list, else the tapped entry. */
  const [infoFocus, setInfoFocus] = useState<string | null | undefined>(undefined);
  const [itemsOpen, setItemsOpen] = useState(false);
  const [vipPurchasePending, setVipPurchasePending] = useState(false);
  const [vipPurchaseError, setVipPurchaseError] = useState<string | null>(null);
  const vipPurchaseButtonRef = useRef<HTMLButtonElement>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  async function handleMilestoneClaim(id: string) {
    setPendingId(id);
    setFeedback(null);
    try {
      const response = await claimMilestone(id);
      playSound("reward-claim");
      if (response.updatedBalance) onPlayerSummaryChange(response.updatedBalance);
      if (response.card) window.setTimeout(() => setClaimedCard(response.card!), 700);
      if (response.equipmentItemId) {
        onEquipmentGranted();
        window.setTimeout(() => setClaimedItemId(response.equipmentItemId!), 700);
      }
      setFeedback(`Нагороду отримано: ${response.reward.label}`);
    } catch {
      setFeedback("Нагороду ще не можна забрати");
    } finally {
      setPendingId(null);
    }
  }

  async function handleVipPurchase() {
    setVipPurchasePending(true);
    setVipPurchaseError(null);
    try {
      const response = await purchaseVip();
      onPlayerSummaryChange(response.updatedBalance);
      setVipConfirmationOpen(false);
      setFeedback("VIP активовано на цей сезон.");
    } catch (error) {
      setVipPurchaseError(error instanceof BattlePassApiError
        ? error.code === "insufficient_gold" ? "Недостатньо золота для VIP"
          : error.code === "battle_pass_vip_unavailable" ? "VIP уже придбано або він недоступний"
            : "Не вдалося придбати VIP. Спробуй ще раз."
        : "Не вдалося придбати VIP. Спробуй ще раз.");
    } finally {
      setVipPurchasePending(false);
    }
  }

  if (itemsOpen && infoFocus === undefined && state.status === "ready") {
    return (
      <div className="battle-pass-screen treasure-screen">
        <ScreenHeading backLabel="До алмазних нагород" onBack={() => setItemsOpen(false)} title="Мої магічні предмети" titleFirst />
        <OwnedItems catalog={state.data.battlePass.catalog} onInfo={setInfoFocus} owned={state.data.battlePass.ownedItems} />
      </div>
    );
  }

  if (infoFocus !== undefined && state.status === "ready") {
    return (
      <div className="battle-pass-screen treasure-screen">
        <ScreenHeading backLabel={itemsOpen ? "До моїх магічних предметів" : "До алмазних нагород"} onBack={() => setInfoFocus(undefined)} title="Опис магічних предметів" titleFirst />
        <RewardCatalog catalog={state.data.battlePass.catalog} focusId={infoFocus} />
      </div>
    );
  }

  return (
    <div className="battle-pass-screen treasure-screen">
      <ScreenHeading onBack={onBack} title="Алмазні нагороди" titleFirst />
      {state.status === "loading" ? <div className="battle-pass-state">Відновлюємо мапу…</div> : null}
      {state.status === "error" ? <div className="battle-pass-state battle-pass-state--error"><strong>Мапа недоступна</strong><span>{state.message}</span><button onClick={retry} type="button">Повторити</button></div> : null}
      {state.status === "ready" ? (
        <>
          <section className="treasure-screen__header">
            <div aria-hidden="true" className="treasure-screen__portrait"><Lariska emotion="happy" /></div>
            <div className="treasure-screen__copy">
              <strong className="treasure-screen__diamonds"><img alt="" aria-hidden="true" src={DIAMOND_ASSET} />{Math.round(walkingDiamonds)}</strong>
              <span>Збирай алмази за щоденні завдання й відкривай скрині.</span>
              <time>До кінця сезону: {formatRemaining(state.data.battlePass.endsAt, now)}</time>
            </div>
          </section>
          {state.data.battlePass.currencyBoost.active ? (
            <div className="treasure-screen__boost"><CurrencyIcon kind="silver" size={17} /><CurrencyIcon kind="gold" size={17} /><strong>×2 срібла та золота</strong><time>ще {formatRemaining(state.data.battlePass.currencyBoost.expiresAt!, now)}</time></div>
          ) : null}
          {state.data.battlePass.vip.purchasable || state.data.battlePass.vip.active ? (
            <section aria-label="VIP" className={`vip-plate${state.data.battlePass.vip.active ? " vip-plate--active" : ""}`}>
              <img alt="" aria-hidden="true" className="vip-plate__crest" src="/assets/ui/battle-pass/bp-vip-crest-v1.webp" />
              <div className="vip-plate__copy">
                <span>{state.data.battlePass.vip.active ? "VIP-доступ активний до кінця сезону." : "VIP-доступ на сезон дає більше нагород!"}</span>
              </div>
              {state.data.battlePass.vip.purchasable ? <button
                className="eq-button vip-plate__buy"
                onClick={() => { setVipPurchaseError(null); setVipConfirmationOpen(true); }}
                ref={vipPurchaseButtonRef}
                type="button"
              >
                <span className="vip-plate__buy-content"><span>Купити за</span><CurrencyIcon kind="gold" size={17} /><strong>{state.data.battlePass.vip.price}</strong></span>
              </button> : null}
            </section>
          ) : null}
          {feedback ? <p className="treasure-screen__feedback" role="status">{feedback}</p> : null}
          {state.data.battlePass.circles.map((circle) => (
            <RewardTrack circle={circle} diamonds={walkingDiamonds} key={circle.circle} onClaim={handleMilestoneClaim} onInfo={setInfoFocus} onOpenItems={() => setItemsOpen(true)} pendingId={pendingId} totalCircles={state.data.battlePass.totalCircles} vipActive={state.data.battlePass.vip.active} />
          ))}
          {claimedCard ? <CardRewardReveal card={claimedCard} onClose={() => setClaimedCard(null)} /> : null}
          {claimedItem ? <EquipmentItemCard celebrate definition={claimedItem} eyebrow="Зі скрині" onClose={() => setClaimedItemId(null)}><button className="eq-button eq-button--leather" onClick={() => setClaimedItemId(null)} type="button">Забрати</button></EquipmentItemCard> : null}
          {vipConfirmationOpen && state.data.battlePass.vip.purchasable ? <ConfirmationDialog
            busy={vipPurchasePending}
            busyLabel="Купуємо…"
            confirmLabel={`Купити за ${state.data.battlePass.vip.price} золота`}
            description={<p>VIP відкриває додаткові скрині цього сезону. Вартість — {state.data.battlePass.vip.price} золота.</p>}
            error={vipPurchaseError}
            onCancel={() => { setVipConfirmationOpen(false); setVipPurchaseError(null); }}
            onConfirm={() => void handleVipPurchase()}
            restoreFocusTargetRef={vipPurchaseButtonRef}
            title="Придбати VIP на сезон?"
            variant="primary"
          /> : null}
        </>
      ) : null}
    </div>
  );
}
