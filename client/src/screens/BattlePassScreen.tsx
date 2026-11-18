import { ScreenHeading } from "../components/ScreenHeading";
import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { BattlePassCircleView, BattlePassMilestoneView, BattlePassVipRewardView, PlayerCardInstance } from "@cardastika/shared";
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
import { buildTrail, getMapStops, MAP_HEIGHT, toSvgPoints, walkTrail, type MapPoint } from "./battlePassMapPath";

const DIAMOND_ASSET = "/assets/ui/icons/icon-diamond-v1.webp";
const MAP_ASSETS = "/assets/ui/battle-pass-map";
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

function Particles({ className, count }: { className: string; count: number }) {
  return (
    <span aria-hidden="true" className={className}>
      {Array.from({ length: count }, (_, index) => <i key={index} style={{ "--fx-index": index, "--fx-x": `${Math.round((index + 1) * 61.8 % 100)}%`, "--fx-y": `${Math.round((index + 4) * 38.2 % 100)}%` } as CSSProperties} />)}
    </span>
  );
}

function chestSprite(milestone: Pick<BattlePassMilestoneView, "claimed" | "claimable">, isFinal: boolean) {
  if (milestone.claimed) return `${MAP_ASSETS}/chest-open-v1.webp`;
  if (isFinal) return `${MAP_ASSETS}/chest-final-v1.webp`;
  return `${MAP_ASSETS}/chest-${milestone.claimable ? "ready" : "locked"}-v1.webp`;
}

function MapStop({ burst, index, isFinal, milestone, onClaim, pending, point, side }: {
  burst: boolean;
  index: number;
  isFinal: boolean;
  milestone: BattlePassMilestoneView;
  onClaim: (id: string) => void;
  pending: boolean;
  point: MapPoint;
  side: "left" | "right";
}) {
  const position = { left: `${point.x}%`, top: `${point.y / MAP_HEIGHT * 100}%`, "--stop-index": index } as CSSProperties;
  if (!milestone.reward) {
    return (
      <div className="treasure-map__checkpoint" style={position}>
        <img alt="" aria-hidden="true" src="/assets/ui/trials/board/nail-v1.webp" />
        <span>{milestone.threshold}</span>
      </div>
    );
  }
  const state = milestone.claimed ? "claimed" : milestone.claimable ? "ready" : "locked";
  const label = milestone.reward.label;
  return (
    <div className={`treasure-map__stop treasure-map__stop--${state} treasure-map__stop--${side}${isFinal ? " treasure-map__stop--final" : ""}${pending ? " treasure-map__stop--opening" : ""}`} style={position}>
      {state === "ready" || isFinal ? <Particles className="treasure-map__rays" count={8} /> : null}
      <button
        aria-label={milestone.claimable ? `Забрати: ${label}` : `${label}, ${milestone.threshold} діамантів${milestone.claimed ? ", отримано" : ""}`}
        className="treasure-map__chest"
        disabled={!milestone.claimable || pending}
        onClick={() => onClaim(milestone.id)}
        type="button"
      >
        <img alt="" aria-hidden="true" src={chestSprite(milestone, isFinal)} />
        {milestone.claimed ? <img alt="" aria-hidden="true" className="treasure-map__seal" src="/assets/ui/trials/board/seal-v1.webp" /> : null}
      </button>
      {burst ? (
        <span aria-hidden="true" className="treasure-map__burst">
          {Array.from({ length: 12 }, (_, item) => <img alt="" key={item} src={DIAMOND_ASSET} style={{ "--fx-index": item } as CSSProperties} />)}
        </span>
      ) : null}
      <span className="treasure-map__tag">
        <strong>{label}</strong>
        <small>{milestone.claimable ? "Натисни на скриню" : <>{milestone.threshold} <img alt="" aria-hidden="true" src={DIAMOND_ASSET} /></>}</small>
      </span>
    </div>
  );
}

/** The VIP chest beside a stop, on the side away from the free reward's tag. */
function VipStop({ index, pending, point, onClaim, reward, side, threshold, vipActive }: {
  index: number;
  onClaim: (id: string) => void;
  pending: boolean;
  point: MapPoint;
  reward: BattlePassVipRewardView;
  side: "left" | "right";
  threshold: number;
  vipActive: boolean;
}) {
  const position = { left: `${point.x}%`, top: `${point.y / MAP_HEIGHT * 100}%`, "--stop-index": index } as CSSProperties;
  const locked = reward.reward.kind === "item" && !reward.reward.available;
  const state = reward.claimed ? "claimed" : reward.claimable ? "ready" : "locked";
  const label = reward.reward.label;
  const note = reward.claimed ? "Отримано" : reward.claimable ? "Натисни на скриню" : locked ? "Скоро в грі" : vipActive ? `${threshold} діамантів` : "Потрібен VIP";
  return (
    <div className={`treasure-map__vip treasure-map__vip--${side} treasure-map__stop--${state}${pending ? " treasure-map__stop--opening" : ""}`} style={position}>
      <button
        aria-label={`VIP: ${label}, ${note}`}
        className="treasure-map__chest"
        disabled={!reward.claimable || pending}
        onClick={() => onClaim(reward.id)}
        type="button"
      >
        <img alt="" aria-hidden="true" src={chestSprite(reward, false)} />
        {reward.claimed ? <img alt="" aria-hidden="true" className="treasure-map__seal" src="/assets/ui/trials/board/seal-v1.webp" /> : null}
      </button>
      <span className="treasure-map__tag treasure-map__vip-tag">
        <strong>{label}</strong>
        <small>{vipActive && !reward.claimable && !locked && !reward.claimed
          ? <>{threshold} <img alt="" aria-hidden="true" src={DIAMOND_ASSET} /></>
          : note}</small>
      </span>
    </div>
  );
}

