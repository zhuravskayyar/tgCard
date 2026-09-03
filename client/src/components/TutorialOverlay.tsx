import { useEffect, useId, useMemo, useState } from "react";
import type { DuelView, LariskaEmotion } from "@cardastika/shared";
import { AppIcon } from "./AppIcon";
import { Lariska } from "./Lariska";
import type { TutorialStep } from "../hooks/useTutorial";

interface TutorialOverlayProps {
  duel: DuelView | null;
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

const STEP_COPY: Record<Exclude<TutorialStep, "complete">, TutorialCopy> = {
  intro: { action: "ПОЧАТИ БІЙ", interactive: true, target: "duel-card-first", text: "Твої карти внизу. Карти суперника — вгорі. Атакуй своєю картою!", title: "" },
  "duel-first-card": { action: "ОБРАТИ КАРТУ", interactive: true, target: "duel-card-first", text: "Твої карти внизу. Карти суперника — вгорі. Атакуй своєю картою!", title: "" },
  "duel-advantage": { action: "ОБРАТИ КАРТУ", interactive: true, target: "duel-card-second", text: "Критичні удари в 1,5 раза сильніші! Атакуй!", title: "" },
  "duel-free-play": { action: "ОБРАТИ КАРТУ", interactive: true, target: "duel-card", text: "Добий ворога будь-якою картою!", title: "" },
  "duel-result": { action: "ЗА НАГОРОДОЮ", target: "duel-result", text: "Перемога! Забери нагороду й вирушай у кампанію.", title: "" },
  deck: { action: "ДАЛІ", target: "deck-rule", text: "У бою працюють 9 найсильніших допустимих карт. Копії однієї базової карти не дублюються — береться найсильніша.", title: "Твоя бойова колода" },
  campaign: { action: "ВІДКРИТИ КАМПАНІЮ", text: "Кампанія — твій основний шлях у грі. Виконуй завдання, відкривай нові етапи й розкривай історію.", title: "Твій шлях починається" },
};

const STEP_EMOTION: Record<Exclude<TutorialStep, "complete">, LariskaEmotion> = {
  intro: "neutral",
  "duel-first-card": "neutral",
  "duel-advantage": "sly",
  "duel-free-play": "sly",
  "duel-result": "happy",
  deck: "happy",
  campaign: "happy",
};

export function TutorialOverlay({ duel, onAction, onPause, screenKey, step }: TutorialOverlayProps) {
  const [rects, setRects] = useState<DOMRect[]>([]);
  const [viewport, setViewport] = useState<ViewportSize>(() => typeof window === "undefined"
    ? { height: 1, width: 1 }
    : { height: window.innerHeight, width: window.innerWidth });
  const [dialogPlacement, setDialogPlacement] = useState<"top" | "bottom">("bottom");
  const [referenceDialogTop, setReferenceDialogTop] = useState<number | null>(null);
  const maskId = "tutorial-overlay-mask-" + useId().replace(/:/g, "");
  const copy = step && step !== "complete" ? STEP_COPY[step] : null;
  const referenceDuel = screenKey === "duel" && step !== null && REFERENCE_DUEL_STEPS.includes(step as (typeof REFERENCE_DUEL_STEPS)[number]);
  const copyText = copy?.text;
  const targetSelector = useMemo(() => copy?.target ? `[data-tutorial-target~="${copy.target}"]` : null, [copy]);

  useEffect(() => {
    if (!copy || !targetSelector) {
      setRects([]);
      return undefined;
    }
    let cancelled = false;
    const update = () => {
      if (cancelled) return;
      const nextRects = [...document.querySelectorAll<HTMLElement>(targetSelector)]
        .map((element) => element.getBoundingClientRect())
        .filter((rect) => rect.width > 0 && rect.height > 0);
      setViewport({ height: window.innerHeight, width: window.innerWidth });
      setRects(nextRects);
      const targetRect = nextRects[0];
      setDialogPlacement(referenceDuel ? "bottom" : targetRect && targetRect.top + targetRect.height / 2 > window.innerHeight * .56 ? "top" : "bottom");
      if (referenceDuel) {
        const anchor = document.querySelector<HTMLElement>('[data-tutorial-target~="player-hp"]')?.getBoundingClientRect();
        setReferenceDialogTop(anchor ? Math.min(window.innerHeight - 120, anchor.bottom + 7) : null);
      } else {
        setReferenceDialogTop(null);
      }
    };
    const frame = window.requestAnimationFrame(update);
    const timer = window.setInterval(update, 180);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      window.clearInterval(timer);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      observer.disconnect();
    };
  }, [copy, referenceDuel, screenKey, targetSelector]);

  if (!copy || !step || step === "complete") return null;

  const getFingerPosition = (rect: DOMRect) => {
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
      emoji: placeAbove ? "👇" : "👆",
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
            {rects.map((rect, index) => (
              <rect fill="black" height={rect.height} key={rect.left + "-" + rect.top + "-" + index} rx="10" width={rect.width} x={rect.left} y={rect.top} />
            ))}
          </mask>
        </defs>
        <rect fill="#020508" fillOpacity={referenceDuel ? "0.18" : "0.78"} height={viewport.height} mask={"url(#" + maskId + ")"} width={viewport.width} x="0" y="0" />
      </svg>
      {rects.map((rect, index) => (
        <span aria-hidden="true" className="tutorial-overlay__spotlight" key={`${rect.left}-${rect.top}-${index}`} style={{ height: rect.height, left: rect.left, top: rect.top, width: rect.width }} />
      ))}
      {copy.interactive ? rects.map((rect, index) => (
        <button
          aria-label={copy.action}
          className="tutorial-overlay__target"
          key={`target-${rect.left}-${rect.top}-${index}`}
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
            key={"finger-" + rect.left + "-" + rect.top + "-" + index}
            style={{ left: finger.left, top: finger.top }}
          >
            {finger.emoji}
          </span>
        );
      }) : null}
      {referenceDuel ? rects.map((rect, index) => (
        <span
          aria-hidden="true"
          className="tutorial-overlay__arrow"
          key={`arrow-${rect.left}-${rect.top}-${index}`}
          style={{ left: rect.left + rect.width / 2, top: Math.max(8, rect.bottom - 15) }}
        >↑</span>
      )) : null}
      <section className={`tutorial-dialog tutorial-dialog--${dialogPlacement}${referenceDuel ? " tutorial-dialog--reference-duel" : ""}`} style={referenceDuel && referenceDialogTop !== null ? { bottom: "auto", top: referenceDialogTop } : undefined}>
        <div className="tutorial-dialog__art" aria-hidden="true"><Lariska emotion={STEP_EMOTION[step]} /></div>
        <div className="tutorial-dialog__body">
          {!referenceDuel ? <div className="tutorial-dialog__meta"><span>Лариска · Навчання</span></div> : null}
          {!referenceDuel ? <h2 id="tutorial-dialog-title">{copy.title}</h2> : null}
          <p>{step === "duel-advantage" ? <><span className="tutorial-dialog__rule-icon" aria-hidden="true">⚔</span>{copyText}</> : copyText}</p>
          {!referenceDuel ? <button className="tutorial-dialog__primary" onClick={onAction} type="button">{copy.action} <AppIcon name="chevron" size={16} /></button> : null}
          {!referenceDuel ? <button className="tutorial-dialog__secondary" onClick={onPause} type="button">Пізніше</button> : null}
        </div>
      </section>
    </div>
  );
}
