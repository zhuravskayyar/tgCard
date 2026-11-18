import { useEffect, useId, useMemo, useState } from "react";
import type { DuelView, LariskaEmotion } from "@cardastika/shared";
import { AppIcon } from "./AppIcon";
import { Lariska } from "./Lariska";
import { ElementCycle, STRONG_ELEMENT_MULTIPLIER, WEAK_ELEMENT_MULTIPLIER, formatElementMultiplier } from "./ElementCycle";
import { formatUiNumber, getUiLocale } from "../i18n";
import type { TutorialStep } from "../hooks/useTutorial";

interface TutorialOverlayProps {
  actionPending?: boolean;
  duel: DuelView | null;
  error?: string | null;
  onAction: () => void;
  onPause: () => void;
  screenKey: string;
  step: TutorialStep | null;
}

interface TutorialCopy {
  action: string;
  interactive?: boolean;
  target?: string;
  text: string;
  title: string;
}

const REFERENCE_DUEL_STEPS = ["duel-first-card", "duel-advantage", "duel-free-play"] as const;

interface ViewportSize {
  height: number;
  width: number;
}

interface TargetRect {
  bottom: number;
  height: number;
  left: number;
  top: number;
  width: number;
}

// Whole pixels: phones report sub-pixel jitter for animated targets, and every new value re-rendered the overlay.
function toTargetRect(rect: DOMRect): TargetRect {
  return { bottom: Math.round(rect.bottom), height: Math.round(rect.height), left: Math.round(rect.left), top: Math.round(rect.top), width: Math.round(rect.width) };
}

function sameRects(left: TargetRect[], right: TargetRect[]) {
  return left.length === right.length && left.every((rect, index) => {
    const other = right[index]!;
    return rect.left === other.left && rect.top === other.top && rect.width === other.width && rect.height === other.height;
  });
}

const STEP_COPY: Record<Exclude<TutorialStep, "complete">, TutorialCopy> = {
  intro: { action: "ПОЧАТИ БІЙ", interactive: true, target: "duel-card-first", text: "Твої карти внизу. Карти суперника — вгорі. Атакуй своєю картою!", title: "" },
  "duel-first-card": { action: "ОБРАТИ КАРТУ", interactive: true, target: "duel-card-first", text: "Твої карти внизу, карти суперника вгорі. Ця стихія слабка проти ворога: удар ×0,5. Атакуй!", title: "" },
  "duel-advantage": { action: "ОБРАТИ КАРТУ", interactive: true, target: "duel-card-second", text: "Рівні стихії б’ють звичайно: ×1. Атакуй цією картою!", title: "" },
  "duel-free-play": { action: "ОБРАТИ КАРТУ", interactive: true, target: "duel-card", text: "Сильна стихія б’є в 1,5 раза сильніше! Тепер сам обери, чим добити ворога!", title: "" },
  "duel-result": { action: "ПЕРЕГЛЯНУТИ КОЛОДУ", target: "duel-result", text: "Перемога! Переглянь свою бойову колоду, а потім вирушай у кампанію.", title: "" },
  deck: { action: "ПЕРЕЙТИ ДО КАМПАНІЇ", target: "deck-rule", text: "У бою працюють 9 найсильніших допустимих карт. Копії однієї базової карти не дублюються — береться найсильніша.", title: "Твоя бойова колода" },
  campaign: { action: "ЗАВЕРШИТИ НАВЧАННЯ", text: "Ти готовий. Заверши навчання, а далі виконуй завдання кампанії у своєму темпі.", title: "Твій шлях починається" },
};

/** "How a duel works": shown one slide at a time before the first tutorial duel. */
function buildIntroSlides(): readonly string[] {
  return [
    "Твої карти внизу, суперника — вгорі. Карти стоять парами навпроти одна одної.",
    "Обери свою карту — вона вдарить карту навпроти, а та одразу вдарить у відповідь. Шкоду отримують обидві сторони.",
    `Стихії: сильна б’є ${formatElementMultiplier(STRONG_ELEMENT_MULTIPLIER)}, слабка ${formatElementMultiplier(WEAK_ELEMENT_MULTIPLIER)}. У кого першим закінчиться здоров’я — той програв.`,
  ];
}

const STEP_EMOTION: Record<Exclude<TutorialStep, "complete">, LariskaEmotion> = {
  intro: "neutral",
  "duel-first-card": "neutral",
  "duel-advantage": "sly",
  "duel-free-play": "sly",
  "duel-result": "happy",
  deck: "happy",
  campaign: "happy",
};