function TreasureMap({ burstId, circle, diamonds, onClaim, pendingId, vipActive }: {
  burstId: string | null;
  circle: BattlePassCircleView;
  diamonds: number;
  onClaim: (id: string) => void;
  pendingId: string | null;
  vipActive: boolean;
}) {
  const { fromDiamonds, milestones } = circle;
  const { pin, stops, trail, walked } = useMemo(() => {
    const mapStops = getMapStops(milestones.length);
    const fullTrail = buildTrail(mapStops);
    const walkedTrail = walkTrail(fullTrail, milestones.map(({ threshold }) => threshold), diamonds, fromDiamonds);
    return { pin: walkedTrail[walkedTrail.length - 1]!, stops: mapStops, trail: fullTrail, walked: walkedTrail };
  }, [diamonds, fromDiamonds, milestones]);

  return (
    <section className="treasure-map" aria-label="Скарбова мапа нагород">
      <div aria-hidden="true" className="treasure-map__life">
        <i className="treasure-map__cloud treasure-map__cloud--a" />
        <i className="treasure-map__cloud treasure-map__cloud--b" />
        <i className="treasure-map__cloud treasure-map__cloud--c" />
        <Particles className="treasure-map__water" count={9} />
        <Particles className="treasure-map__fireflies" count={7} />
        <svg className="treasure-map__birds" viewBox="0 0 60 20"><path d="M2 10 Q7 3 12 9 Q17 3 22 10 M34 15 Q38 9 42 14 Q46 9 50 15" /></svg>
      </div>
      <svg aria-hidden="true" className="treasure-map__trail" preserveAspectRatio="none" viewBox={`0 0 100 ${MAP_HEIGHT}`}>
        <polyline className="treasure-map__trail-rest" points={toSvgPoints(trail)} />
        <polyline className="treasure-map__trail-walked" points={toSvgPoints(walked)} />
      </svg>
      {milestones.map((milestone, index) => (
        <Fragment key={milestone.id}>
          <MapStop
            burst={burstId === milestone.id}
            index={index}
            isFinal={index === milestones.length - 1}
            milestone={milestone}
            onClaim={onClaim}
            pending={pendingId === milestone.id}
            point={stops[index]!}
            side={stops[index]!.x >= 52 ? "left" : "right"}
          />
          {milestone.vip ? <VipStop
            index={index}
            onClaim={onClaim}
            pending={pendingId === milestone.vip.id}
            point={stops[index]!}
            reward={milestone.vip}
            side={stops[index]!.x >= 52 ? "right" : "left"}
            threshold={milestone.threshold}
            vipActive={vipActive}
          /> : null}
        </Fragment>
      ))}
      <img alt="" aria-hidden="true" className="treasure-map__pin" src={`${MAP_ASSETS}/pin-v1.webp`} style={{ left: `${pin.x}%`, top: `${pin.y / MAP_HEIGHT * 100}%` }} />
    </section>
  );
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
  const [burstId, setBurstId] = useState<string | null>(null);
  const [vipConfirmationOpen, setVipConfirmationOpen] = useState(false);
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
      setBurstId(id);
      window.setTimeout(() => setBurstId((current) => current === id ? null : current), 1_100);
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
          {state.data.battlePass.vip.purchasable ? <button
            className="eq-button treasure-screen__vip-buy"
            onClick={() => { setVipPurchaseError(null); setVipConfirmationOpen(true); }}
            ref={vipPurchaseButtonRef}
            type="button"
          >
            <span className="treasure-screen__vip-buy-content"><span>Купити VIP</span><span><CurrencyIcon kind="gold" size={17} />{state.data.battlePass.vip.price}</span></span>
          </button> : state.data.battlePass.vip.active ? <p className="treasure-screen__vip-active">VIP-колія активна цього сезону.</p> : null}
          {feedback ? <p className="treasure-screen__feedback" role="status">{feedback}</p> : null}
          {state.data.battlePass.circles.map((circle) => (
            <TreasureMap burstId={burstId} circle={circle} diamonds={walkingDiamonds} key={circle.circle} onClaim={handleMilestoneClaim} pendingId={pendingId} vipActive={state.data.battlePass.vip.active} />
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
