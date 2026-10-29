import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { CardElement, CardRarity, DuelExchange } from "@cardastika/shared";
import { BRIGHT_CUT_MATERIALS, ELEMENT_FINISH, GLOW, getBrightCutMaterialId } from "../cards/brightCutModel";
import { holdCardMaterialAnimation } from "../cards/cardMaterialShader";
import { CardFxWrapper } from "./CardFxWrapper";
import { CardHud } from "./CardHud";
import "./battle-attack.css";

/** Longest strike (weak tier: slow flight) including the flip to the next cards; screens also wait for the end event. */
export const BATTLE_ATTACK_DURATION_MS = 1550;
/** Fired once the strike has really finished, so screens never cut it short when the first frames were slow. */
export const BATTLE_ATTACK_END_EVENT = "cardastika:battle-attack-end";

function announceAttackEnd() {
  window.dispatchEvent(new Event(BATTLE_ATTACK_END_EVENT));
}

type Tier = "weak" | "even" | "strong";
type Point = { x: number; y: number };

interface Geometry {
  player: CSSProperties;
  enemy: CSSProperties;
  from: DOMRect;
  to: DOMRect;
  origin: DOMRect;
}

// Timings per tier: a weak hit flies slowly and lands softly, a strong one is fast and heavy.
const FLIGHT_MS: Record<Tier, number> = { weak: 480, even: 380, strong: 320 };
const HIT_MS: Record<Tier, number> = { weak: 70, even: 120, strong: 220 };
const FORCE: Record<Tier, number> = { weak: 0.55, even: 1, strong: 1.8 };
const SHAKE: Record<Tier, [number, number]> = { weak: [3, 240], even: [7, 360], strong: [15, 620] };
const RECOIL_MS: Record<Tier, number> = { weak: 380, even: 520, strong: 760 };
const TIER_LABEL: Record<Tier, string> = { weak: "Слабкий удар", even: "Рівний удар", strong: "Сильний удар!" };
const RISE_MS = 260;
const RETURN_MS = 520;
const FLIP_OUT_MS = 200;
const FLIP_IN_MS = 260;
// Particles live at most this many 60fps frames so the burst fades while the card returns.
const MAX_PARTICLE_FRAMES = 42;

const tierOf = (multiplier: number): Tier => multiplier < 1 ? "weak" : multiplier > 1 ? "strong" : "even";
const rnd = (min: number, max: number) => min + Math.random() * (max - min);
const pick = <T,>(items: readonly T[]) => items[Math.floor(Math.random() * items.length)]!;
const rgba = (hex: string, alpha: number) => {
  const value = parseInt(hex.slice(1), 16);
  return `rgba(${value >> 16},${(value >> 8) & 255},${value & 255},${alpha})`;
};
const transform = (x: number, y: number, rotateY: number, rotateZ: number, scale: number) =>
  `perspective(900px) translate(${x}px, ${y}px) rotateY(${rotateY}deg) rotateZ(${rotateZ}deg) scale(${scale})`;
const materialFor = (rarity: CardRarity) => BRIGHT_CUT_MATERIALS.find((material) => material.id === getBrightCutMaterialId(rarity)) ?? BRIGHT_CUT_MATERIALS[0]!;

type ParticleKind = "glow" | "smoke" | "ember" | "spark" | "drop" | "ring" | "rock" | "leaf" | "shred" | "star" | "bolt" | "crack";
interface Particle {
  kind: ParticleKind;
  x: number; y: number; vx: number; vy: number;
  gravity: number; drag: number;
  life: number; maxLife: number; delay: number;
  size: number; grow: number; squash: number; width: number;
  rotation: number; spin: number; color: string; alpha: number;
  points?: Array<[number, number]>;
}

/** One canvas of short-lived impact particles, ported from the Cardastika duel FX stand. */
class ImpactCanvas {
  private particles: Particle[] = [];
  private frame = 0;
  private last = 0;
  constructor(private readonly context: CanvasRenderingContext2D, private readonly width: number, private readonly height: number) {}

