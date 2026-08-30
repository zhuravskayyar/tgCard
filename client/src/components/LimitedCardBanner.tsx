import { useEffect, useState, type FormEvent } from "react";
import type { LimitedShopEvent } from "@cardastika/shared";
import { CardArtwork } from "./CardArtwork";
import { CardQualityBadge } from "./CardQualityBadge";
import { ElementSymbol } from "./ElementSymbol";

interface LimitedCardBannerProps {
  errorMessage?: string | null;
  event: LimitedShopEvent;
  onExpired: () => void;
  onRedeem: (promoCode: string) => void;
  redeeming: boolean;
}

function formatRemaining(milliseconds: number) {
  const totalMinutes = Math.max(0, Math.ceil(milliseconds / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours} год ${String(minutes).padStart(2, "0")} хв`;
}

export function LimitedCardBanner({ errorMessage, event, onExpired, onRedeem, redeeming }: LimitedCardBannerProps) {
  const [promoCode, setPromoCode] = useState("");
  const [remaining, setRemaining] = useState(() => new Date(event.endsAt).getTime() - Date.now());

  useEffect(() => {
    const update = () => {
      const next = new Date(event.endsAt).getTime() - Date.now();
      setRemaining(next);
      if (next <= 0) onExpired();
    };
    update();
    const timer = window.setInterval(update, 30_000);
    return () => window.clearInterval(timer);
  }, [event.endsAt, onExpired]);

  function submit(eventObject: FormEvent<HTMLFormElement>) {
    eventObject.preventDefault();
    if (!promoCode.trim() || event.redeemed || redeeming || remaining <= 0) return;
    onRedeem(promoCode.trim());
  }

  return (
    <article className="limited-card-banner" aria-labelledby="limited-card-heading">
      <div className="limited-card-banner__art">
        <CardArtwork artKey={event.artKey} cardId={event.id} element={event.element} />
        <CardQualityBadge rarity={event.rarity} size="small" />
        <span><ElementSymbol element={event.element} /></span>
      </div>
      <div className="limited-card-banner__copy">
        <span className="limited-card-banner__eyebrow">ЛІМІТОВАНА КАРТА</span>
        <h3 id="limited-card-heading">{event.displayName}</h3>
        <p>{event.description}</p>
        <strong className="limited-card-banner__timer">Залишилось: {formatRemaining(remaining)}</strong>
      </div>
      {event.redeemed ? <p className="limited-card-banner__claimed">Ви вже отримали цю карту.</p> : (
        <form className="limited-card-banner__form" onSubmit={submit}>
          <label htmlFor="limited-card-promo">Промокод</label>
          <div>
            <input
              autoComplete="off"
              id="limited-card-promo"
              onChange={(inputEvent) => setPromoCode(inputEvent.target.value)}
              placeholder="Введіть код"
              value={promoCode}
            />
            <button disabled={redeeming || remaining <= 0 || !promoCode.trim()} type="submit">
              {redeeming ? "Перевіряємо…" : "Отримати"}
            </button>
          </div>
          {errorMessage ? <small role="alert">{errorMessage}</small> : null}
        </form>
      )}
    </article>
  );
}
