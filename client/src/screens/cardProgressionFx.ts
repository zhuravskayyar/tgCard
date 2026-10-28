import { playCardMaterialDestruction } from "../cards/cardMaterialShader";

type Point = { x: number; y: number };

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function fxEl(className: string, text = "", cssText = "") {
  const element = document.createElement("div");
  element.className = className;
  if (text) element.textContent = text;
  if (cssText) element.style.cssText = cssText;
  document.body.appendChild(element);
  return element;
}

function finishAndRemove(element: HTMLElement, animation: Animation, done?: () => void) {
  return new Promise<void>((resolve) => {
    const finish = () => {
      element.remove();
      done?.();
      resolve();
    };
    animation.onfinish = finish;
    animation.oncancel = finish;
  });
}

function fxFlight(
  element: HTMLElement,
  start: Point,
  control: Point,
  end: Point,
  duration: number,
  delay: number,
  startScale: number,
  done?: () => void,
) {
  const frames: Keyframe[] = [];
  for (let index = 0; index <= 14; index += 1) {
    const u = index / 14;
    const t = Math.pow(u, 1.9);
    const a = (1 - t) * (1 - t);
    const b = 2 * (1 - t) * t;
    const c = t * t;
    frames.push({
      transform: `translate(${a * start.x + b * control.x + c * end.x}px, ${a * start.y + b * control.y + c * end.y}px) translate(-50%, -50%) scale(${(startScale * (1 - 0.55 * t)).toFixed(3)})`,
      opacity: index < 2 ? u * 2 : u > 0.86 ? (1 - u) / 0.14 : 1,
      offset: u,
    });
  }
  return finishAndRemove(element, element.animate(frames, { duration, delay, easing: "linear", fill: "both" }), done);
}

function fxBurst(x: number, y: number, big: boolean, gold = false) {
  const goldClass = gold ? " gold" : "";
  const flash = fxEl("fxflash" + goldClass, "", `left:${x}px;top:${y}px;width:${big ? 190 : 120}px;height:${big ? 190 : 120}px`);
  const animations: Promise<void>[] = [finishAndRemove(flash, flash.animate([
    { transform: "translate(-50%,-50%) scale(.2)", opacity: 0.95 },
    { transform: `translate(-50%,-50%) scale(${big ? 1.7 : 1.2})`, opacity: 0 },
  ], { duration: big ? 650 : 380, easing: "ease-out" }))];

  if (!big) return Promise.all(animations).then(() => undefined);

  const ring = fxEl("fxring" + goldClass, "", `left:${x}px;top:${y}px;width:90px;height:90px`);
  animations.push(finishAndRemove(ring, ring.animate([
    { transform: "translate(-50%,-50%) scale(.2)", opacity: 1 },
    { transform: "translate(-50%,-50%) scale(4.2)", opacity: 0 },
  ], { duration: 800, easing: "cubic-bezier(.1,.6,.3,1)" })));

  for (let index = 0; index < 16; index += 1) {
    const angle = index / 16 * Math.PI * 2 + Math.random() * 0.4;
    const distance = 60 + Math.random() * 90;
    const spark = fxEl("fxp fxspark" + goldClass, "+", `left:${x}px;top:${y}px;font-size:${12 + Math.random() * 10}px`);
    animations.push(finishAndRemove(spark, spark.animate([
      { transform: "translate(-50%,-50%) scale(1)", opacity: 1 },
      { transform: `translate(calc(-50% + ${Math.cos(angle) * distance}px),calc(-50% + ${Math.sin(angle) * distance - 18}px)) scale(.3) rotate(${(Math.random() - 0.5) * 160}deg)`, opacity: 0 },
    ], { duration: 600 + Math.random() * 350, easing: "cubic-bezier(.1,.7,.3,1)" })));
  }
  return Promise.all(animations).then(() => undefined);
}