  add(partial: Partial<Particle> & { kind: ParticleKind }) {
    const life = Math.min(MAX_PARTICLE_FRAMES, partial.life ?? 30);
    const particle: Particle = {
      x: 0, y: 0, vx: 0, vy: 0, gravity: 0, drag: 1, delay: 0, size: 3, grow: 0, squash: 1, width: 1,
      rotation: 0, spin: 0, color: "#ffffff", alpha: 1, ...partial, life, maxLife: life,
    };
    if (particle.kind === "rock") {
      particle.points = Array.from({ length: 5 }, (_, index) => {
        const angle = index / 5 * Math.PI * 2 + rnd(-0.3, 0.3);
        const radius = particle.size * rnd(0.6, 1.1);
        return [Math.cos(angle) * radius, Math.sin(angle) * radius] as [number, number];
      });
    }
    this.particles.push(particle);
    if (!this.frame) {
      this.last = performance.now();
      this.frame = requestAnimationFrame(this.loop);
    }
  }

  stop() {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.particles = [];
    this.context.clearRect(0, 0, this.width, this.height);
  }

  private loop = (now: number) => {
    const step = Math.min(2.5, (now - this.last) / 16.67);
    this.last = now;
    const context = this.context;
    context.clearRect(0, 0, this.width, this.height);
    context.lineCap = "round";
    context.lineJoin = "round";
    this.particles = this.particles.filter((particle) => particle.life > 0);
    for (const particle of this.particles) {
      if (particle.delay > 0) { particle.delay -= step; continue; }
      particle.life -= step;
      const remaining = Math.max(0, particle.life / particle.maxLife);
      particle.vx *= particle.drag ** step;
      particle.vy = particle.vy * particle.drag ** step + particle.gravity * step;
      particle.x += particle.vx * step;
      particle.y += particle.vy * step;
      particle.rotation += particle.spin * step;
      this.draw(particle, remaining, Math.min(1, remaining * 1.5) * particle.alpha);
    }
    context.globalAlpha = 1;
    context.globalCompositeOperation = "source-over";
    if (this.particles.length) this.frame = requestAnimationFrame(this.loop);
    else { this.frame = 0; context.clearRect(0, 0, this.width, this.height); }
  };

  private blob(x: number, y: number, radius: number, color: string, alpha: number) {
    if (radius <= 0 || alpha <= 0) return;
    const gradient = this.context.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, rgba(color, alpha));
    gradient.addColorStop(0.45, rgba(color, alpha * 0.4));
    gradient.addColorStop(1, rgba(color, 0));
    this.context.fillStyle = gradient;
    this.context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  private path(points: Array<[number, number]>) {
    this.context.beginPath();
    points.forEach(([x, y], index) => index ? this.context.lineTo(x, y) : this.context.moveTo(x, y));
  }

