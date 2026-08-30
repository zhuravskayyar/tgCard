import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import type { CardElement, CardRarity } from "@cardastika/shared";
import { CardArtwork } from "./CardArtwork";

export interface CardFxArtworkLayers {
  background?: string | null;
  character?: string | null;
  foreground?: string | null;
}

export interface CardFxProfile {
  depth: number;
  edgeFoil: number;
  foil: number;
  glare: number;
  idle: number;
}

export const CARD_FX_PROFILES: Record<CardRarity, CardFxProfile> = {
  common: { depth: 0, foil: 0, glare: 0.035, edgeFoil: 0, idle: 0 },
  uncommon: { depth: 0, foil: 0.07, glare: 0.08, edgeFoil: 0.035, idle: 0 },
  rare: { depth: 0, foil: 0.2, glare: 0.18, edgeFoil: 0.08, idle: 0 },
  epic: { depth: 0, foil: 0.34, glare: 0.29, edgeFoil: 0.2, idle: 0 },
  legendary: { depth: 0.72, foil: 0.52, glare: 0.42, edgeFoil: 0.34, idle: 0.024 },
  mythic: { depth: 1, foil: 0.66, glare: 0.52, edgeFoil: 0.52, idle: 0.032 },
};

export function getCardFxProfile(rarity: CardRarity): CardFxProfile {
  return CARD_FX_PROFILES[rarity];
}

interface Point {
  x: number;
  y: number;
}

interface OrientationCalibration {
  angle: number;
  baseBeta: number;
  baseGamma: number;
}

type OrientationSubscriber = (event: DeviceOrientationEvent) => void;

const orientationSubscribers = new Set<OrientationSubscriber>();
let orientationListenerAttached = false;
let lastOrientationDispatch = 0;

function dispatchOrientation(event: DeviceOrientationEvent) {
  const now = getNow();
  if (now - lastOrientationDispatch < 33) return;
  lastOrientationDispatch = now;
  orientationSubscribers.forEach((subscriber) => subscriber(event));
}

function subscribeToOrientation(subscriber: OrientationSubscriber) {
  orientationSubscribers.add(subscriber);
  if (!orientationListenerAttached) {
    window.addEventListener("deviceorientation", dispatchOrientation, { passive: true });
    orientationListenerAttached = true;
  }
  return () => {
    orientationSubscribers.delete(subscriber);
    if (orientationSubscribers.size === 0 && orientationListenerAttached) {
      window.removeEventListener("deviceorientation", dispatchOrientation);
      orientationListenerAttached = false;
      lastOrientationDispatch = 0;
    }
  };
}

type DeviceOrientationEventWithPermission = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};

export interface CardFxWrapperProps {
  artKey: string | null;
  cardId?: string | null;
  children?: ReactNode;
  className?: string;
  compact?: boolean;
  depthAssets?: CardFxArtworkLayers;
  element: CardElement;
  rarity: CardRarity;
}

