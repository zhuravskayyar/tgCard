import { useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import type { CardRarity } from "@cardastika/shared";
import { useCardArtworkSource } from "./cardArtSource";
import { createBoosterCardTexture, loadBoosterImage, type BoosterPreviewCard } from "../booster/boosterCardTexture";
import { mountBoosterRenderer, type BoosterPhase, type BoosterRenderer } from "../booster/boosterRenderer";
import { createShopPackTexture } from "../booster/boosterPackTexture";
import type { CutPoint } from "../booster/boosterCut";
import { playSound, preloadSounds, revealSoundCue } from "../audio";
import "../styles/booster-preview.css";

export const BOOSTER_RARITY_LABELS: Record<CardRarity, string> = { common: "Звичайна", uncommon: "Незвичайна", rare: "Рідкісна", epic: "Епічна", legendary: "Легендарна", mythic: "Міфічна" };

interface BoosterOpeningProps {
  card: BoosterPreviewCard;
  /** Optional label for the preview lab's button after the card is revealed. */
  doneLabel?: string;
  onDone: () => void;
  /** Shop proceeds to the normal reward screen as soon as the 3D reveal finishes. */
  autoFinishOnReveal?: boolean;
  /** Lets the shop switch to its accessible 2D unboxing if 3D cannot start. */
  onFallback?: (message: string) => void;
  /** Reports a new phase; the lab locks its rarity picker while a pack is open. */
  onPhaseChange?: (phase: BoosterPhase, ready: boolean) => void;
  packRarity: CardRarity;
  toolbar?: ReactNode;
  footnote?: ReactNode;
}

// The 3D pack: cut it with one stroke, watch the card rise, then turn it in 3D.
export function BoosterOpening({ autoFinishOnReveal = false, card, doneLabel, footnote, onDone, onFallback, onPhaseChange, packRarity, toolbar }: BoosterOpeningProps) {
  const { source, loading: artworkLoading, onSourceError } = useCardArtworkSource(card.artKey ?? null, card.cardId);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<BoosterRenderer | null>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const pointerRef = useRef<{ id: number; x: number; y: number; cutting: boolean; points: CutPoint[]; trace: string } | null>(null);
  const [phase, setPhase] = useState<BoosterPhase>("sealed");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [drawing, setDrawing] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || artworkLoading) return;
    const controller = new AbortController();
    let renderer: BoosterRenderer | null = null;
    setReady(false);
    setError(null);
    setPhase("sealed");
    pointerRef.current = null;
    setDrawing(false);
    pathRef.current?.setAttribute("d", "");
    void Promise.all([
      createShopPackTexture(packRarity, controller.signal),
      createBoosterCardTexture(card, source, controller.signal),
      loadBoosterImage("/assets/guild/card-back-v1.webp"),
    ]).then(([wrapper, cardTexture, reverse]) => {
      if (controller.signal.aborted) return;
      renderer = mountBoosterRenderer(canvas, wrapper, cardTexture, reverse, setPhase, (message) => {
        if (onFallback) { onFallback(message); return; }
        setError(message);
        setReady(false);
      });
      rendererRef.current = renderer;
      setReady(true);
    }).catch((reason: unknown) => {
      if (controller.signal.aborted) return;
      const message = reason instanceof Error ? reason.message : "Не вдалося підготувати пакунок.";
      if (message === "Арт карти тимчасово недоступний.") {
        onSourceError();
        setError(message);
        return;
      }
      if (onFallback) { onFallback(message); return; }
      setError(message);
    });
    return () => {
      controller.abort();
      renderer?.dispose();
      rendererRef.current = null;
    };
  }, [card, source, artworkLoading, attempt, packRarity, onFallback, onSourceError]);

  useEffect(() => { preloadSounds(["pack-tear", revealSoundCue(card.rarity)]); }, [card]);
  useEffect(() => {
    if (phase === "tearing") playSound("pack-tear");
    if (phase === "revealing") playSound(revealSoundCue(card.rarity));
  }, [phase, card]);
  useEffect(() => { onPhaseChange?.(phase, ready); }, [phase, ready, onPhaseChange]);
  useEffect(() => {
    if (autoFinishOnReveal && ready && phase === "revealed") onDone();
  }, [autoFinishOnReveal, onDone, phase, ready]);

  function clearPointer() {
    pointerRef.current = null;
    setDrawing(false);
    pathRef.current?.setAttribute("d", "");
  }

  function appendCutPoint(event: PointerEvent<HTMLCanvasElement>) {
    const pointer = pointerRef.current;
    if (!pointer?.cutting || !rendererRef.current || pointer.points.length >= 2048) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width * 1000, y = (event.clientY - rect.top) / rect.height * 1000;
    pointer.points.push(rendererRef.current.pointFromClient(event.clientX, event.clientY));
    pointer.trace += `${pointer.points.length === 1 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)} `;
    pathRef.current?.setAttribute("d", pointer.trace);
  }

  function pointerDown(event: PointerEvent<HTMLCanvasElement>) {
    if (!ready || (phase !== "sealed" && phase !== "revealed") || !event.isPrimary || event.button !== 0) return;
    const cutting = phase === "sealed";
    pointerRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY, cutting, points: [], trace: "" };
    event.currentTarget.setPointerCapture(event.pointerId);
    if (cutting) { setDrawing(true); appendCutPoint(event); }
  }
  function pointerMove(event: PointerEvent<HTMLCanvasElement>) {
    const pointer = pointerRef.current;
    if (!pointer || pointer.id !== event.pointerId) return;
    if (pointer.cutting) appendCutPoint(event);
    else rendererRef.current?.rotate((event.clientX - pointer.x) * .012, (event.clientY - pointer.y) * .009);
    pointer.x = event.clientX;
    pointer.y = event.clientY;
  }
  function pointerUp(event: PointerEvent<HTMLCanvasElement>) {
    const pointer = pointerRef.current;
    if (pointer?.id !== event.pointerId) return;
    if (pointer.cutting) {
      appendCutPoint(event);
      rendererRef.current?.cut(pointer.points);
    }
    clearPointer();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function finishReveal() {
    clearPointer();
    if (phase === "revealed") onDone();
  }

  const active = phase !== "sealed" && phase !== "revealed";
  return (
    <section className={`booster-preview booster-preview--${phase} booster-preview--rarity-${card.rarity}`} aria-label="Відкриття пакунка">
      {toolbar}
      <div className="booster-preview__stage" aria-busy={!ready && !error}>
        <div className="booster-preview__halo" aria-hidden="true" />
        <div className="booster-preview__ring" aria-hidden="true" />
        <div className="booster-preview__shadow" aria-hidden="true" />
        <div className="booster-preview__motes" aria-hidden="true">{Array.from({ length: 12 }, (_, index) => <i key={index} style={{ "--mote": index } as CSSProperties} />)}</div>
        <canvas
          aria-label={phase === "revealed" ? "Карта у 3D. Перетягуй, щоб обертати." : "Проведи одним плавним рухом по обгортці, щоб відкрити карту."}
          className={`booster-preview__canvas${phase === "sealed" ? " booster-preview__canvas--cut" : ""}`}
          key={attempt}
          onLostPointerCapture={clearPointer}
          onPointerCancel={clearPointer}
          onPointerDown={pointerDown}
          onPointerMove={pointerMove}
          onPointerUp={pointerUp}
          ref={canvasRef}
        />
        <svg aria-hidden="true" className={`booster-preview__cut-trace${drawing ? " booster-preview__cut-trace--active" : ""}`} preserveAspectRatio="none" viewBox="0 0 1000 1000"><path ref={pathRef} /></svg>
        {error ? <div className="booster-preview__state" role="alert">
          <p>{error}</p>
          <button className="ui-button" onClick={() => setAttempt((value) => value + 1)} type="button">Спробувати ще раз</button>
        </div> : null}
        {!autoFinishOnReveal && phase === "revealed" ? <div className="booster-preview__controls">
          <button className="ui-button ui-button--primary" disabled={!ready || active || drawing} onClick={finishReveal} type="button">
            {doneLabel ?? "Продовжити"}
          </button>
        </div> : null}
      </div>
      {phase === "sealed" ? <div className="booster-preview__story" aria-live="polite" aria-atomic="true">
        <h2>Розріж пакунок</h2>
      </div> : null}
      {footnote}
    </section>
  );
}