  private draw(p: Particle, remaining: number, alpha: number) {
    const context = this.context;
    context.globalCompositeOperation = ["smoke", "rock", "leaf", "shred"].includes(p.kind) ? "source-over" : "lighter";
    switch (p.kind) {
      case "glow": this.blob(p.x, p.y, p.size * (1 + p.grow * (1 - remaining)), p.color, alpha); break;
      case "smoke": this.blob(p.x, p.y, p.size * (1 + p.grow * (1 - remaining)), p.color, alpha * 0.55); break;
      case "ember": this.blob(p.x, p.y, p.size * 4 * remaining + 2, p.color, alpha * (0.6 + 0.4 * Math.random())); break;
      case "spark":
        context.strokeStyle = rgba(p.color, alpha);
        context.lineWidth = p.size * (0.4 + remaining * 0.6);
        context.beginPath();
        context.moveTo(p.x, p.y);
        context.lineTo(p.x - p.vx * 1.7, p.y - p.vy * 1.7);
        context.stroke();
        break;
      case "drop":
        context.fillStyle = rgba(p.color, alpha);
        context.beginPath();
        context.ellipse(p.x, p.y, p.size, p.size * 1.5, Math.atan2(p.vy, p.vx) + Math.PI / 2, 0, Math.PI * 2);
        context.fill();
        break;
      case "ring": {
        const radius = p.size + p.grow * Math.sqrt(1 - remaining);
        context.strokeStyle = rgba(p.color, alpha);
        context.lineWidth = p.width * remaining + 0.5;
        context.beginPath();
        context.ellipse(p.x, p.y, radius, radius * p.squash, 0, 0, Math.PI * 2);
        context.stroke();
        break;
      }
      case "rock":
        context.save();
        context.translate(p.x, p.y);
        context.rotate(p.rotation);
        context.globalAlpha = Math.min(1, remaining * 2);
        context.fillStyle = p.color;
        this.path(p.points!);
        context.closePath();
        context.fill();
        context.strokeStyle = "rgba(255,230,180,.35)";
        context.lineWidth = 1;
        context.stroke();
        context.restore();
        break;
      case "leaf":
        context.fillStyle = rgba(p.color, Math.min(1, remaining * 2));
        context.beginPath();
        context.ellipse(p.x, p.y, p.size, p.size * 0.4, p.rotation, 0, Math.PI * 2);
        context.fill();
        break;
      case "shred":
        context.save();
        context.translate(p.x, p.y);
        context.rotate(p.rotation);
        context.scale(1, Math.cos(p.rotation * 1.7));
        context.fillStyle = rgba(p.color, Math.min(1, remaining * 2));
        context.fillRect(-p.size, -p.size * 0.45, p.size * 2, p.size * 0.9);
        context.restore();
        break;
      case "star": {
        const size = p.size * Math.sin(Math.PI * (1 - remaining));
        context.fillStyle = rgba(p.color, p.alpha);
        context.save();
        context.translate(p.x, p.y);
        context.rotate(0.35);
        context.beginPath();
        context.moveTo(0, -size);
        context.quadraticCurveTo(0, 0, size, 0);
        context.quadraticCurveTo(0, 0, 0, size);
        context.quadraticCurveTo(0, 0, -size, 0);
        context.quadraticCurveTo(0, 0, 0, -size);
        context.fill();
        context.restore();
        this.blob(p.x, p.y, size * 0.9, p.color, p.alpha * 0.5 * Math.sin(Math.PI * (1 - remaining)));
        break;
      }
      case "bolt": {
        const flicker = Math.random() < 0.25 ? 0.35 : 1;
        ([[p.width * 5, 0.25], [p.width * 2, 0.6], [p.width * 0.8, 1]] as const).forEach(([lineWidth, strength], layer) => {
          context.strokeStyle = rgba(layer === 2 ? "#ffffff" : p.color, Math.min(1, alpha * strength * flicker));
          context.lineWidth = lineWidth;
          this.path(p.points!);
          context.stroke();
        });
        break;
      }
      case "crack":
        context.strokeStyle = rgba(p.color, alpha * 0.8);
        context.lineWidth = p.width;
        this.path(p.points!);
        context.stroke();
        break;
    }
  }
}

function boltPaths(x: number, y: number, angle: number, length: number, width: number): Array<{ points: Array<[number, number]>; width: number }> {
  const branches: Array<{ points: Array<[number, number]>; width: number }> = [];
  const points: Array<[number, number]> = [[x, y]];
  let px = x;
  let py = y;
  let heading = angle;
  const segments = Math.max(4, Math.floor(length / 14));
  for (let index = 0; index < segments; index += 1) {
    heading += rnd(-0.55, 0.55);
    px += Math.cos(heading) * length / segments;
    py += Math.sin(heading) * length / segments;
    points.push([px, py]);
    if (length > 45 && Math.random() < 0.2) branches.push(...boltPaths(px, py, heading + rnd(-1.1, 1.1), length * 0.4, width * 0.6));
  }
  branches.push({ points, width });
  return branches;
}