function animatePowerIncrease(target: HTMLElement, delta: number, initialPower: number, onPowerValueChange?: (power: number) => void) {
  const rect = target.getBoundingClientRect();
  const tx = rect.left + rect.width * (139.4 / 240);
  const ty = rect.top + rect.height * (36 / 312);
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const count = Math.min(delta, Math.min(14, 1 + Math.ceil(Math.log2(delta + 1))));
  const base = Math.floor(delta / count);
  const remainder = delta - base * count;
  const fontSize = Math.round(Math.min(34, 18 + Math.log10(delta + 1) * 3.4));
  let left = count;
  let fxGoal = initialPower;
  let shownPower = initialPower;
  let lastValue = initialPower;
  let countAnimation: { from: number; to: number; startedAt: number; duration: number } | null = null;
  let countFrame = 0;
  let lastPaint = 0;
  let resolveCount: (() => void) | null = null;
  let countFinished = Promise.resolve();
  const flights: Promise<void>[] = [];

  const countStep = (now: number) => {
    const animation = countAnimation;
    if (!animation) { countFrame = 0; return; }
    const progress = Math.min(1, (now - animation.startedAt) / animation.duration);
    const value = progress >= 1
      ? animation.to
      : Math.round(animation.from + (animation.to - animation.from) * (1 - Math.pow(1 - progress, 4)));
    shownPower = value;
    if ((value !== lastValue && now - lastPaint >= 30) || (progress >= 1 && value !== lastValue)) {
      onPowerValueChange?.(value);
      lastValue = value;
      lastPaint = now;
    }
    if (progress >= 1) {
      countAnimation = null;
      countFrame = 0;
      resolveCount?.();
      resolveCount = null;
      return;
    }
    countFrame = window.requestAnimationFrame(countStep);
  };

  const startCount = (goal: number) => {
    resolveCount?.();
    countFinished = new Promise<void>((resolve) => { resolveCount = resolve; });
    countAnimation = { from: shownPower, to: goal, startedAt: performance.now(), duration: 320 };
    if (!countFrame) countFrame = window.requestAnimationFrame(countStep);
  };

  for (let index = 0; index < count; index += 1) {
    const part = base + (index < remainder ? 1 : 0);
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.max(rect.width, rect.height) * (0.7 + Math.random() * 0.35);
    const start = { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius * 0.8 };
    const middleX = (start.x + tx) / 2;
    const middleY = (start.y + ty) / 2;
    const normalX = -(ty - start.y);
    const normalY = tx - start.x;
    const normalLength = Math.hypot(normalX, normalY) || 1;
    const sign = Math.random() < 0.5 ? -1 : 1;
    const bend = (0.18 + Math.random() * 0.22) * Math.hypot(tx - start.x, ty - start.y);
    const control = {
      x: middleX + normalX / normalLength * bend * sign,
      y: middleY + normalY / normalLength * bend * sign,
    };
    const duration = 620 + Math.random() * 320;
    const delay = index * (count > 8 ? 55 : 85);

    for (let trailIndex = 0; trailIndex < 3; trailIndex += 1) {
      const trail = trailIndex < 2;
      const particle = fxEl(
        "fxp" + (trail ? " fxtrail" : ""),
        `+${part}`,
        `font-size:${fontSize}px;${trail ? `filter:blur(${trailIndex ? 3 : 1.5}px);` : ""}`,
      );
      const isHead = trailIndex === 2;
      flights.push(fxFlight(
        particle,
        start,
        control,
        { x: tx, y: ty },
        duration,
        delay + (trail ? (trailIndex + 1) * 42 : 0),
        1,
        isHead ? () => {
          left -= 1;
          fxGoal += part;
          startCount(fxGoal);
          void fxBurst(tx, ty, left === 0);
          target.animate([
            { translate: "0 0" },
            { translate: "0 -3px" },
            { translate: "0 0" },
          ], { duration: 130 });
          if (left === 0) {
            target.animate([
              { scale: 1 },
              { scale: 1.06, offset: 0.3 },
              { scale: 1 },
            ], { duration: 520, easing: "ease-out" });
          }
        } : undefined,
      ));
    }
  }
  return Promise.all(flights).then(async () => { await countFinished; });
}

export async function playCardDestructionFx(source: HTMLElement | null) {
  if (!source) return;
  const reduceMotion = prefersReducedMotion();
  const shaderDestruction = !reduceMotion ? playCardMaterialDestruction(source, 2300) : null;
  if (shaderDestruction) {
    const card = source.querySelector<HTMLElement>(".deck-card") ?? source;
    const shake = card.animate(Array.from({ length: 26 }, (_, index) => {
      const amplitude = Math.sin(index / 25 * Math.PI) * 6;
      return {
        translate: `${((Math.random() - 0.5) * amplitude * 2).toFixed(1)}px ${((Math.random() - 0.5) * amplitude * 2).toFixed(1)}px`,
      };
    }), { duration: 1900, easing: "linear" }).finished.catch(() => undefined);
    await Promise.all([shaderDestruction, shake]);
    return;
  }
  source.style.transition = reduceMotion ? "none" : "opacity 1.4s ease-in,filter 1.4s ease-in";
  source.style.opacity = "0";
  source.style.filter = "blur(8px) brightness(2.4)";
  if (!reduceMotion) await new Promise<void>((resolve) => window.setTimeout(resolve, 1400));
}

