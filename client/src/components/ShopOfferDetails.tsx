import { CARD_RARITIES, type CardRarity, type ShopOffer } from "@cardastika/shared";
import { CardArtwork } from "./CardArtwork";
import { CurrencyIcon } from "./CurrencyDisplay";
import { ScreenHeading } from "./ScreenHeading";
import { ShopOfferPanel } from "./ShopOfferPanel";
import { RibbonTitle } from "./RibbonTitle";

const rarityPlurals: Record<CardRarity, string> = {
  common: "Звичайні", uncommon: "Незвичайні", rare: "Рідкісні",
  epic: "Епічні", legendary: "Легендарні", mythic: "Міфічні",
};

interface ShopOfferDetailsProps {
  availableBalance?: number;
  disabled: boolean;
  errorMessage: string | null;
  offer: ShopOffer;
  onBack: () => void;
  onOpenCard: (cardId: string, rarity: CardRarity) => void;
  onPurchase: () => void;
  purchasing: boolean;
}

export function ShopOfferDetails({ availableBalance, disabled, errorMessage, offer, onBack, onOpenCard, onPurchase, purchasing }: ShopOfferDetailsProps) {
  const groups = [...offer.pool].sort((left, right) => CARD_RARITIES.indexOf(right.rarity) - CARD_RARITIES.indexOf(left.rarity));
  return <>
    <ScreenHeading backLabel="До пропозицій" onBack={onBack} title={<>Карти за <CurrencyIcon kind={offer.currency} /> {offer.price}</>} />
    <ShopOfferPanel availableBalance={availableBalance} disabled={disabled} expanded offer={offer} onPurchase={onPurchase} purchasing={purchasing} />
    {errorMessage ? <p className="shop-error" role="alert">{errorMessage}</p> : null}
    <RibbonTitle size="wide">Прямо зараз у продажу</RibbonTitle>
    {groups.some((group) => group.cards.length > 0) ? groups.map((group) => group.cards.length ? (
      <section className="shop-offer-details__group" key={group.rarity}>
        <RibbonTitle as="h3" size="small">{rarityPlurals[group.rarity]}</RibbonTitle>
        <div className="shop-offer-details__grid">
          {group.cards.map((card) => (
            <button aria-label={`Детальніше: ${card.displayName}, ${rarityPlurals[group.rarity]}`} className="shop-offer-details__card" key={card.id} onClick={() => onOpenCard(card.id, group.rarity)} title={card.displayName} type="button">
              <CardArtwork artKey={null} cardId={card.id} element={card.element} rarity={group.rarity} />
              <span className="shop-text-plate shop-offer-details__caption">{card.displayName}</span>
            </button>
          ))}
        </div>
      </section>
    ) : null) : <p className="shop-inline-empty">Список карт тимчасово недоступний.</p>}
  </>;
}