/** Attacker's element shapes the burst; the target's material decides sparks (metal) or shreds (parchment). */
function burst(fx: ImpactCanvas, at: Point, element: CardElement, targetRarity: CardRarity, tier: Tier, direction: Point) {
  const force = FORCE[tier];
  const soft = Math.sqrt(force);
  const count = (value: number) => Math.round(value * force);
  const finish = ELEMENT_FINISH[element];
  const glow = GLOW[element];
  const material = materialFor(targetRarity);
  const pushX = direction.x * 3 * soft;
  const pushY = direction.y * 3 * soft;
  const { x, y } = at;

  fx.add({ kind: "glow", x, y, size: 80 * force, grow: 1, life: 12, color: "#ffffff" });
  fx.add({ kind: "glow", x, y, size: 120 * force, grow: 0.8, life: 28, color: glow, alpha: 0.9 });
  fx.add({ kind: "ring", x, y, size: 8, grow: 80 * force, width: 6 * soft, life: 24, color: finish.core });
  if (tier !== "weak") fx.add({ kind: "ring", x, y, size: 4, grow: 130 * force, width: 3, life: 36, color: glow, squash: element === "water" ? 0.35 : 1 });
  if (tier === "strong") {
    fx.add({ kind: "glow", x, y, size: 300, grow: 0.3, life: 10, color: "#ffffff", alpha: 0.6 });
    for (let index = 0; index < 8; index += 1) {
      let heading = rnd(0, Math.PI * 2);
      let px = x;
      let py = y;
      const points: Array<[number, number]> = [[x, y]];
      for (let segment = 0; segment < 8; segment += 1) {
        heading += rnd(-0.4, 0.4);
        px += Math.cos(heading) * rnd(10, 18);
        py += Math.sin(heading) * rnd(10, 18);
        points.push([px, py]);
      }
      fx.add({ kind: "crack", points, width: 1.6, color: finish.core, life: 55 });
    }
  }

  if (element === "fire") {
    for (let index = 0; index < count(28); index += 1) {
      const angle = rnd(0, Math.PI * 2);
      const speed = rnd(2, 8) * soft;
      fx.add({ kind: "ember", x, y, vx: Math.cos(angle) * speed + pushX, vy: Math.sin(angle) * speed + pushY, gravity: -0.05, drag: 0.965, life: rnd(40, 85), size: rnd(1.5, 3.2), color: pick([glow, finish.spark, "#ff4a1a"]) });
    }
    for (let index = 0; index < count(8); index += 1) fx.add({ kind: "smoke", x: x + rnd(-24, 24), y: y + rnd(-24, 24), vy: -rnd(0.3, 1.1), life: rnd(55, 95), size: rnd(20, 34), grow: 1.3, color: "#241812" });
    for (let index = 0; index < count(5); index += 1) fx.add({ kind: "glow", x: x + rnd(-20, 20), y: y + rnd(-20, 20), vx: rnd(-1, 1), vy: -rnd(0.5, 2), life: rnd(25, 45), size: rnd(26, 44), grow: -0.4, color: "#ff6a1a" });
  } else if (element === "water") {
    for (let index = 0; index < count(36); index += 1) {
      const angle = -1.57 + rnd(-1.3, 1.3);
      const speed = rnd(3, 10) * soft;
      fx.add({ kind: "drop", x, y, vx: Math.cos(angle) * speed + pushX, vy: Math.sin(angle) * speed, gravity: 0.28, life: rnd(40, 70), size: rnd(1.4, 3.4), color: pick(["#d8f2ff", "#6cc8ff", "#ffffff"]) });
    }
    for (let index = 0; index < count(6); index += 1) fx.add({ kind: "glow", x: x + rnd(-25, 25), y: y + rnd(-20, 20), vy: -rnd(0.2, 1), life: rnd(30, 50), size: rnd(26, 46), grow: 0.8, color: finish.rim, alpha: 0.5 });
    fx.add({ kind: "ring", x, y, size: 6, grow: 100 * force, width: 3, life: 40, color: "#d8f2ff", squash: 0.35, delay: 4 });
  } else if (element === "earth") {
    for (let index = 0; index < count(16); index += 1) {
      const angle = rnd(0, Math.PI * 2);
      const speed = rnd(2, 8) * soft;
      fx.add({ kind: "rock", x, y, vx: Math.cos(angle) * speed + pushX, vy: Math.sin(angle) * speed - 2, gravity: 0.3, drag: 0.985, life: rnd(45, 70), size: rnd(3, 7), spin: rnd(-0.3, 0.3), color: pick(["#5b4631", "#7a5f3d", "#3f3224"]) });
    }
    for (let index = 0; index < count(9); index += 1) fx.add({ kind: "smoke", x: x + rnd(-26, 26), y: y + rnd(-18, 18), vx: rnd(-1, 1), vy: -rnd(0.1, 0.6), life: rnd(50, 90), size: rnd(22, 38), grow: 1.1, color: "#9b845f" });
    for (let index = 0; index < count(12); index += 1) {
      const angle = rnd(0, Math.PI * 2);
      const speed = rnd(1.5, 5) * soft;
      fx.add({ kind: "leaf", x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, gravity: 0.04, drag: 0.96, spin: rnd(-0.2, 0.2), life: rnd(55, 95), size: rnd(4, 8), color: pick(["#8fdc4e", "#5aa83a", "#c6f08a"]) });
    }
  } else {
    const bolts = { weak: 2, even: 4, strong: 8 }[tier];
    for (let index = 0; index < bolts; index += 1) boltPaths(x, y, rnd(0, Math.PI * 2), rnd(60, 140) * soft, 2.2).forEach((bolt) => fx.add({ kind: "bolt", points: bolt.points, width: bolt.width, color: glow, life: rnd(8, 16) }));
    for (let index = 0; index < Math.ceil(bolts / 2); index += 1) boltPaths(x, y, rnd(0, Math.PI * 2), rnd(50, 100) * soft, 1.6).forEach((bolt) => fx.add({ kind: "bolt", points: bolt.points, width: bolt.width, color: glow, life: rnd(6, 12), delay: 6 }));
    for (let index = 0; index < count(24); index += 1) {
      const angle = rnd(0, Math.PI * 2);
      const speed = rnd(6, 15) * soft;
      fx.add({ kind: "spark", x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, drag: 0.9, life: rnd(14, 28), size: 1.6, color: finish.core });
    }
  }

  if (material.metal) {
    for (let index = 0; index < count(22); index += 1) {
      const angle = rnd(0, Math.PI * 2);
      const speed = rnd(3, 12) * soft;
      fx.add({ kind: "spark", x, y, vx: Math.cos(angle) * speed + pushX, vy: Math.sin(angle) * speed + pushY, gravity: 0.35, drag: 0.985, life: rnd(28, 55), size: 1.4, color: pick([material.light, material.stroke]) });
    }
    for (let index = 0; index < Math.ceil(count(3)); index += 1) fx.add({ kind: "star", x: x + rnd(-45, 45), y: y + rnd(-60, 60), life: rnd(24, 36), size: rnd(14, 28) * soft, color: material.stroke, delay: rnd(0, 10) });
  } else {
    for (let index = 0; index < count(16); index += 1) {
      const angle = rnd(0, Math.PI * 2);
      const speed = rnd(2, 8) * soft;
      fx.add({ kind: "shred", x, y, vx: Math.cos(angle) * speed + pushX, vy: Math.sin(angle) * speed + pushY, gravity: 0.12, drag: 0.97, spin: rnd(-0.4, 0.4), life: rnd(55, 90), size: rnd(3, 6), color: pick([material.base[2]!, material.base[3]!, material.base[4]!]) });
    }
  }
}

