import type { PlayerSummary } from "@cardastika/shared";
import { AppIcon } from "./AppIcon";
import { CurrencyIcon } from "./CurrencyDisplay";
import { ResourceIcon } from "./ResourceIcon";
import { MenuRow } from "./MenuRow";
import { SHOP_BOOSTS, type ShopBoost } from "../shop/shopBoosts";

interface ShopBoostSectionProps {
  onBack: () => void;
  onOpenDeck: () => void;
  onOpenTasks: () => void;
  player: Pick<PlayerSummary, "gold" | "silver"> | null;
  onPurchase?: (boost: ShopBoost) => void;
}

function BoostEffect({ boost }: { boost: ShopBoost }) {
  return (
    <span className="shop-boost-card__effect">
      {boost.effect === "experience" ? <ResourceIcon kind="xp" size={14} /> : <CurrencyIcon kind="silver" size={14} />}
      {boost.effectLabel}
    </span>
  );
}

function ShopBoostCard({ boost, onPurchase, player }: { boost: ShopBoost; onPurchase?: ShopBoostSectionProps["onPurchase"]; player: ShopBoostSectionProps["player"] }) {
  const balance = player?.[boost.currency];
  const canAfford = typeof balance === "number" && balance >= boost.price;

  return (
    <article className={`shop-boost-card shop-boost-card--${boost.theme}`}>
      <div aria-hidden="true" className="shop-boost-card__art">
        {boost.art ? <img alt="" className="shop-boost-card__art-image" src={boost.art} /> : <AppIcon name={boost.effect === "experience" ? "star" : "silver"} size={29} />}
      </div>
      <div className="shop-boost-card__copy">
        <h3>{boost.title}</h3>
        <span>Термін дії: {boost.duration}</span>
        <BoostEffect boost={boost} />
      </div>
      <div className="shop-boost-card__footer">
        <button aria-label={`Купити ${boost.title.toLowerCase()} за ${boost.price}`} className={`shop-boost-card__purchase shop-boost-card__purchase--${boost.currency}`} disabled={!canAfford || !onPurchase} onClick={() => onPurchase?.(boost)} type="button">
          <span>Купити за</span>
          <CurrencyIcon kind={boost.currency} size={16} />
          <strong>{boost.price}</strong>
        </button>
      </div>
    </article>
  );
}

export function ShopBoostSection({ onBack, onOpenDeck, onOpenTasks, onPurchase, player }: ShopBoostSectionProps) {
  return (
    <section aria-label="Підсилення" className="shop-boosts">
      <div className="shop-boost-list">
        {SHOP_BOOSTS.map((boost) => <ShopBoostCard boost={boost} key={boost.id} onPurchase={onPurchase} player={player} />)}
      </div>
      <nav aria-label="Навігація з підсилень" className="shop-boost-navigation">
        <MenuRow compact icon="shop" onClick={onBack} title="Назад до магазину" />
        <MenuRow attention compact icon="deck" onClick={onOpenDeck} title="Бойова колода" />
        <MenuRow attention compact icon="tasks" onClick={onOpenTasks} title="Завдання" />
      </nav>
    </section>
  );
}
