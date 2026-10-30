import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { CardElement, CardRarity, ShopPurchaseResponse } from "@cardastika/shared";
import { CardNameBadge } from "./CardNameBadge";
import { CardHud } from "./CardHud";
import { CardFxWrapper } from "./CardFxWrapper";

const elementLabels: Record<CardElement, string> = {
  fire: "Вогонь",
  water: "Вода",
  air: "Повітря",
  earth: "Земля",
};

const rarityLabels: Record<CardRarity, string> = {
  common: "Звичайна",
  uncommon: "Незвичайна",
  rare: "Рідкісна",
  epic: "Епічна",
  legendary: "Легендарна",
  mythic: "Міфічна",
};

type UnboxStage = "idle" | "shake" | "tear" | "rise" | "forge" | "done";
const UNBOX_NEXT_STAGE: Partial<Record<UnboxStage, { after: number; next: UnboxStage }>> = {
  shake: { after: 650, next: "tear" },
  tear: { after: 420, next: "rise" },
  rise: { after: 1_050, next: "done" },
  forge: { after: 1_250, next: "done" },
};
const PAPER_SCRAPS = 12;
const REVEAL_EMBERS = 10;

function prefersReducedMotion() {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

interface ShopRewardRevealProps {
  canBuyTen?: boolean;
  continueLabel?: string;
  forged?: boolean;
  errorMessage?: string | null;
  onBuyAgain?: () => void;
  onBuyTen?: () => void;
  onContinue: () => void;
  packRarity?: CardRarity;
  purchasing?: boolean;
  purchases: readonly ShopPurchaseResponse[];
}

export function ShopRewardReveal({
  canBuyTen = false,
  continueLabel = "Продовжити",
  forged = false,
  errorMessage,
  onBuyAgain,
  onBuyTen,
  onContinue,
  packRarity,
  purchasing = false,
  purchases,
}: ShopRewardRevealProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [unboxStage, setUnboxStage] = useState<UnboxStage>(() => !forged ? "idle" : prefersReducedMotion() ? "done" : "forge");
  const revealRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const step = UNBOX_NEXT_STAGE[unboxStage];
    if (!step) return;
    const timeout = window.setTimeout(() => setUnboxStage(step.next), step.after);
    return () => window.clearTimeout(timeout);
  }, [unboxStage]);

  useLayoutEffect(() => {
    if (unboxStage !== "idle" && unboxStage !== "done") return;
    revealRef.current?.focus({ preventScroll: true });
    revealRef.current?.closest<HTMLElement>(".app-content")?.scrollTo({ top: 0, behavior: "auto" });
  }, [unboxStage]);

  const activePurchase = purchases[activeIndex] ?? purchases[0];
  if (!activePurchase) return null;

  const { collectionCompleted, deckChanged, deckPower, previousDeckPower, reward } = activePurchase;
  const isBatch = purchases.length > 1;
  const hasNextCard = activeIndex < purchases.length - 1;
  const deckImproved = deckChanged && previousDeckPower !== undefined && deckPower !== undefined
    && deckPower > previousDeckPower;

  function showNextCard() {
    if (hasNextCard) setActiveIndex((current) => Math.min(current + 1, purchases.length - 1));
  }

  const rewardCard = (
    <CardFxWrapper artKey={reward.artKey} cardId={reward.cardId} element={reward.element} rarity={reward.rarity}>
      <CardHud element={reward.element} power={reward.finalPower} rarity={reward.rarity} />
    </CardFxWrapper>
  );

  if (unboxStage === "forge") {
    return (
      <section aria-label="Створення карти" className={`shop-forge shop-forge--${reward.rarity}`} ref={revealRef} tabIndex={-1}>
        <span aria-hidden="true" className="shop-forge__light" />
        <span aria-hidden="true" className={`shop-reveal__card shop-forge__card deck-card--${reward.element} deck-card--${reward.rarity}`}>{rewardCard}</span>
        <img alt="" aria-hidden="true" className="shop-forge__anvil" src="/assets/ui/shop/shop-workshop-anvil.png" />
        <span aria-hidden="true" className="shop-forge__sparks">
          {Array.from({ length: PAPER_SCRAPS }, (_, index) => <i key={index} style={{ "--fx-index": index } as CSSProperties} />)}
        </span>
        <button className="shop-unbox-stage__skip" onClick={() => setUnboxStage("done")} type="button">Пропустити анімацію</button>
      </section>
    );
  }

  if (unboxStage !== "done") {
    const packLayers = packRarity ? <><span className={`shop-pack-foil shop-pack-foil--${packRarity}`} /><span className={`shop-pack-gilt shop-pack-gilt--${packRarity}`} /></> : null;
    const sealClass = `shop-pack-seal ${packRarity ? `shop-pack-seal--${packRarity}` : ""} shop-unbox__seal`;
    return (
      <section aria-label="Відкриття пакунка" className="shop-unbox-stage" ref={revealRef} tabIndex={-1}>
        <header className="shop-reveal__heading"><span>Пакунок придбано</span></header>
        <button
          aria-label="Відкрити пакунок"
          aria-disabled={unboxStage !== "idle"}
          className={`shop-unbox shop-unbox--${unboxStage} shop-unbox--${reward.rarity}`}
          onClick={() => {
            if (unboxStage === "idle") setUnboxStage(prefersReducedMotion() ? "done" : "shake");
          }}
          type="button"
        >
          <span aria-hidden="true" className="shop-unbox__flash" />
          <span aria-hidden="true" className="shop-unbox__pack">
            {unboxStage === "rise" ? <span className={`shop-reveal__card shop-unbox__card deck-card--${reward.element} deck-card--${reward.rarity}`}>{rewardCard}</span> : null}
            <span className="shop-pack-body">
              <span className="shop-unbox__half shop-unbox__half--bottom">{packLayers}</span>
              <span className="shop-unbox__half shop-unbox__half--top">{packLayers}</span>
              <img alt="" className={`${sealClass} shop-unbox__seal--left`} src="/assets/ui/shop/stall/pack-seal-v2.webp" />
              <img alt="" className={`${sealClass} shop-unbox__seal--right`} src="/assets/ui/shop/stall/pack-seal-v2.webp" />
            </span>
            {unboxStage === "tear" || unboxStage === "rise" ? (
              <span className="shop-unbox__scraps">
                {Array.from({ length: PAPER_SCRAPS }, (_, index) => <i key={index} style={{ "--fx-index": index } as CSSProperties} />)}
              </span>
            ) : null}
          </span>
        </button>
        <p className="shop-unbox-stage__hint" role="status">{unboxStage === "idle" ? "Торкнися пакунка, щоб зламати печатку" : unboxStage === "shake" ? "Печатка тріскає…" : "\u00a0"}</p>
        {unboxStage !== "idle" ? <button className="shop-unbox-stage__skip" onClick={() => setUnboxStage("done")} type="button">Пропустити анімацію</button> : null}
      </section>
    );
  }

  return (
    <section aria-label="Отримана карта" className={`shop-reveal shop-reveal--${reward.rarity}`} aria-live="polite" data-tutorial-target="shop-reveal" ref={revealRef} tabIndex={-1}>
      <header className="shop-reveal__heading">
        <span>{forged ? "Карту викувано" : activePurchase.newDiscovery ? "Відкрито нову карту" : "Отримано карту"}</span>
        {reward.displayName ? (
          <CardNameBadge name={reward.displayName} />
        ) : (
          <h1 className="card-detail-name-empty">Назва картки недоступна</h1>
        )}
      </header>

      <div className="shop-reveal__stage" key={`stage-${reward.instanceId}`}>
        <span aria-hidden="true" className="shop-reveal__light" />
        <span aria-hidden="true" className="shop-reveal__embers">
          {Array.from({ length: REVEAL_EMBERS }, (_, index) => <i key={index} style={{ "--fx-index": index } as CSSProperties} />)}
        </span>
      {hasNextCard ? (
        <button
          key={reward.instanceId}
          aria-label={`Наступна карта, ${activeIndex + 2} з ${purchases.length}`}
          className={`shop-reveal__card shop-reveal__card--interactive deck-card--${reward.element} deck-card--${reward.rarity}`}
          onClick={showNextCard}
          type="button"
        >
          {rewardCard}
        </button>
      ) : <div className={`shop-reveal__card deck-card--${reward.element} deck-card--${reward.rarity}`} key={reward.instanceId}>{rewardCard}</div>}
      </div>

      {isBatch ? (
        <p className="shop-reveal__batch-summary">
          <strong>Куплено пачкою</strong>
          <span>Карта {activeIndex + 1} з {purchases.length}</span>
          <small>{hasNextCard ? "Торкніться карти, щоб переглянути наступну" : "Це остання карта пачки"}</small>
        </p>
      ) : null}

      <p className={`shop-reveal__rarity-line shop-reveal__rarity-line--${reward.rarity}`}>{rarityLabels[reward.rarity]} · {elementLabels[reward.element]}</p>

      <dl className="shop-reveal__facts">
        <div><dt>Рівень</dt><dd>{reward.level}</dd></div>
        <div><dt>Сила</dt><dd>{reward.finalPower}</dd></div>
      </dl>
      {deckImproved ? (
        <p className="shop-reveal__deck-note">Колода посилилась: {previousDeckPower} → {deckPower}</p>
      ) : null}
      {collectionCompleted ? <aside className="shop-collection-complete"><span>КОЛЕКЦІЮ ЗІБРАНО</span><strong>{collectionCompleted.name}</strong><p>{collectionCompleted.bonusLabel}</p></aside> : null}
      {errorMessage ? <p className="shop-error" role="alert">{errorMessage}</p> : null}
      <div className="shop-reveal__actions">
        {hasNextCard ? <button className="shop-reveal__next" onClick={showNextCard} type="button">Наступна карта · {activeIndex + 2} / {purchases.length}</button> : null}
        <button className="shop-reveal__continue" data-tutorial-target="shop-continue" disabled={purchasing} onClick={onContinue} type="button">{continueLabel}</button>
        {onBuyAgain ? <button className="shop-reveal__buy-again" disabled={purchasing} onClick={onBuyAgain} type="button">{purchasing ? "Купуємо…" : "Купити ще"}</button> : null}
        {canBuyTen && onBuyTen ? <button className="shop-reveal__buy-batch" disabled={purchasing || hasNextCard} onClick={onBuyTen} type="button">{purchasing ? "Купуємо 10…" : "Купити 10"}</button> : null}
      </div>
    </section>
  );
}