function shakeBoard(board: HTMLElement, tier: Tier) {
  const [amplitude, duration] = SHAKE[tier];
  const frames = Array.from({ length: 9 }, (_, index) => {
    const decay = amplitude * (1 - index / 8) ** 2;
    return { translate: index === 8 ? "0 0" : `${rnd(-decay, decay)}px ${rnd(-decay, decay)}px` };
  });
  board.animate(frames, { duration, easing: "linear" });
}

/** One measured attack motion shared by every battle mode. */
export function BattleAttackAnimation({ exchange }: { exchange: DuelExchange }) {
  const layer = useRef<HTMLDivElement>(null);
  const impactCanvas = useRef<HTMLCanvasElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const targetRef = useRef<HTMLDivElement>(null);
  const slotCards = useRef<{ player: HTMLElement; enemy: HTMLElement } | null>(null);
  const [geometry, setGeometry] = useState<Geometry | null>(null);
  const [damage, setDamage] = useState<{ tier: Tier; at: Point; counterAt: Point } | null>(null);
  const tier = tierOf(exchange.playerMultiplier);

  // The strike gets the main thread: idle card shading pauses while it plays.
  useLayoutEffect(() => holdCardMaterialAnimation(), []);

  useLayoutEffect(() => {
    const root = layer.current;
    const board = root?.parentElement;
    if (!root || !board) return;
    const slotCard = (row: Element | null) => {
      const slot = row?.children[exchange.slotIndex];
      return (slot?.matches(".duel-card") ? slot : slot?.querySelector(".duel-card, .arena-hidden-card")) as HTMLElement | null;
    };
    const player = slotCard(board.querySelector(".duel-card-row--player, .arena-card-row:not(.arena-card-row--target)"));
    const enemy = slotCard(board.querySelector(".duel-card-row--enemy, .arena-card-row--target"));
    if (!player || !enemy) {
      announceAttackEnd();
      return;
    }
    // Size comes from layout, centre from the screen box: a card caught mid-flip still measures at full size.
    const settled = (card: HTMLElement) => {
      const rect = card.getBoundingClientRect();
      const width = card.offsetWidth;
      const height = card.offsetHeight;
      return new DOMRect(rect.left + rect.width / 2 - width / 2, rect.top + rect.height / 2 - height / 2, width, height);
    };
    const origin = root.getBoundingClientRect();
    const from = settled(player);
    const to = settled(enemy);
    const box = (rect: DOMRect): CSSProperties => ({ left: rect.left - origin.left, top: rect.top - origin.top, width: rect.width, height: rect.height });
    setGeometry({ player: box(from), enemy: box(to), from, to, origin });
    slotCards.current = { player, enemy };
    player.dataset.attackCovered = "true";
    enemy.dataset.attackCovered = "true";
    return () => {
      slotCards.current = null;
      delete player.dataset.attackCovered;
      delete enemy.dataset.attackCovered;
    };
  }, [exchange]);

  useLayoutEffect(() => {
    const root = layer.current;
    const canvas = impactCanvas.current;
    const ghost = ghostRef.current;
    const target = targetRef.current;
    const board = root?.parentElement;
    if (!geometry || !root || !canvas || !ghost || !target || !board) return;

    const width = geometry.origin.width;
    const height = geometry.origin.height;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(width * ratio));
    canvas.height = Math.max(1, Math.round(height * ratio));
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    const fx = new ImpactCanvas(context, width, height);

    const { from, to, origin } = geometry;
    const dx = to.left - from.left;
    const dy = to.top - from.top;
    const length = Math.hypot(dx, dy) || 1;
    const direction = { x: dx / length, y: dy / length };
    const impact = { x: to.left - origin.left + to.width / 2, y: to.top - origin.top + to.height / 2 };
    const counterAt = { x: from.left - origin.left + from.width / 2, y: from.top - origin.top + from.height / 2 };
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const glow = GLOW[exchange.playerCard.element];
    let cancelled = false;
    let trailFrame = 0;
    const timers: number[] = [];

    const strike = async () => {
      const options = { fill: "forwards" as const };
      if (reducedMotion) {
        burst(fx, impact, exchange.playerCard.element, exchange.enemyCard.rarity, "weak", direction);
        setDamage({ tier, at: impact, counterAt });
        await new Promise<void>((resolve) => { timers.push(window.setTimeout(resolve, 700)); });
        return;
      }
      const spin = 360;
      await ghost.animate([{ transform: transform(0, 0, 0, 0, 1) }, { transform: transform(0, 20, 0, 7, 1.12) }], { ...options, duration: RISE_MS, easing: "ease-out" }).finished;
      if (cancelled) return;
      ghost.style.filter = `drop-shadow(0 0 14px ${glow}) drop-shadow(0 18px 14px #000a)`;
      const trail = () => {
        const rect = ghost.getBoundingClientRect();
        const x = rect.left - origin.left + rect.width / 2;
        const y = rect.top - origin.top + rect.height / 2;
        fx.add({ kind: "glow", x, y, size: 34, grow: -0.4, life: 16, color: glow, alpha: 0.55 });
        for (let index = 0; index < 2; index += 1) fx.add({ kind: "spark", x: x + rnd(-26, 26), y: y + rnd(-34, 34), vx: rnd(-1.2, 1.2), vy: rnd(-1.2, 1.2), drag: 0.95, life: rnd(14, 24), size: 1.4, color: glow });
        trailFrame = requestAnimationFrame(trail);
      };
      trailFrame = requestAnimationFrame(trail);
      await ghost.animate([
        { transform: transform(0, 20, 0, 7, 1.12) },
        { transform: transform(dx / 2, dy / 2, spin / 2, 0, 1.22), offset: 0.5 },
        { transform: transform(dx, dy, spin, 0, 0.94) },
      ], { ...options, duration: FLIGHT_MS[tier], easing: "cubic-bezier(.55,0,.9,.5)" }).finished;
      cancelAnimationFrame(trailFrame);
      if (cancelled) return;

      burst(fx, impact, exchange.playerCard.element, exchange.enemyCard.rarity, tier, direction);
      shakeBoard(board, tier);
      setDamage({ tier, at: impact, counterAt });
      const force = FORCE[tier];
      target.animate([
        { transform: "none", filter: "brightness(3) saturate(.4)" },
        { transform: `translate(${direction.x * 16 * force}px, ${direction.y * 16 * force}px) rotate(${direction.x * 5 * force}deg) scale(.95)`, filter: "brightness(1.6)", offset: 0.25 },
        { transform: `translate(${-direction.x * 5 * force}px, ${-direction.y * 5 * force}px) rotate(${-direction.x * 2 * force}deg)`, offset: 0.6 },
        { transform: "none", filter: "none" },
      ], { duration: RECOIL_MS[tier], easing: "ease-out" });
      if (tier === "strong") board.animate([{ scale: "1" }, { scale: "1.02" }, { scale: "1" }], { duration: 300, easing: "ease-out" });

      await ghost.animate([
        { transform: transform(dx, dy, spin, 0, 0.94) },
        { transform: transform(dx, dy, spin, 8, 0.8), offset: 0.3 },
        { transform: transform(dx - direction.x * 12, dy - direction.y * 12, spin, 6, 0.97) },
      ], { ...options, duration: HIT_MS[tier], easing: "ease-out" }).finished;
      if (cancelled) return;
      ghost.style.filter = "";
      await ghost.animate([
        { transform: transform(dx - direction.x * 12, dy - direction.y * 12, spin, 6, 0.97) },
        { transform: transform(dx / 2, dy / 2 + 30, spin / 2, 0, 1.1), offset: 0.5 },
        { transform: transform(0, 0, 0, 0, 1) },
      ], { ...options, duration: RETURN_MS, easing: "ease-in-out" }).finished;
      if (cancelled) return;
      const flipOut = [{ transform: "perspective(900px) rotateY(0deg)" }, { transform: "perspective(900px) rotateY(90deg)" }];
      await Promise.all([
        ghost.animate(flipOut, { ...options, duration: FLIP_OUT_MS, easing: "ease-in" }).finished,
        target.animate(flipOut, { ...options, duration: FLIP_OUT_MS, easing: "ease-in" }).finished,
      ]);
      if (cancelled) return;
      // Edge-on now: reveal the fresh cards that replaced the used pair and turn them face up.
      const cards = slotCards.current;
      if (cards) {
        const flipIn = [{ transform: "perspective(900px) rotateY(-90deg)" }, { transform: "perspective(900px) rotateY(0deg)" }];
        for (const card of [cards.player, cards.enemy]) {
          delete card.dataset.attackCovered;
          card.animate(flipIn, { duration: FLIP_IN_MS, easing: "ease-out" });
        }
        ghost.style.visibility = "hidden";
        target.style.visibility = "hidden";
      }
    };

    strike().then(() => { if (!cancelled) announceAttackEnd(); }).catch(() => { if (!cancelled) announceAttackEnd(); });

    return () => {
      cancelled = true;
      cancelAnimationFrame(trailFrame);
      timers.forEach((timer) => window.clearTimeout(timer));
      fx.stop();
    };
  }, [exchange, geometry, tier]);

  return (
    <div ref={layer} className="battle-attack" aria-hidden="true">
      <canvas ref={impactCanvas} className="battle-attack__fx" />
      {geometry ? (
        <>
          <div ref={targetRef} className={`duel-card battle-attack__card battle-attack__card--enemy deck-card--${exchange.enemyCard.element} deck-card--${exchange.enemyCard.rarity}`} style={geometry.enemy}>
            <CardFxWrapper artKey={exchange.enemyCard.artKey} cardId={exchange.enemyCard.cardId} compact element={exchange.enemyCard.element} rarity={exchange.enemyCard.rarity}>
              <CardHud element={exchange.enemyCard.element} power={exchange.enemyCard.finalPower} rarity={exchange.enemyCard.rarity} staticMaterial />
            </CardFxWrapper>
          </div>
          <div ref={ghostRef} className={`duel-card battle-attack__card battle-attack__card--player deck-card--${exchange.playerCard.element} deck-card--${exchange.playerCard.rarity}`} style={geometry.player}>
            <CardFxWrapper artKey={exchange.playerCard.artKey} cardId={exchange.playerCard.cardId} compact element={exchange.playerCard.element} rarity={exchange.playerCard.rarity}>
              <CardHud element={exchange.playerCard.element} power={exchange.playerCard.finalPower} rarity={exchange.playerCard.rarity} staticMaterial />
            </CardFxWrapper>
          </div>
        </>
      ) : null}
      {damage ? (
        <>
          <span className={`battle-attack__damage battle-attack__damage--${damage.tier}`} style={{ left: damage.at.x, top: damage.at.y }}>
            <b>−{exchange.playerDamage}</b>
            <small>{TIER_LABEL[damage.tier]} ×{exchange.playerMultiplier}</small>
          </span>
          {exchange.enemyDamage > 0 ? (
            <span className="battle-attack__damage battle-attack__damage--counter" style={{ left: damage.counterAt.x, top: damage.counterAt.y }}>
              <b>−{exchange.enemyDamage}</b>
            </span>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