const SPRING = 0.09;
const DAMPING = 0.74;
const IDLE_DELAY = 1500;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getNow() {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

function getScreenAngle() {
  if (typeof window === "undefined") return 0;
  const screenAngle = window.screen.orientation?.angle;
  if (typeof screenAngle === "number") return ((screenAngle % 360) + 360) % 360;
  const legacyAngle = window.orientation;
  return typeof legacyAngle === "number" ? ((legacyAngle % 360) + 360) % 360 : 0;
}

function normalizeOrientation(beta: number, gamma: number, calibration: OrientationCalibration) {
  const betaDelta = beta - calibration.baseBeta;
  const gammaDelta = gamma - calibration.baseGamma;

  switch (calibration.angle) {
    case 90:
      return { x: clamp(betaDelta / 28, -1, 1), y: clamp(-gammaDelta / 28, -1, 1) };
    case 270:
      return { x: clamp(-betaDelta / 28, -1, 1), y: clamp(gammaDelta / 28, -1, 1) };
    case 180:
      return { x: clamp(-gammaDelta / 28, -1, 1), y: clamp(-betaDelta / 28, -1, 1) };
    default:
      return { x: clamp(gammaDelta / 28, -1, 1), y: clamp(betaDelta / 28, -1, 1) };
  }
}

function writeStyle(style: CSSStyleDeclaration, name: string, value: string | number) {
  style.setProperty(name, String(value));
}

export function CardFxWrapper({ artKey, cardId, children, className, compact = false, depthAssets, element, rarity }: CardFxWrapperProps) {
  const rootRef = useRef<HTMLSpanElement>(null);
  const frameRef = useRef<number | null>(null);
  const idleTimerRef = useRef<number | null>(null);
  const orientationTimeoutRef = useRef<number | null>(null);
  const lastOrientationRef = useRef(0);
  const tickRef = useRef<(time: number) => void>(() => undefined);
  const permissionRequestedRef = useRef(false);
  const reducedMotionRef = useRef(false);
  const pointerActiveRef = useRef(false);
  const orientationActiveRef = useRef(false);
  const lastInteractionRef = useRef(getNow());
  const pointerTargetRef = useRef<Point>({ x: 0, y: 0 });
  const orientationTargetRef = useRef<Point>({ x: 0, y: 0 });
  const positionRef = useRef<Point>({ x: 0, y: 0 });
  const velocityRef = useRef<Point>({ x: 0, y: 0 });
  const calibrationRef = useRef<OrientationCalibration | null>(null);
  const pointerBoundsRef = useRef<DOMRectReadOnly | null>(null);
  const idleActiveRef = useRef(false);
  const [idleActive, setIdleActive] = useState(false);
  const profile = useMemo(() => getCardFxProfile(rarity), [rarity]);
  const parallaxEnabled = profile.depth > 0;
  const hasLayeredArt = parallaxEnabled && Boolean(depthAssets?.background || depthAssets?.character || depthAssets?.foreground);

  const updateIdleActive = useCallback((active: boolean) => {
    if (idleActiveRef.current === active) return;
    idleActiveRef.current = active;
    setIdleActive(active);
  }, []);

  const applyFrame = useCallback((position: Point, velocity: Point) => {
    const root = rootRef.current;
    if (!root) return;

    const axis = Math.max(Math.abs(position.x), Math.abs(position.y));
    const bgAmp = parallaxEnabled ? -(1.2 + profile.depth * 2.8) : 0;
    const midAmp = parallaxEnabled ? -(2.8 + profile.depth * 7.5) : 0;
    const fgAmp = parallaxEnabled ? -(5.5 + profile.depth * 14) : 0;
    const cardTilt = profile.depth === 0 ? 0 : Math.min(4, 1 + profile.depth * 3.4);
    const bgX = position.x * bgAmp;
    const bgY = position.y * bgAmp;
    const midX = position.x * midAmp;
    const midY = position.y * midAmp;
    const fgX = position.x * fgAmp;
    const fgY = position.y * fgAmp;
    const speed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y);
    const aberration = speed < 0.004 ? 0 : Math.min(2, speed * 48);
    const foilOpacity = profile.foil * (0.42 + axis * 0.58);
    const edgeOpacity = profile.edgeFoil * (0.3 + axis * 0.7);
    const glareOpacity = profile.glare * (0.28 + axis * 0.72);

    writeStyle(root.style, "--rx", `${-position.y * cardTilt}deg`);
    writeStyle(root.style, "--ry", `${position.x * cardTilt}deg`);
    writeStyle(root.style, "--bgx", `${bgX}px`);
    writeStyle(root.style, "--bgy", `${bgY}px`);
    writeStyle(root.style, "--mx", `${midX}px`);
    writeStyle(root.style, "--my", `${midY}px`);
    writeStyle(root.style, "--fgx", `${fgX}px`);
    writeStyle(root.style, "--fgy", `${fgY}px`);
    writeStyle(root.style, "--single-x", `${parallaxEnabled ? midX * 0.42 : 0}px`);
    writeStyle(root.style, "--single-y", `${parallaxEnabled ? midY * 0.42 : 0}px`);
    writeStyle(root.style, "--bg-scale", 1.02 + axis * 0.01 * profile.depth);
    writeStyle(root.style, "--mid-scale", 1.04 + axis * 0.018 * profile.depth);
    writeStyle(root.style, "--fg-scale", 1.06 + axis * 0.025 * profile.depth);
    writeStyle(root.style, "--single-scale", 1.015 + axis * 0.01 * profile.depth);
    writeStyle(root.style, "--ui-x", `${-position.x * Math.min(2, 0.7 + profile.depth * 1.3)}px`);
    writeStyle(root.style, "--ui-y", `${-position.y * Math.min(2, 0.7 + profile.depth * 1.3)}px`);
    writeStyle(root.style, "--gx", `${50 + position.x * 42}%`);
    writeStyle(root.style, "--gy", `${50 + position.y * 42}%`);
    writeStyle(root.style, "--ao-x", `${50 - position.x * 11}%`);
    writeStyle(root.style, "--ao-y", `${50 - position.y * 11}%`);
    writeStyle(root.style, "--foil-opacity", foilOpacity);
    writeStyle(root.style, "--edge-opacity", edgeOpacity);
    writeStyle(root.style, "--glare-opacity", glareOpacity);
    writeStyle(root.style, "--glare-polish-opacity", glareOpacity * 0.48);
    writeStyle(root.style, "--aberration-x", `${aberration}px`);
    writeStyle(root.style, "--aberration-reverse-x", `${-aberration}px`);
    writeStyle(root.style, "--aberration-alpha", aberration / 2 * 0.24);
    writeStyle(root.style, "--character-shadow-x", `${-midX * 0.4}px`);
    writeStyle(root.style, "--character-shadow-y", `${-midY * 0.35 + 20}px`);
  }, [parallaxEnabled, profile]);

  const scheduleFrame = useCallback(() => {
    if (!parallaxEnabled || frameRef.current !== null || reducedMotionRef.current) return;
    frameRef.current = requestAnimationFrame((time) => tickRef.current(time));
  }, [parallaxEnabled]);

  const armIdleTimer = useCallback(() => {
    if (compact || profile.idle === 0 || reducedMotionRef.current || pointerActiveRef.current || orientationActiveRef.current) return;
    if (idleTimerRef.current !== null) window.clearTimeout(idleTimerRef.current);
    idleTimerRef.current = window.setTimeout(() => {
      idleTimerRef.current = null;
      updateIdleActive(true);
    }, IDLE_DELAY);
  }, [compact, profile.idle, updateIdleActive]);

  const settleToCenter = useCallback(() => {
    pointerTargetRef.current = { x: 0, y: 0 };
    lastInteractionRef.current = getNow();
    updateIdleActive(false);
    scheduleFrame();
    armIdleTimer();
  }, [armIdleTimer, scheduleFrame, updateIdleActive]);

  const tick = useCallback((time: number) => {
    frameRef.current = null;
    if (reducedMotionRef.current) {
      positionRef.current = { x: 0, y: 0 };
      velocityRef.current = { x: 0, y: 0 };
      applyFrame(positionRef.current, velocityRef.current);
      return;
    }

    const target = pointerActiveRef.current ? pointerTargetRef.current : orientationActiveRef.current ? orientationTargetRef.current : { x: 0, y: 0 };
    const position = positionRef.current;
    const velocity = velocityRef.current;
    velocity.x = (velocity.x + (target.x - position.x) * SPRING) * DAMPING;
    velocity.y = (velocity.y + (target.y - position.y) * SPRING) * DAMPING;
    position.x += velocity.x;
    position.y += velocity.y;
    applyFrame(position, velocity);

    const moving = Math.abs(target.x - position.x) > 0.001
      || Math.abs(target.y - position.y) > 0.001
      || Math.abs(velocity.x) > 0.001
      || Math.abs(velocity.y) > 0.001;
    if (moving) scheduleFrame();
    else armIdleTimer();
  }, [applyFrame, armIdleTimer, scheduleFrame]);

  const setPointerTarget = useCallback((event: ReactPointerEvent<HTMLSpanElement>) => {
    if (!parallaxEnabled) return;
    const bounds = pointerBoundsRef.current ?? event.currentTarget.getBoundingClientRect();
    if (bounds.width === 0 || bounds.height === 0) return;
    pointerBoundsRef.current = bounds;
    pointerTargetRef.current = {
      x: clamp(((event.clientX - bounds.left) / bounds.width) * 2 - 1, -1, 1),
      y: clamp(((event.clientY - bounds.top) / bounds.height) * 2 - 1, -1, 1),
    };
    pointerActiveRef.current = true;
    updateIdleActive(false);
    lastInteractionRef.current = getNow();
    if (idleTimerRef.current !== null) window.clearTimeout(idleTimerRef.current);
    scheduleFrame();
  }, [parallaxEnabled, scheduleFrame, updateIdleActive]);

  const requestOrientationPermission = useCallback(() => {
    if (permissionRequestedRef.current || typeof window === "undefined" || typeof window.DeviceOrientationEvent === "undefined") return;
    permissionRequestedRef.current = true;
    const orientationEvent = window.DeviceOrientationEvent as DeviceOrientationEventWithPermission;
    if (!orientationEvent.requestPermission) return;
    void orientationEvent.requestPermission().catch(() => undefined);
  }, []);

  const handleOrientation = useCallback((event: DeviceOrientationEvent) => {
    if (typeof event.beta !== "number" || typeof event.gamma !== "number") return;
    const angle = getScreenAngle();
    const previousCalibration = calibrationRef.current;
    if (!previousCalibration || previousCalibration.angle !== angle) {
      calibrationRef.current = { angle, baseBeta: event.beta, baseGamma: event.gamma };
      orientationTargetRef.current = { x: 0, y: 0 };
    } else {
      orientationTargetRef.current = normalizeOrientation(event.beta, event.gamma, previousCalibration);
    }
    orientationActiveRef.current = true;
    updateIdleActive(false);
    lastOrientationRef.current = getNow();
    lastInteractionRef.current = lastOrientationRef.current;
    if (idleTimerRef.current !== null) {
      window.clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
    if (orientationTimeoutRef.current === null) {
      const releaseOrientation = () => {
        orientationTimeoutRef.current = null;
        const elapsed = getNow() - lastOrientationRef.current;
        if (elapsed < 700) {
          orientationTimeoutRef.current = window.setTimeout(releaseOrientation, 700 - elapsed);
          return;
        }
        orientationActiveRef.current = false;
        orientationTargetRef.current = { x: 0, y: 0 };
        lastInteractionRef.current = getNow();
        scheduleFrame();
        armIdleTimer();
      };
      orientationTimeoutRef.current = window.setTimeout(releaseOrientation, 700);
    }
    scheduleFrame();
  }, [armIdleTimer, scheduleFrame, updateIdleActive]);

  tickRef.current = tick;

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    applyFrame(positionRef.current, velocityRef.current);
    if (!parallaxEnabled) return;
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateReducedMotion = () => {
      reducedMotionRef.current = mediaQuery.matches;
      updateIdleActive(false);
      if (reducedMotionRef.current) {
        if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
        positionRef.current = { x: 0, y: 0 };
        velocityRef.current = { x: 0, y: 0 };
        applyFrame(positionRef.current, velocityRef.current);
      } else {
        scheduleFrame();
        armIdleTimer();
      }
    };
    updateReducedMotion();
    mediaQuery.addEventListener("change", updateReducedMotion);
    const unsubscribeOrientation = !compact ? subscribeToOrientation(handleOrientation) : undefined;
    return () => {
      mediaQuery.removeEventListener("change", updateReducedMotion);
      unsubscribeOrientation?.();
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      if (idleTimerRef.current !== null) window.clearTimeout(idleTimerRef.current);
      if (orientationTimeoutRef.current !== null) window.clearTimeout(orientationTimeoutRef.current);
      frameRef.current = null;
      idleTimerRef.current = null;
      orientationTimeoutRef.current = null;
      pointerActiveRef.current = false;
      orientationActiveRef.current = false;
      orientationTargetRef.current = { x: 0, y: 0 };
      updateIdleActive(false);
    };
  }, [applyFrame, armIdleTimer, compact, handleOrientation, parallaxEnabled, scheduleFrame, updateIdleActive]);

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLSpanElement>) => {
    if (!parallaxEnabled) return;
    requestOrientationPermission();
    if (event.pointerType === "touch") setPointerTarget(event);
  }, [parallaxEnabled, requestOrientationPermission, setPointerTarget]);

  const handlePointerUp = useCallback((event: ReactPointerEvent<HTMLSpanElement>) => {
    if (!parallaxEnabled) return;
    if (event.pointerType === "touch") {
      pointerActiveRef.current = false;
      settleToCenter();
    }
  }, [parallaxEnabled, settleToCenter]);

  const handlePointerEnter = useCallback((event: ReactPointerEvent<HTMLSpanElement>) => {
    pointerBoundsRef.current = event.currentTarget.getBoundingClientRect();
  }, []);

  const handlePointerLeave = useCallback(() => {
    pointerBoundsRef.current = null;
    pointerActiveRef.current = false;
    settleToCenter();
  }, [settleToCenter]);

  const rootClassName = [
    "card-fx",
    hasLayeredArt ? "card-fx--layered" : "card-fx--single",
    parallaxEnabled ? "" : "card-fx--static",
    compact ? "card-fx--compact" : "",
    profile.idle > 0 ? "card-fx--idle-capable" : "",
    idleActive ? "card-fx--idle" : "",
    className,
  ].filter(Boolean).join(" ");
  const backgroundKey = hasLayeredArt
    ? depthAssets?.background ?? artKey
    : artKey ?? depthAssets?.background ?? null;

  return (
    <span
      className={rootClassName}
      onPointerCancel={parallaxEnabled ? settleToCenter : undefined}
      onPointerDown={parallaxEnabled ? handlePointerDown : undefined}
      onPointerEnter={parallaxEnabled ? handlePointerEnter : undefined}
      onPointerLeave={parallaxEnabled ? handlePointerLeave : undefined}
      onPointerMove={parallaxEnabled ? setPointerTarget : undefined}
      onPointerUp={parallaxEnabled ? handlePointerUp : undefined}
      ref={rootRef}
    >
      <span className="card-fx__viewport" aria-hidden="true">
        {hasLayeredArt ? (
          <>
            <span className="card-fx__layer card-fx__layer--background">
              <CardArtwork artKey={backgroundKey} cardId={cardId} element={element} />
            </span>
            {depthAssets?.character ? <span className="card-fx__layer card-fx__layer--character"><CardArtwork artKey={depthAssets.character} cardId={cardId} element={element} /></span> : null}
            {depthAssets?.foreground ? <span className="card-fx__layer card-fx__layer--foreground"><CardArtwork artKey={depthAssets.foreground} cardId={cardId} element={element} /></span> : null}
          </>
        ) : (
          <span className="card-fx__layer card-fx__layer--single">
            <CardArtwork artKey={artKey} cardId={cardId} element={element} />
          </span>
        )}
        <span className="card-fx__occlusion" />
        {profile.foil > 0 ? (
          <span className="card-fx__foil" aria-hidden="true">
            <span className="card-fx__foil-layer card-fx__foil-layer--spectral" />
            <span className="card-fx__foil-layer card-fx__foil-layer--texture" />
            <span className="card-fx__foil-layer card-fx__foil-layer--secondary" />
          </span>
        ) : null}
        {profile.glare > 0 ? <span className="card-fx__glare" /> : null}
        {profile.glare > 0 ? <span className="card-fx__glare-polish" /> : null}
      </span>
      {profile.edgeFoil > 0 ? <span className="card-fx__edge" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}
