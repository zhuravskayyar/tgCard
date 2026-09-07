import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { DuelExchange } from "@cardastika/shared";
import { CardFxWrapper } from "./CardFxWrapper";
import { CardHud } from "./CardHud";
import "./battle-attack.css";

export const BATTLE_ATTACK_DURATION_MS = 900;

/** One attack motion for every mode: player slot to enemy slot, then return. */
export function BattleAttackAnimation({ exchange }: { exchange: DuelExchange }) {
  const layer = useRef<HTMLDivElement>(null);
  const [geometry, setGeometry] = useState<{ player: CSSProperties; enemy: CSSProperties } | null>(null);
  useLayoutEffect(() => {
    const root = layer.current;
    const board = root?.parentElement;
    if (!root || !board) return;
    const playerRow = board.querySelector(".duel-card-row--player, .arena-card-row:not(.arena-card-row--target)");
    const enemyRow = board.querySelector(".duel-card-row--enemy, .arena-card-row--target");
    const slotCard = (row: Element | null) => {
      const slot = row?.children[exchange.slotIndex];
      return (slot?.matches(".duel-card") ? slot : slot?.querySelector(".duel-card, .arena-hidden-card")) as HTMLElement | null;
    };
    const player = slotCard(playerRow);
    const enemy = slotCard(enemyRow);
    if (!player || !enemy) return;
    const origin = root.getBoundingClientRect();
    const from = player.getBoundingClientRect();
    const to = enemy.getBoundingClientRect();
    const position = (rect: DOMRect): CSSProperties => ({left: rect.left - origin.left, top: rect.top - origin.top, width: rect.width, height: rect.height});
    setGeometry({player: {...position(from), "--attack-x": `${to.left + to.width / 2 - from.left - from.width / 2}px`, "--attack-y": `${to.top + to.height / 2 - from.top - from.height / 2}px`} as CSSProperties, enemy: position(to)});
    player.dataset.attackCovered = "true";
    enemy.dataset.attackCovered = "true";
    return () => { delete player.dataset.attackCovered; delete enemy.dataset.attackCovered; };
  }, [exchange]);
  return <div ref={layer} className="battle-attack" aria-hidden="true" style={{"--attack-duration": `${BATTLE_ATTACK_DURATION_MS}ms`} as CSSProperties}>
    {geometry ? (["enemy", "player"] as const).map(side => {
      const card = side === "player" ? exchange.playerCard : exchange.enemyCard;
      return <div key={side} className={`duel-card battle-attack__card battle-attack__card--${side} deck-card--${card.element} deck-card--${card.rarity}`} style={geometry[side]}>
        <CardFxWrapper artKey={card.artKey} cardId={card.cardId} compact element={card.element} rarity={card.rarity}>
          <CardHud element={card.element} power={card.finalPower} rarity={card.rarity} />
          {card.source === "guild" ? <span className="duel-card__guild-mark">Гільдія</span> : null}
        </CardFxWrapper>
        <span className="battle-attack__damage">−{side === "enemy" ? exchange.playerDamage : exchange.enemyDamage}</span>
      </div>;
    }) : null}
  </div>;
}
