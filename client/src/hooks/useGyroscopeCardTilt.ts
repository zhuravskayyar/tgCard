import { useEffect, type RefObject } from "react";

type OrientationPermissionEvent = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function angleDelta(value: number, origin: number) {
  let delta = value - origin;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return delta;
}

export function useGyroscopeCardTilt(cardRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const card = cardRef.current;
    if (!card || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const OrientationEvent = window.DeviceOrientationEvent as OrientationPermissionEvent | undefined;
    let sensorAttached = false;
    let permissionRequested = false;
    let gyroActive = false;
    let activeTouchId: number | null = null;
    let baseBeta: number | null = null;
    let baseGamma: number | null = null;

    function applyTilt(tiltX: number, tiltY: number) {
      const x = clamp(tiltX, -12, 12);
      const y = clamp(tiltY, -12, 12);
      card!.style.setProperty("--card-tilt-x", `${x.toFixed(2)}deg`);
      card!.style.setProperty("--card-tilt-y", `${y.toFixed(2)}deg`);
      card!.style.setProperty("--card-light-x", `${clamp(50 + y * 2.5, 15, 85).toFixed(1)}%`);
      card!.style.setProperty("--card-light-y", `${clamp(50 - x * 2.5, 15, 85).toFixed(1)}%`);
      card!.style.setProperty("--card-glare-opacity", `${clamp((Math.abs(x) + Math.abs(y)) / 75, 0, 0.24).toFixed(3)}`);
      card!.style.setProperty("--card-shadow-x", `${(-y * 0.45).toFixed(1)}px`);
      card!.style.setProperty("--card-shadow-y", `${(7 + Math.abs(x) * 0.4).toFixed(1)}px`);
    }

    function resetTilt() {
      applyTilt(0, 0);
    }

    function attachSensor() {
      if (!OrientationEvent || sensorAttached) return;
      window.addEventListener("deviceorientation", handleOrientation);
      sensorAttached = true;
    }

    function enableSensorFromGesture() {
      if (!OrientationEvent || permissionRequested) return;
      permissionRequested = true;
      if (typeof OrientationEvent.requestPermission !== "function") {
        attachSensor();
        return;
      }
      try {
        void OrientationEvent.requestPermission()
          .then((permission) => { if (permission === "granted") attachSensor(); })
          .catch(() => undefined);
      } catch {
        // Pointer tilt remains available when sensor permission cannot be requested.
      }
    }

    function handleOrientation(event: DeviceOrientationEvent) {
      if (event.beta === null || event.gamma === null) return;
      gyroActive = true;
      if (baseBeta === null || baseGamma === null) {
        baseBeta = event.beta;
        baseGamma = event.gamma;
        return;
      }
      const pitch = angleDelta(event.beta, baseBeta);
      const roll = angleDelta(event.gamma, baseGamma);
      applyTilt(-pitch * 0.32, roll * 0.38);
    }

    function handlePointerDown(event: PointerEvent) {
      enableSensorFromGesture();
      if (event.pointerType !== "touch") return;
      activeTouchId = event.pointerId;
      try { card!.setPointerCapture(event.pointerId); } catch { /* Capture is optional on older WebViews. */ }
      handlePointerMove(event);
    }

    function handlePointerMove(event: PointerEvent) {
      if (activeTouchId !== null && event.pointerId !== activeTouchId) return;
      if (activeTouchId === null && event.pointerType === "touch" && gyroActive) return;
      const bounds = card!.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      const x = clamp((event.clientX - bounds.left) / bounds.width, 0, 1) - 0.5;
      const y = clamp((event.clientY - bounds.top) / bounds.height, 0, 1) - 0.5;
      applyTilt(-y * 20, x * 20);
    }

    function handlePointerEnd(event: PointerEvent) {
      if (activeTouchId !== event.pointerId) return;
      activeTouchId = null;
      if (card!.hasPointerCapture(event.pointerId)) card!.releasePointerCapture(event.pointerId);
      if (!gyroActive) resetTilt();
    }

    function handlePointerLeave() {
      if (activeTouchId === null && !gyroActive) resetTilt();
    }

    if (OrientationEvent && typeof OrientationEvent.requestPermission !== "function") attachSensor();
    card.addEventListener("pointerdown", handlePointerDown);
    card.addEventListener("pointermove", handlePointerMove);
    card.addEventListener("pointerup", handlePointerEnd);
    card.addEventListener("pointercancel", handlePointerEnd);
    card.addEventListener("pointerleave", handlePointerLeave);

    return () => {
      card.removeEventListener("pointerdown", handlePointerDown);
      card.removeEventListener("pointermove", handlePointerMove);
      card.removeEventListener("pointerup", handlePointerEnd);
      card.removeEventListener("pointercancel", handlePointerEnd);
      card.removeEventListener("pointerleave", handlePointerLeave);
      if (sensorAttached) window.removeEventListener("deviceorientation", handleOrientation);
      ["--card-tilt-x", "--card-tilt-y", "--card-light-x", "--card-light-y", "--card-glare-opacity", "--card-shadow-x", "--card-shadow-y"]
        .forEach((property) => card.style.removeProperty(property));
    };
  }, [cardRef]);
}