export async function playCardPowerFx(target: HTMLElement | null, powerDelta: number, rarityChanged: boolean, initialPower = 0, onPowerValueChange?: (power: number) => void) {
  if (!target || prefersReducedMotion()) return;
  const effects: Promise<unknown>[] = [];

  if (rarityChanged) {
    effects.push(target.animate([
      { scale: 1 },
      { scale: 1.01, offset: 0.25 },
      { scale: 1.08, offset: 0.5 },
      { scale: 1 },
    ], { duration: 1500, easing: "ease-in-out" }).finished.catch(() => undefined));
  }
  const delta = Math.max(0, Math.floor(powerDelta));
  if (delta > 0) effects.push(animatePowerIncrease(target, delta, initialPower, onPowerValueChange));
  await Promise.all(effects);
}

export function syncCardProtectionFx(layer: HTMLElement, active: boolean) {
  const lock = layer.querySelector<HTMLElement>(".fx-lock");
  layer.classList.toggle("protected", active);
  if (!lock) return;
  lock.classList.toggle("on", active);
  lock.classList.toggle("closed", active);
  lock.classList.toggle("idle", active);
  lock.classList.remove("falling");
}

export function playCardProtectionFx(target: HTMLElement, layer: HTMLElement, active: boolean) {
  const lock = layer.querySelector<HTMLElement>(".fx-lock");
  const outline = layer.querySelector<SVGSVGElement>(".fx-outline");
  const sweep = layer.querySelector<HTMLElement>(".fx-sweep");
  if (!lock || !outline || !sweep) return;

  const calm = prefersReducedMotion();
  layer.classList.toggle("protected", active);

  if (active) {
    lock.classList.add("on");
    lock.classList.remove("closed", "idle", "falling");
    if (calm) {
      lock.classList.add("closed", "idle");
      return;
    }

    outline.animate([
      { opacity: 0, transform: "scale(.9)" },
      { opacity: 1, transform: "scale(1.04)", offset: 0.35 },
      { opacity: 0, transform: "scale(1)" },
    ], { duration: 1100, easing: "ease-out" });
    sweep.animate([
      { backgroundPosition: "160% 0", opacity: 1 },
      { backgroundPosition: "-60% 0", opacity: 1 },
    ], { duration: 850, easing: "ease-in-out" });
    const rect = target.getBoundingClientRect();
    void fxBurst(rect.left + rect.width / 2, rect.top + rect.height / 2, false, true);

    const entrance = lock.animate([
      { transform: "translateY(-200%) scale(1.9) rotate(-14deg)", opacity: 0 },
      { transform: "translateY(0) scale(1) rotate(0)", opacity: 1, offset: 0.55 },
      { transform: "rotate(9deg)", offset: 0.72 },
      { transform: "rotate(-5deg)", offset: 0.86 },
      { transform: "rotate(0deg)", opacity: 1 },
    ], { duration: 950, delay: 420, easing: "cubic-bezier(.3,.9,.4,1)", fill: "backwards" });
    entrance.onfinish = () => {
      if (!layer.classList.contains("protected")) return;
      lock.classList.add("closed");
      window.setTimeout(() => {
        if (!layer.isConnected || !layer.classList.contains("protected")) return;
        const lockRect = lock.getBoundingClientRect();
        void fxBurst(lockRect.left + lockRect.width / 2, lockRect.top + lockRect.height * 0.72, true, true);
        lock.classList.add("idle");
        target.animate([
          { scale: 1 },
          { scale: 1.04, offset: 0.3 },
          { scale: 1 },
        ], { duration: 420, easing: "ease-out" });
      }, 190);
    };
    return;
  }

  lock.classList.remove("closed", "idle");
  if (calm) {
    lock.classList.remove("on");
    return;
  }
  lock.classList.add("falling");
  const fall = lock.animate([
    { transform: "rotate(0deg)", opacity: 1 },
    { transform: "rotate(14deg)", opacity: 1, offset: 0.18 },
    { transform: "translateY(260%) rotate(55deg)", opacity: 0 },
  ], { duration: 800, delay: 160, easing: "cubic-bezier(.5,0,.9,.5)", fill: "both" });
  fall.onfinish = () => {
    if (!layer.classList.contains("protected")) lock.classList.remove("on", "falling");
  };
}
