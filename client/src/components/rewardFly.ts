import { CURRENCY_ICON_SOURCES, type CurrencyKind } from "./currencyIcons";
import { RESOURCE_ICON_SOURCES } from "./ResourceIcon";

const CLICK_SOURCE_WINDOW_MS = 4_000;
const FLIGHT_MS = 720;
const STAGGER_MS = 70;
const ICON_SIZE = 30;

let lastPress: { at: number; x: number; y: number } | null = null;

if (typeof document !== "undefined") {
  document.addEventListener("pointerdown", (event) => {
    lastPress = { at: performance.now(), x: event.clientX, y: event.clientY };
  }, { capture: true, passive: true });
}

/** The shown reward item nearest to the last press, marked with data-reward-source. */
function findRewardElement(variant: string) {
  const items = [...document.querySelectorAll<HTMLElement>(`[data-reward-source="${variant}"]`)]
    .map((element) => {
      const rect = element.getBoundingClientRect();
      return { rect, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    })
    .filter(({ rect }) => rect.width > 0 && rect.bottom > 0 && rect.top < window.innerHeight);
  const anchor = lastPress ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  return items.sort((a, b) => Math.hypot(a.x - anchor.x, a.y - anchor.y) - Math.hypot(b.x - anchor.x, b.y - anchor.y))[0] ?? null;
}

function getSource(variant: string) {
  const reward = findRewardElement(variant);
  if (reward) return reward;
  if (lastPress && performance.now() - lastPress.at <= CLICK_SOURCE_WINDOW_MS) return lastPress;
  return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
}

function iconCount(amount: number) {
  return Math.min(8, 3 + Math.floor(Math.log10(Math.max(1, amount))));
}

function showGainLabel(target: Element, amount: number, variant: string, suffix = "") {
  const rect = target.getBoundingClientRect();
  const label = document.createElement("span");
  label.className = `reward-fly__gain reward-fly__gain--${variant}`;
  label.textContent = `+${new Intl.NumberFormat("uk-UA").format(amount)}${suffix}`;
  label.style.left = `${rect.left + rect.width / 2}px`;
  label.style.top = `${rect.bottom + 2}px`;
  document.body.append(label);
  label.animate(
    [
      { opacity: 0, transform: "translate(-50%, -6px) scale(.8)" },
      { opacity: 1, transform: "translate(-50%, 2px) scale(1.1)", offset: .2 },
      { opacity: 1, transform: "translate(-50%, 6px) scale(1)", offset: .75 },
      { opacity: 0, transform: "translate(-50%, 14px) scale(1)" },
    ],
    { duration: 1_300, easing: "ease-out" },
  ).onfinish = () => label.remove();
}

interface RewardFlight {
  amount: number;
  endX: number;
  endY: number;
  iconSrc: string;
  suffix?: string;
  target: Element;
  variant: string;
}

/**
 * Sends reward icons from the last press (or the screen center) to a HUD point.
 * Returns the delay before the first icon lands, 0 when motion is off.
 */
function flyReward({ amount, endX, endY, iconSrc, suffix, target, variant }: RewardFlight) {
  if (typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return 0;
  const { x: startX, y: startY } = getSource(variant);
  const count = iconCount(amount);

  for (let index = 0; index < count; index += 1) {
    const image = document.createElement("img");
    image.alt = "";
    image.className = "reward-fly__icon";
    image.src = iconSrc;
    image.width = ICON_SIZE;
    image.height = ICON_SIZE;
    document.body.append(image);
    const angle = (index / count) * Math.PI * 2;
    const burstX = startX + Math.cos(angle) * 26;
    const burstY = startY + Math.sin(angle) * 26;
    const animation = image.animate(
      [
        { opacity: 0, transform: `translate(${startX - ICON_SIZE / 2}px, ${startY - ICON_SIZE / 2}px) scale(.4)` },
        { opacity: 1, transform: `translate(${burstX - ICON_SIZE / 2}px, ${burstY - ICON_SIZE / 2}px) scale(1.25)`, offset: .25, easing: "cubic-bezier(.5, 0, .75, .4)" },
        { opacity: 1, transform: `translate(${endX - ICON_SIZE / 2}px, ${endY - ICON_SIZE / 2}px) scale(.7)` },
      ],
      { delay: index * STAGGER_MS, duration: FLIGHT_MS, easing: "ease-out", fill: "both" },
    );
    animation.onfinish = () => {
      image.remove();
      target.animate(
        [{ transform: "scale(1)" }, { transform: "scale(1.14)", filter: "brightness(1.35)" }, { transform: "scale(1)" }],
        { duration: 220, easing: "ease-out" },
      );
    };
  }
  window.setTimeout(() => showGainLabel(target, amount, variant, suffix), FLIGHT_MS);
  return FLIGHT_MS;
}

export function flyRewardToHud(kind: CurrencyKind, target: Element, amount: number) {
  const icon = (target.querySelector(".currency-icon") ?? target).getBoundingClientRect();
  return flyReward({
    amount,
    endX: icon.left + icon.width / 2,
    endY: icon.top + icon.height / 2,
    iconSrc: CURRENCY_ICON_SOURCES[kind],
    target,
    variant: kind,
  });
}

export function flyExperienceToHud(target: Element, amount: number, progress: number) {
  const track = target.getBoundingClientRect();
  return flyReward({
    amount,
    endX: track.left + track.width * progress,
    endY: track.top + track.height / 2,
    iconSrc: RESOURCE_ICON_SOURCES.xp,
    suffix: " XP",
    target,
    variant: "xp",
  });
}
