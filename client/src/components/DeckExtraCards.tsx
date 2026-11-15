import { useState } from "react";
import type { PlayerDeckExtraCards } from "@cardastika/shared";
import { AppIcon } from "./AppIcon";
import { CardBack } from "./CardBack";
import { DeckCard } from "./DeckCard";
import { RibbonTitle } from "./RibbonTitle";

interface DeckExtraCardsProps {
  extraCards: PlayerDeckExtraCards;
  onOpenGuild: () => void;
}

/** «Додаткові карти» under the battle deck: ally, guild and goblin slots; closed ones show the dimmed card back with a lock. */
export function DeckExtraCards({ extraCards, onOpenGuild }: DeckExtraCardsProps) {
  const [helpOpen, setHelpOpen] = useState(false);
  const slots = [
    { key: "ally", caption: "Карта союзника", slot: extraCards.ally },
    { key: "guild", caption: "Карта гільдії", slot: extraCards.guild },
    { key: "goblin", caption: "Карта гобліна", slot: extraCards.goblin },
  ] as const;
  return (
    <section aria-label="Додаткові карти" className="deck-extras">
      <RibbonTitle as="h2" className="deck-upgrade-ribbon" size="wide">Додаткові карти</RibbonTitle>
      <div className="deck-extras__row">
        {slots.map(({ key, caption, slot }) => (
          <figure className="deck-extras__slot" key={key}>
            {slot.status === "card"
              ? <DeckCard card={slot.card} onClick={onOpenGuild} />
              : <span aria-label={`${caption}: недоступна`} className="deck-extras__locked" role="img"><CardBack /><span className="deck-extras__lock"><AppIcon name="lock" size={28} /></span></span>}
            <figcaption>{caption}</figcaption>
          </figure>
        ))}
      </div>
      <button aria-expanded={helpOpen} className="deck-extras__link" onClick={() => setHelpOpen((open) => !open)} type="button">Де взяти додаткові карти</button>
      {helpOpen ? (
        <ul className="deck-note deck-note--info deck-extras__help">
          <li><strong>Карта гільдії:</strong> лідер гільдії обирає її; вона з’являється в дуелях, на арені й у турнірі.</li>
          <li><strong>Карта союзника:</strong> з’явиться разом із союзами гільдій.</li>
          <li><strong>Карта гобліна:</strong> щотижнева карта, з’явиться пізніше.</li>
        </ul>
      ) : null}
    </section>
  );
}
