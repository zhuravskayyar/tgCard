import { useId, type CSSProperties } from "react";
import { CARD_ELEMENTS, type CardElement } from "@cardastika/shared";
import { getElementMultiplier } from "@cardastika/game-core";
import { formatUiNumber } from "../i18n";
import { ElementMedallion } from "./ElementMedallion";

// Sentence-case names for the legend; the translation rows for "Вогонь б’є Повітря" etc. live in screenTranslations.ts.
const ELEMENT_NAMES: Readonly<Record<CardElement, string>> = { fire: "Вогонь", water: "Вода", earth: "Земля", air: "Повітря" };
/** Accusative, for "Вогонь б’є Повітря". */
const ELEMENT_TARGETS: Readonly<Record<CardElement, string>> = { fire: "Вогонь", water: "Воду", earth: "Землю", air: "Повітря" };

const ELEMENT_MULTIPLIER_VALUES = CARD_ELEMENTS.flatMap((attacker) => CARD_ELEMENTS.map((defender) => getElementMultiplier(attacker, defender)));
/** Strong / weak / neutral multipliers, derived from the game rules instead of hardcoded copy. */
export const STRONG_ELEMENT_MULTIPLIER = Math.max(...ELEMENT_MULTIPLIER_VALUES);
export const WEAK_ELEMENT_MULTIPLIER = Math.min(...ELEMENT_MULTIPLIER_VALUES);
export const NEUTRAL_ELEMENT_MULTIPLIER = 1;
/** "×1,5" in the current UI number format. */
export function formatElementMultiplier(value: number): string {
  return `×${formatUiNumber(value)}`;
}

/** The element each one hits for the strong multiplier, walked from fire, so the wheel always follows the game rules. */
function strongCycle(): CardElement[] {
  const cycle: CardElement[] = ["fire"];
  while (cycle.length < CARD_ELEMENTS.length) {
    const last = cycle[cycle.length - 1]!;
    const next = CARD_ELEMENTS.find((defender) => getElementMultiplier(last, defender) === STRONG_ELEMENT_MULTIPLIER);
    if (!next || cycle.includes(next)) break;
    cycle.push(next);
  }
  return cycle;
}

// Medallions sit at the top, right, bottom and left; clockwise arrows point from attacker to the element it beats.
const POSITIONS = [{ x: 50, y: 13 }, { x: 87, y: 50 }, { x: 50, y: 87 }, { x: 13, y: 50 }] as const;
const ARCS = [
  "M64 17 Q82 18 83 36",
  "M83 64 Q82 82 64 83",
  "M36 83 Q18 82 17 64",
  "M17 36 Q18 18 36 17",
] as const;

/** A compact wheel of the four elements: each arrow shows which element hits the next one for the strong multiplier. */
export function ElementCycle({ size = 96, showLegend = false }: { size?: number; showLegend?: boolean }) {
  const cycle = strongCycle();
  const headId = `element-cycle-head-${useId().replace(/:/g, "")}`;
  const legend = cycle.map((element, index) => `${ELEMENT_NAMES[element]} б’є ${ELEMENT_TARGETS[cycle[(index + 1) % cycle.length]!]}`).join(" · ");
  return (
    <figure aria-label="Коло стихій" className={`element-cycle${showLegend ? " element-cycle--legend" : ""}`} style={{ "--element-cycle-size": `${size}px` } as CSSProperties}>
    <span className="element-cycle__wheel">
      <svg aria-hidden="true" className="element-cycle__arrows" viewBox="0 0 100 100">
        <defs>
          <marker id={headId} markerHeight="5" markerWidth="5" orient="auto" refX="3.5" refY="2.5" viewBox="0 0 5 5">
            <path d="M0 0 5 2.5 0 5Z" />
          </marker>
        </defs>
        {ARCS.map((arc) => <path d={arc} key={arc} markerEnd={`url(#${headId})`} />)}
      </svg>
      {cycle.map((element, index) => (
        <span className="element-cycle__node" key={element} style={{ left: `${POSITIONS[index]!.x}%`, top: `${POSITIONS[index]!.y}%` }}>
          <ElementMedallion element={element} size={Math.round(size * 0.27)} />
        </span>
      ))}
      <span aria-hidden="true" className="element-cycle__center">{formatElementMultiplier(STRONG_ELEMENT_MULTIPLIER)}</span>
    </span>
    {showLegend ? <figcaption className="element-cycle__legend">{legend}</figcaption> : <figcaption className="element-cycle__sr">{legend}</figcaption>}
    </figure>
  );
}
