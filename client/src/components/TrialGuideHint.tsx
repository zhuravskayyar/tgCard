import { useEffect, useRef, useState } from "react";
import type { StoryTrialNavigationTarget, StoryTrialState } from "@cardastika/shared";
import type { TrialGuide, TrialGuideStep } from "../onboarding/trialGuide";
import { getUiLocale, translateUi } from "../i18n";
import { getTelegramInitData } from "../telegram";
import { loadStoryTrials } from "../telegram/storyTrials";
import { AppIcon } from "./AppIcon";
import { Lariska } from "./Lariska";

const tx = (value: string) => translateUi(value, getUiLocale());
const ARROW = 52;
const ARROW_GAP = 8; // clears the spotlight edge at the arrow's bob peak
const ARROW_ROOM = ARROW + ARROW_GAP;
// Dialogs and in-screen overlays outrank the hint, unless the hint points inside one of them.
const BLOCKERS = "[aria-modal=\"true\"], [role=\"dialog\"], .confirmation-backdrop, .tutorial-overlay:not(.trial-guide), .dungeon-result, .nickname-mail-overlay, .duel-locked-hint, .card-detail-feedback-layer, .equipment-sheet-backdrop";
// After a tap the server may have counted the trial; re-check once the request has had time to land.
const RECHECK_DELAYS_MS = [1500, 4000, 9000];

interface Box { top: number; left: number; width: number; height: number }
interface Placement { step: TrialGuideStep; target: Box | null; arrowDown: boolean }

function toBox(rect: DOMRect): Box {
  return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
}

function sameBox(a: Box | null, b: Box | null) {
  return !a || !b ? a === b : Math.round(a.top) === Math.round(b.top) && Math.round(a.left) === Math.round(b.left) && Math.round(a.width) === Math.round(b.width) && Math.round(a.height) === Math.round(b.height);
}

function isUsable(element: HTMLElement, step: TrialGuideStep) {
  if (!element.getClientRects().length) return false;
  if ((element as HTMLButtonElement).disabled || element.getAttribute("aria-disabled") === "true") return false;
  return !step.requireReady || element.hasAttribute("data-ready");
}

/** The deepest step whose marker is on screen and usable, or null when nothing should be pointed at. */
function findStep(guide: TrialGuide, trialStates: ReadonlyMap<string, StoryTrialState>) {
  const blockers = [...document.querySelectorAll<HTMLElement>(BLOCKERS)];
  for (let index = guide.steps.length - 1; index >= 0; index -= 1) {
    const step = guide.steps[index]!;
    if (step.whenTrialActive && trialStates.get(step.whenTrialActive) !== "active") continue;
    const element = document.querySelector<HTMLElement>(`[data-tutorial-target~="${step.target}"]`);
    if (!element || !isUsable(element, step)) continue;
    if (blockers.length && !blockers.some((blocker) => blocker.contains(element))) continue;
    return { step, element };
  }
  return null;
}

/** The free band between TopHud and BottomNav; the hint never draws over the shell. */
function measureBand(): Box {
  const contentRect = document.querySelector<HTMLElement>(".app-content")?.getBoundingClientRect();
  const top = document.querySelector<HTMLElement>(".top-hud")?.getBoundingClientRect().bottom ?? 0;
  const bottom = document.querySelector<HTMLElement>(".bottom-navigation")?.getBoundingClientRect().top ?? window.innerHeight;
  return { top, left: contentRect?.left ?? 0, width: contentRect?.width ?? window.innerWidth, height: Math.max(0, bottom - top) };
}

/**
 * A non-blocking pointer for the first adventure's trials: it lights up the real button and
 * Lariska says what to do. The player taps the button itself; the hint never intercepts input.
 * Once the server counts the trial, it stops pointing and sends the player to claim the reward.
 */