export function TutorialOverlay({ actionPending = false, duel, error = null, onAction, onPause, screenKey, step }: TutorialOverlayProps) {
  const [rects, setRects] = useState<TargetRect[]>([]);
  const [pairRects, setPairRects] = useState<TargetRect[]>([]);
  const [introSlide, setIntroSlide] = useState(0);
  const uiLocale = getUiLocale();
  const INTRO_SLIDES = useMemo(buildIntroSlides, [uiLocale]);
  const [viewport, setViewport] = useState<ViewportSize>(() => typeof window === "undefined"
    ? { height: 1, width: 1 }
    : { height: window.innerHeight, width: window.innerWidth });
  const [dialogPlacement, setDialogPlacement] = useState<"top" | "bottom">("bottom");
  const [referenceDialogTop, setReferenceDialogTop] = useState<number | null>(null);
  const maskId = "tutorial-overlay-mask-" + useId().replace(/:/g, "");
  const lastIntroSlide = INTRO_SLIDES.length - 1;
  // The explainer always restarts from its first slide when the tutorial enters or leaves the intro step.
  useEffect(() => { setIntroSlide(0); }, [step]);
  const copy = useMemo<TutorialCopy | null>(() => {
    if (!step || step === "complete") return null;
    const base = STEP_COPY[step];
    // The explainer is read first, so it has no spotlight yet; the final button starts the battle.
    return step === "intro"
      ? { ...base, action: introSlide < lastIntroSlide ? "ДАЛІ" : base.action, interactive: false, target: undefined, text: INTRO_SLIDES[introSlide]!, title: "Як працює дуель" }
      : base;
  }, [INTRO_SLIDES, introSlide, lastIntroSlide, step]);
  // Real numbers from the exchange that just happened; nothing is shown before the first exchange.
  const lastExchange = duel?.battleLog[0];
  const exchangeSummary = lastExchange && (step === "duel-advantage" || step === "duel-free-play")
    ? `Останній обмін: ти завдав ${formatUiNumber(lastExchange.playerDamage)} шкоди, суперник у відповідь — ${formatUiNumber(lastExchange.enemyDamage)}.`
    : null;
  const referenceDuel = screenKey === "duel" && step !== null && REFERENCE_DUEL_STEPS.includes(step as (typeof REFERENCE_DUEL_STEPS)[number]);
  // The element wheel stays beside Lariska while the duel steps teach the multipliers.
  const showElementCycle = referenceDuel && step !== "duel-result";
  const copyText = copy?.text;
  const targetSelector = useMemo(() => copy?.target ? `[data-tutorial-target~="${copy.target}"]` : null, [copy]);
  // The enemy card facing the highlighted card carries the same token with a "-pair" suffix.
  const pairSelector = useMemo(() => copy?.target ? `[data-tutorial-target~="${copy.target}-pair"]` : null, [copy]);

  useEffect(() => {
    if (!copy || !targetSelector) {
      setRects([]);
      setPairRects([]);
      return undefined;
    }
    let cancelled = false;
    let scheduledFrame: number | null = null;
    const update = () => {
      scheduledFrame = null;
      if (cancelled) return;
      const nextRects = [...document.querySelectorAll<HTMLElement>(targetSelector)]
        .map((element) => toTargetRect(element.getBoundingClientRect()))
        .filter((rect) => rect.width > 0 && rect.height > 0);
      // Unchanged values keep the old state, so the overlay does not re-render and cannot feed its own observer.
      setViewport((current) => current.width === window.innerWidth && current.height === window.innerHeight ? current : { height: window.innerHeight, width: window.innerWidth });
      setRects((current) => sameRects(current, nextRects) ? current : nextRects);
      const nextPairRects = pairSelector
        ? [...document.querySelectorAll<HTMLElement>(pairSelector)].map((element) => toTargetRect(element.getBoundingClientRect())).filter((rect) => rect.width > 0 && rect.height > 0)
        : [];
      setPairRects((current) => sameRects(current, nextPairRects) ? current : nextPairRects);
      const targetRect = nextRects[0];
      setDialogPlacement(referenceDuel ? "bottom" : targetRect && targetRect.top + targetRect.height / 2 > window.innerHeight * .56 ? "top" : "bottom");
      if (referenceDuel) {
        const anchor = document.querySelector<HTMLElement>('[data-tutorial-target~="player-hp"]')?.getBoundingClientRect();
        setReferenceDialogTop(anchor ? Math.min(window.innerHeight - 120, anchor.bottom + 7) : null);
      } else {
        setReferenceDialogTop(null);
      }
    };
    // At most one measurement per frame, however many mutations or events arrive.
    const schedule = () => {
      if (!cancelled && scheduledFrame === null) scheduledFrame = window.requestAnimationFrame(update);
    };
    schedule();
    const timer = window.setInterval(schedule, 180);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      cancelled = true;
      if (scheduledFrame !== null) window.cancelAnimationFrame(scheduledFrame);
      window.clearInterval(timer);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
      observer.disconnect();
    };
  }, [copy, pairSelector, referenceDuel, screenKey, targetSelector]);

  if (!copy || !step || step === "complete") return null;

  const getFingerPosition = (rect: TargetRect) => {
    const placeAbove = rect.top >= 58;
    const fingerWidth = 40;
    const left = Math.min(
      Math.max(8, rect.left + rect.width / 2 - fingerWidth / 2),
      Math.max(8, viewport.width - fingerWidth - 8),
    );
    const maxTop = Math.max(8, viewport.height - 48);
    const top = placeAbove
      ? Math.max(8, rect.top - 50)
      : Math.min(maxTop, rect.bottom + 8);
    return {
      left,
      placement: placeAbove ? "above" : "below",
      top,
    } as const;
  };

  return (
    <div aria-label={referenceDuel ? "Підказка бою" : undefined} aria-labelledby={referenceDuel ? undefined : "tutorial-dialog-title"} className="tutorial-overlay" role="dialog">
      <svg
        aria-hidden="true"
        className="tutorial-overlay__scrim"
        preserveAspectRatio="none"
        viewBox={"0 0 " + viewport.width + " " + viewport.height}
      >
        <defs>
          <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width={viewport.width} height={viewport.height}>
            <rect fill="white" height={viewport.height} width={viewport.width} x="0" y="0" />
            {[...rects, ...pairRects].map((rect, index) => (
              <rect fill="black" height={rect.height} key={index} rx="10" width={rect.width} x={rect.left} y={rect.top} />
            ))}
          </mask>
        </defs>
        <rect fill="#020508" fillOpacity={referenceDuel ? "0.18" : "0.78"} height={viewport.height} mask={"url(#" + maskId + ")"} width={viewport.width} x="0" y="0" />
      </svg>
      {rects.map((rect, index) => (
        <span aria-hidden="true" className="tutorial-overlay__spotlight" key={`spotlight-${index}`} style={{ height: rect.height, left: rect.left, top: rect.top, width: rect.width }} />
      ))}
      {pairRects.map((rect, index) => (
        <span aria-hidden="true" className="tutorial-overlay__spotlight tutorial-overlay__spotlight--pair" key={`pair-${index}`} style={{ height: rect.height, left: rect.left, top: rect.top, width: rect.width }} />
      ))}
      {copy.interactive ? rects.map((rect, index) => (
        <button
          aria-label={copy.action}
          className="tutorial-overlay__target"
          key={`target-${index}`}
          onClick={() => {
            const target = document.querySelectorAll<HTMLElement>(targetSelector ?? "")[index];
            target?.click();
          }}
          style={{ height: rect.height, left: rect.left, top: rect.top, width: rect.width }}
          type="button"
        />
      )) : null}
      {copy.interactive && !referenceDuel ? rects.map((rect, index) => {
        const finger = getFingerPosition(rect);
        return (
          <span
            aria-hidden="true"
            className="tutorial-overlay__finger"
            data-placement={finger.placement}
            key={`finger-${index}`}
            style={{ left: finger.left, top: finger.top }}
          >
            <AppIcon name="arrow-up" size={32} />
          </span>
        );
      }) : null}
      {referenceDuel ? rects.map((rect, index) => (
        <span
          aria-hidden="true"
          className="tutorial-overlay__arrow"
          key={`arrow-${index}`}
          style={{ left: rect.left + rect.width / 2, top: rect.bottom + 2 }}
        ><AppIcon name="arrow-up" size={52} /></span>
      )) : null}
      <section className={`tutorial-dialog tutorial-dialog--${dialogPlacement}${referenceDuel ? " tutorial-dialog--reference-duel" : ""}${showElementCycle ? " tutorial-dialog--with-cycle" : ""}`} style={referenceDuel && referenceDialogTop !== null ? { bottom: "auto", top: referenceDialogTop } : undefined}>
        <div className="tutorial-dialog__art" aria-hidden="true"><Lariska emotion={STEP_EMOTION[step]} /></div>
        <div className="tutorial-dialog__body">
          {!referenceDuel ? <div className="tutorial-dialog__meta"><span>Лариска · Навчання</span></div> : null}
          {!referenceDuel ? <h2 id="tutorial-dialog-title">{copy.title}</h2> : null}
          {step === "intro" ? <p className="tutorial-dialog__step" aria-hidden="true">{introSlide + 1} / {INTRO_SLIDES.length}</p> : null}
          <p>{exchangeSummary ? <span className="tutorial-dialog__result">{exchangeSummary}</span> : null}{step === "duel-free-play" ? <><span className="tutorial-dialog__rule-icon" aria-hidden="true"><AppIcon name="duel" size={20} /></span>{copyText}</> : copyText}</p>
          {step === "intro" && introSlide === lastIntroSlide ? <div className="tutorial-dialog__cycle"><ElementCycle showLegend size={96} /></div> : null}
          {!referenceDuel ? <button className="tutorial-dialog__primary" disabled={actionPending} onClick={step === "intro" && introSlide < lastIntroSlide ? () => setIntroSlide((slide) => slide + 1) : onAction} type="button">{actionPending ? "ЗБЕРІГАЄМО…" : copy.action} <AppIcon name="chevron" size={16} /></button> : null}
          {!referenceDuel && error ? <p className="tutorial-dialog__error" role="alert">{error}</p> : null}
          {!referenceDuel ? <button className="tutorial-dialog__secondary" disabled={actionPending} onClick={onPause} type="button">Пізніше</button> : null}
        </div>
        {showElementCycle ? <ElementCycle size={92} /> : null}
      </section>
    </div>
  );
}
