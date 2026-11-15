import { useEffect, useState } from "react";
import type { GuardianDragonView } from "@cardastika/shared";
import { useGuardianDragon } from "../hooks/useGuardianDragon";
import { CardBack } from "./CardBack";
import { formatUiNumber } from "../i18n";
import { CardArtworkSourceContext } from "./CardFxWrapper";
import { CardHud } from "./CardHud";
import { RibbonTitle } from "./RibbonTitle";

interface DeckDragonBlockProps {
  onOpenDragon: () => void;
}

/** Whole minutes left of a hike, rounded up so the line never shows 0 while the dragon is still away. */
function hikeMinutesLeft(dragon: GuardianDragonView, now: number) {
  if (!dragon.hike) return 0;
  return Math.max(0, Math.ceil((new Date(dragon.hike.endsAt).getTime() - now) / 60_000));
}

function formatMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours} год ${rest} хв` : `${rest} хв`;
}

/** Empty magic slot: the same closed card as the locked extra cards, with a plus. */
function MagicSlot() {
  return (
    <figure className="deck-dragon__slot">
      <span aria-label="Додати магію" className="deck-extras__locked" role="img"><CardBack /></span>
      <figcaption>Магія</figcaption>
    </figure>
  );
}

const FLAME_ART = "/assets/ui/guardian-dragon/flame-card.webp";
const NO_FLAME_ART_ERROR = () => undefined;

/** The flame card drawn in the shared card plate, like the guild card above, with the power in its top plate. */
function FlameCard({ power }: { power: number }) {
  return (
    <figure className="deck-dragon__slot deck-dragon__flame">
      <div aria-label={`Полум’я дракона: сила ${power}`} className="deck-card deck-card--fire deck-card--legendary" role="img">
        <CardArtworkSourceContext.Provider value={{ loading: false, onSourceError: NO_FLAME_ART_ERROR, source: FLAME_ART }}>
          <span className="card-fx card-fx--material card-fx--single card-fx--static deck-card--fire deck-card--legendary">
            <CardHud element="fire" power={power} rarity="legendary" />
          </span>
        </CardArtworkSourceContext.Provider>
      </div>
      <figcaption>Полум’я дракона</figcaption>
    </figure>
  );
}

/** Compact guardian dragon summary under the deck; nothing is drawn until the server answers and the dragon is unlocked. */
export function DeckDragonBlock({ onOpenDragon }: DeckDragonBlockProps) {
  const { state } = useGuardianDragon();
  const [now, setNow] = useState(() => Date.now());
  const dragon = state.status === "ready" && state.data.unlocked ? state.data : null;
  const onHike = Boolean(dragon?.hike);
  useEffect(() => {
    if (!onHike) return;
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    setNow(Date.now());
    return () => window.clearInterval(timer);
  }, [onHike]);
  if (!dragon) return null;
  const minutesLeft = hikeMinutesLeft(dragon, now);
  return (
    <section aria-label="Дракон-захисник" className="deck-dragon">
      <RibbonTitle as="h2" className="deck-upgrade-ribbon" size="wide">Дракон-захисник</RibbonTitle>
      {dragon.hike
        ? <p className="deck-dragon__status">{minutesLeft > 0 ? <><span>У поході ще</span> <strong>{formatMinutes(minutesLeft)}</strong></> : <span>Дракон повертається з походу</span>}</p>
        : null}
      <div className="deck-dragon__stats">
        <span>Здоров’я дракона <strong>{formatUiNumber(dragon.health)}</strong></span>
        <span>Майстерність дракона <strong>{formatUiNumber(dragon.mastery)}</strong></span>
      </div>
      <div aria-label="Полум’я дракона та магія" className="deck-dragon__magic">
        <MagicSlot />
        <FlameCard power={dragon.flame.power} />
        <MagicSlot />
      </div>
      <button className="guardian-dragon__button deck-dragon__button" onClick={onOpenDragon} type="button">Дракон-захисник</button>
      <button className="deck-extras__link" onClick={onOpenDragon} type="button">Як зробити дракона сильнішим</button>
    </section>
  );
}