export function TrialGuideHint({ guide, onNavigateTrial, onOpenTrials, trialId }: {
  guide: TrialGuide;
  onNavigateTrial: (target: StoryTrialNavigationTarget, trialId: string) => void;
  onOpenTrials: () => void;
  trialId: string;
}) {
  const [placement, setPlacement] = useState<Placement | null>(null);
  const [band, setBand] = useState<Box | null>(null);
  const [done, setDone] = useState(false);
  const scrolledTo = useRef<HTMLElement | null>(null);
  const lit = useRef<HTMLElement | null>(null);
  const trialStates = useRef<ReadonlyMap<string, StoryTrialState>>(new Map());

  useEffect(() => {
    const initData = getTelegramInitData();
    if (!initData) return undefined;
    const controller = new AbortController();
    const timers: number[] = [];
    const check = () => {
      void loadStoryTrials(initData, controller.signal)
        .then((view) => {
          trialStates.current = new Map(view.trials.map((trial) => [trial.id, trial.state]));
          if (trialStates.current.get(trialId) === "completed") setDone(true);
        })
        .catch(() => undefined);
    };
    const onTap = () => {
      timers.splice(0).forEach((timer) => window.clearTimeout(timer));
      RECHECK_DELAYS_MS.forEach((delay) => timers.push(window.setTimeout(check, delay)));
    };
    check();
    document.addEventListener("click", onTap, true);
    return () => {
      controller.abort();
      timers.forEach((timer) => window.clearTimeout(timer));
      document.removeEventListener("click", onTap, true);
    };
  }, [trialId]);

  useEffect(() => {
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    function measure() {
      const content = measureBand();
      setBand((current) => (sameBox(current, content) ? current : content));
      const found = findStep(guide, trialStates.current);
      // The glow sits on the real button and follows its painted shape (no CSS rectangle around it).
      const glowTarget = found && !found.step.noPointer ? found.element : null;
      if (lit.current !== glowTarget) lit.current?.classList.remove("trial-guide-glow");
      // Re-applied every pass: React rewrites className when the button re-renders.
      glowTarget?.classList.add("trial-guide-glow");
      lit.current = glowTarget;
      if (!found) {
        setPlacement((current) => (current === null ? current : null));
        return;
      }
      if (scrolledTo.current !== found.element) {
        scrolledTo.current = found.element;
        found.element.scrollIntoView({ block: "center", behavior: reducedMotion ? "auto" : "smooth" });
      }
      const rect = toBox(found.element.getBoundingClientRect());
      // Spotlight only a target fully inside the band, so nothing paints over TopHud or BottomNav.
      const insideContent = rect.top >= content.top && rect.top + rect.height <= content.top + content.height;
      const next: Placement = {
        step: found.step,
        target: insideContent && !found.step.noPointer ? rect : null,
        // Point from whichever side has room inside the band.
        arrowDown: rect.top + rect.height + 4 + ARROW_ROOM > content.top + content.height,
      };
      setPlacement((current) => (current && current.step === next.step && current.arrowDown === next.arrowDown && sameBox(current.target, next.target) ? current : next));
    }
    // Bursts of DOM changes (battle animations, reveals) collapse into one measurement per frame.
    let frame = 0;
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(() => { frame = 0; measure(); }); };
    measure();
    const timer = window.setInterval(schedule, 250);
    window.addEventListener("resize", schedule);
    document.addEventListener("scroll", schedule, true);
    // A dialog opening must move the hint at once, not on the next tick.
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
      window.clearInterval(timer);
      window.removeEventListener("resize", schedule);
      document.removeEventListener("scroll", schedule, true);
      lit.current?.classList.remove("trial-guide-glow");
      lit.current = null;
    };
  }, [guide]);

  if (!band) return null;
  const pad = 4;
  const target = done ? null : placement?.target ?? null;
  const middle = target ? target.top + target.height / 2 : 0;
  const bubbleAtTop = !done && middle > band.top + band.height / 2;
  const bubbleStyle = bubbleAtTop
    ? { left: band.left + 8, width: band.width - 16, top: band.top + 8 }
    : { left: band.left + 8, width: band.width - 16, bottom: window.innerHeight - (band.top + band.height) + 8 };

  if (done) {
    return (
      <div aria-live="polite" className="tutorial-overlay trial-guide">
        <section className="trial-guide__bubble trial-guide__bubble--done" style={bubbleStyle}>
          <span aria-hidden="true" className="trial-guide__art"><Lariska emotion="happy" /></span>
          <div className="trial-guide__done">
            <p>{tx("Завдання виконано! Забери нагороду.")}</p>
            <button className="adventure-button ui-button ui-button--primary" onClick={onOpenTrials} type="button">{tx("До випробувань")}</button>
          </div>
        </section>
      </div>
    );
  }
  if (!placement) return null;

  return (
    <div aria-live="polite" className="tutorial-overlay trial-guide">
      {target ? (
        <>
          <span
            aria-hidden="true"
            className={`trial-guide__arrow${placement.arrowDown ? " trial-guide__arrow--down" : ""}`}
            style={{ left: target.left + target.width / 2, top: placement.arrowDown ? target.top - pad - ARROW_GAP - ARROW : target.top + target.height + pad + ARROW_GAP }}
          ><AppIcon name="arrow-up" size={ARROW} /></span>
        </>
      ) : null}
      <section className="trial-guide__bubble" style={bubbleStyle}>
        <span aria-hidden="true" className="trial-guide__art"><Lariska emotion="happy" /></span>
        {placement.step.action ? (
          <div className="trial-guide__done">
            <p>{tx(placement.step.text)}</p>
            <button className="adventure-button ui-button ui-button--primary" onClick={() => { const { target: next, trialId: nextTrial } = placement.step.action!; onNavigateTrial(next, nextTrial); }} type="button">{tx(placement.step.action.label)}</button>
          </div>
        ) : <p>{tx(placement.step.text)}</p>}
      </section>
    </div>
  );
}
