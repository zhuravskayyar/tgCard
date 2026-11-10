import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { CardElement, CardRarity, DuelExchange } from "@cardastika/shared";
import { elementSoundCue, flySoundCue, playSound, type SoundCue } from "../audio";
import { ELEMENT_FINISH, GLOW, getBrightCutPlate } from "../cards/brightCutModel";
import { holdCardMaterialAnimation } from "../cards/cardMaterialShader";
import { CardFxWrapper } from "./CardFxWrapper";
import { CardHud } from "./CardHud";
import { MagicCircle } from "./MagicCircle";
import "./battle-attack.css";

/** Longest strike (weak tier: slow flight) including the flip to the next cards; screens also wait for the end event. */
export const BATTLE_ATTACK_DURATION_MS = 1300;
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
const FLIGHT_MS: Record<Tier, number> = { weak: 320, even: 260, strong: 220 };
const HIT_MS: Record<Tier, number> = { weak: 60, even: 90, strong: 150 };
const FORCE: Record<Tier, number> = { weak: 0.55, even: 1, strong: 1.8 };
const SHAKE: Record<Tier, [number, number]> = { weak: [3, 180], even: [7, 260], strong: [15, 440] };
const RECOIL_MS: Record<Tier, number> = { weak: 260, even: 360, strong: 520 };
const HIT_SOUND: Record<Tier, SoundCue> = { weak: "hit-weak", even: "hit-normal", strong: "hit-strong" };
const RISE_MS = 170;
const RETURN_MS = 340;
const FLIP_OUT_MS = 150;
const FLIP_IN_MS = 230;
// Spell seals: the cast seal is this many card widths across, the impact seal scales with the hit.
const CAST_SEAL_SIZE = 1.75;
const IMPACT_SEAL_SIZE: Record<Tier, number> = { weak: 1.1, even: 1.35, strong: 1.65 };
const IMPACT_SEAL_MS: Record<Tier, number> = { weak: 360, even: 440, strong: 560 };
// Particles live at most this many 60fps frames so the burst fades while the card returns.
const MAX_PARTICLE_FRAMES = 54;
const MAX_PARTICLES = 260;
const TRAIL_INTERVAL_MS = 1000 / 30;
// The comet tail keeps this many recent card positions (one per display frame) and fades over this many frames after the hit.
const RIBBON_POINTS = 12;
const RIBBON_FADE_FRAMES = 10;
// Energy rings slip past the card at these points of the flight.
const FLIGHT_RINGS = [0.3, 0.65];
const FX_GUTTER = 64;

const tierOf = (multiplier: number): Tier => multiplier < 1 ? "weak" : multiplier > 1 ? "strong" : "even";
const rnd = (min: number, max: number) => min + Math.random() * (max - min);
const pick = <T,>(items: readonly T[]) => items[Math.floor(Math.random() * items.length)]!;
const rgba = (hex: string, alpha: number) => {
  const value = parseInt(hex.slice(1), 16);
  return `rgba(${value >> 16},${(value >> 8) & 255},${value & 255},${alpha})`;
};
const transform = (x: number, y: number, rotateY: number, rotateZ: number, scale: number) =>
  `perspective(900px) translate(${x}px, ${y}px) rotateY(${rotateY}deg) rotateZ(${rotateZ}deg) scale(${scale})`;
const materialFor = (rarity: CardRarity) => getBrightCutPlate(rarity);
/** Dense keyframes from a motion function, played with linear easing, so curved paths stay smooth instead of kinking at keyframes. */
const sampleFrames = (count: number, frame: (t: number) => Keyframe): Keyframe[] =>
  Array.from({ length: count + 1 }, (_, index) => ({ ...frame(index / count), offset: index / count }));
const quadratic = (a: number, control: number, b: number, t: number) => (1 - t) ** 2 * a + 2 * (1 - t) * t * control + t ** 2 * b;
const FRAME_SAMPLES = 16;

/** Soft glows and flames are painted once into small sprites, then stamped with drawImage (no gradient per particle per frame). */
const FX_MAX_DPR = 1.5;
const SOURCE_OVER_KINDS: ReadonlySet<string> = new Set(["shred"]);
const BLOB_SIZE = 64;
const blobSprites = new Map<string, HTMLCanvasElement>();

function blobSprite(color: string): HTMLCanvasElement {
  let sprite = blobSprites.get(color);
  if (!sprite) {
    sprite = document.createElement("canvas");
    sprite.width = sprite.height = BLOB_SIZE;
    const paint = sprite.getContext("2d")!;
    const half = BLOB_SIZE / 2;
    const gradient = paint.createRadialGradient(half, half, 0, half, half, half);
    gradient.addColorStop(0, rgba(color, 1));
    gradient.addColorStop(0.45, rgba(color, 0.4));
    gradient.addColorStop(1, rgba(color, 0));
    paint.fillStyle = gradient;
    paint.fillRect(0, 0, BLOB_SIZE, BLOB_SIZE);
    blobSprites.set(color, sprite);
  }
  return sprite;
}

type ParticleKind = "glow" | "spark" | "ring" | "shred" | "star" | "bolt";
interface Particle {
  kind: ParticleKind;
  x: number; y: number; vx: number; vy: number;
  gravity: number; drag: number; turn: number;
  life: number; maxLife: number; delay: number;
  size: number; grow: number; squash: number; width: number;
  rotation: number; spin: number; color: string; alpha: number;
  /** Frames over which a bolt draws itself from its first point to its last. */
  reveal: number;
  /** Width at the far end of a bolt relative to the start (1 = no taper). */
  taper: number;
  /** Radius of the soft halo stamped along a bolt (0 = none). */
  halo: number;
  points?: Array<[number, number]>;
}

/** One canvas of short-lived impact particles, ported from the Cardastika duel FX stand. */
class ImpactCanvas {
  private particles: Particle[] = [];
  private ribbon: { points: Array<[number, number]>; width: number; color: string; fade: number; released: boolean } | null = null;
  private frame = 0;
  private last = 0;
  constructor(private readonly context: CanvasRenderingContext2D, private readonly width: number, private readonly height: number) {}

  /** The comet tail behind a flying card, newest point first. */
  setRibbon(points: Array<[number, number]>, width: number, color: string) {
    this.ribbon = { points, width, color, fade: 1, released: false };
    this.wake();
  }

  /** The card has landed: the tail fades out where it is. */
  releaseRibbon() {
    if (this.ribbon) this.ribbon.released = true;
  }

  private wake() {
    if (this.frame) return;
    this.last = performance.now();
    this.frame = requestAnimationFrame(this.loop);
  }

  add(partial: Partial<Particle> & { kind: ParticleKind }) {
    if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
    const life = Math.min(MAX_PARTICLE_FRAMES, partial.life ?? 30);
    const particle: Particle = {
      x: 0, y: 0, vx: 0, vy: 0, gravity: 0, drag: 1, turn: 0, delay: 0, size: 3, grow: 0, squash: 1, width: 1,
      rotation: 0, spin: 0, color: "#ffffff", alpha: 1, reveal: 0, taper: 1, halo: 0, ...partial, life, maxLife: life,
    };
    this.particles.push(particle);
    this.wake();
  }

  stop() {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.particles = [];
    this.ribbon = null;
    this.clear();
  }

  private clear() {
    this.context.clearRect(-FX_GUTTER, -FX_GUTTER, this.width + FX_GUTTER * 2, this.height + FX_GUTTER * 2);
  }

  private loop = (now: number) => {
    const step = Math.min(2.5, (now - this.last) / 16.67);
    this.last = now;
    const context = this.context;
    this.clear();
    context.lineCap = "round";
    context.lineJoin = "round";
    if (this.ribbon) {
      if (this.ribbon.released) this.ribbon.fade -= step / RIBBON_FADE_FRAMES;
      if (this.ribbon.fade <= 0) this.ribbon = null;
      else this.drawRibbon(this.ribbon.points, this.ribbon.width, this.ribbon.color, this.ribbon.fade);
    }
    let kept = 0;
    for (const particle of this.particles) if (particle.life > 0) this.particles[kept++] = particle;
    this.particles.length = kept;
    for (const particle of this.particles) {
      if (particle.delay > 0) { particle.delay -= step; continue; }
      particle.life -= step;
      const remaining = Math.max(0, particle.life / particle.maxLife);
      particle.vx *= particle.drag ** step;
      particle.vy = particle.vy * particle.drag ** step + particle.gravity * step;
      if (particle.turn) {
        // Rotating the velocity every frame bends the path into a curl: wind and vortices.
        const bend = particle.turn * step;
        const cos = Math.cos(bend);
        const sin = Math.sin(bend);
        const vx = particle.vx;
        particle.vx = vx * cos - particle.vy * sin;
        particle.vy = vx * sin + particle.vy * cos;
      }
      particle.x += particle.vx * step;
      particle.y += particle.vy * step;
      particle.rotation += particle.spin * step;
      this.draw(particle, remaining, Math.min(1, remaining * 1.5) * particle.alpha);
    }
    context.globalAlpha = 1;
    context.globalCompositeOperation = "source-over";
    if (this.particles.length || this.ribbon) this.frame = requestAnimationFrame(this.loop);
    else { this.frame = 0; this.clear(); }
  };

  private blob(x: number, y: number, radius: number, color: string, alpha: number) {
    if (radius <= 0 || alpha <= 0) return;
    this.context.globalAlpha = Math.min(1, alpha);
    this.context.drawImage(blobSprite(color), x - radius, y - radius, radius * 2, radius * 2);
    this.context.globalAlpha = 1;
  }

  /** A beam of the spell: wide coloured glow, coloured body and white-hot core, each tapering from the card to the tail's end. */
  private drawRibbon(points: Array<[number, number]>, width: number, color: string, fade: number) {
    const context = this.context;
    context.globalCompositeOperation = "lighter";
    const last = points.length - 1;
    for (let index = 0; index < last; index += 1) {
      const head = 1 - index / last;
      const [ax, ay] = points[index]!;
      const [bx, by] = points[index + 1]!;
      ([[3.2, 0.22, color], [1.4, 0.7, color], [0.55, 1, "#ffffff"]] as const).forEach(([scale, strength, stroke]) => {
        context.strokeStyle = rgba(stroke, strength * fade * head);
        context.lineWidth = Math.max(0.5, width * scale * head);
        context.beginPath();
        context.moveTo(ax, ay);
        context.lineTo(bx, by);
        context.stroke();
      });
    }
  }

  private path(points: Array<[number, number]>) {
    this.context.beginPath();
    points.forEach(([x, y], index) => index ? this.context.lineTo(x, y) : this.context.moveTo(x, y));
  }

  /** How many points of a self-drawing bolt are visible right now. */
  private revealed(p: Particle) {
    const total = p.points!.length;
    if (p.reveal <= 0) return total;
    const age = p.maxLife - p.life;
    return Math.min(total, Math.max(2, Math.ceil(Math.min(1, age / p.reveal) * (total - 1)) + 1));
  }

  /** Strokes a polyline in up to three runs of falling width, so a taper never doubles up at the joints. */
  private strokeRun(points: Array<[number, number]>, count: number, width: number, taper: number) {
    const last = count - 1;
    const runs = taper < 1 ? 3 : 1;
    for (let run = 0; run < runs; run += 1) {
      const from = Math.floor(run * last / runs);
      const to = Math.floor((run + 1) * last / runs);
      if (to <= from) continue;
      this.context.lineWidth = Math.max(0.4, width * (1 - (1 - taper) * (run + 0.5) / runs));
      this.path(points.slice(from, to + 1));
      this.context.stroke();
    }
  }

  private draw(p: Particle, remaining: number, alpha: number) {
    const context = this.context;
    const mode = SOURCE_OVER_KINDS.has(p.kind) ? "source-over" : "lighter";
    if (context.globalCompositeOperation !== mode) context.globalCompositeOperation = mode;
    switch (p.kind) {
      case "glow": this.blob(p.x, p.y, p.size * (1 + p.grow * (1 - remaining)), p.color, alpha); break;
      case "spark":
        context.strokeStyle = rgba(p.color, alpha);
        context.lineWidth = p.size * (0.4 + remaining * 0.6);
        context.beginPath();
        context.moveTo(p.x, p.y);
        context.lineTo(p.x - p.vx * 1.7, p.y - p.vy * 1.7);
        context.stroke();
        break;
      case "ring": {
        const radius = p.size + p.grow * Math.sqrt(1 - remaining);
        context.strokeStyle = rgba(p.color, alpha);
        context.lineWidth = p.width * remaining + 0.5;
        context.beginPath();
        context.ellipse(p.x, p.y, radius, radius * p.squash, p.rotation, 0, Math.PI * 2);
        context.stroke();
        break;
      }
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
        // A ray of light that draws itself outward, then flickers: soft halo, wide glow, coloured body and a white-hot core.
        const visible = this.revealed(p);
        const points = p.points!;
        const settled = p.maxLife - p.life > p.reveal;
        const flicker = settled && Math.random() < 0.22 ? 0.4 : 1;
        if (p.halo > 0) for (let index = 0; index < visible; index += 3) this.blob(points[index]![0], points[index]![1], p.halo, p.color, alpha * 0.22 * flicker);
        ([[p.width * 5, 0.18, p.color], [p.width * 2.2, 0.55, p.color], [p.width * 0.9, 1, "#ffffff"]] as const).forEach(([lineWidth, strength, color]) => {
          context.strokeStyle = rgba(color, Math.min(1, alpha * strength * flicker));
          this.strokeRun(points, visible, lineWidth, p.taper);
        });
        break;
      }
    }
  }
}

/** Around the beam: a soft bloom, a double helix of glowing motes coiling along the path and short sparks, in the element colours. */
function trailParticles(fx: ImpactCanvas, at: Point, element: CardElement, tier: Tier, direction: Point, phase: number) {
  const { x, y } = at;
  const finish = ELEMENT_FINISH[element];
  const soft = Math.sqrt(FORCE[tier]);
  const drift = { vx: -direction.x * 1.8, vy: -direction.y * 1.8 };
  const coil = Math.sin(phase) * 16 * soft;
  fx.add({ kind: "glow", x, y, ...drift, size: 16 * soft, grow: 0.3, life: 12, color: GLOW[element], alpha: 0.4 });
  for (const side of [1, -1]) {
    fx.add({ kind: "glow", x: x - direction.y * coil * side, y: y + direction.x * coil * side, ...drift, size: rnd(3, 4.5), life: 18, color: side > 0 ? finish.core : "#ffffff", alpha: 0.9 });
  }
  fx.add({ kind: "spark", x: x + rnd(-12, 12), y, vx: drift.vx * 2, vy: drift.vy * 2, size: 1.5, life: 14, color: finish.rim });
}

/** A thin ring of energy around the beam, seen edge-on: it opens across the path as the card slips through it. */
function flightRing(fx: ImpactCanvas, at: Point, element: CardElement, tier: Tier, direction: Point) {
  const finish = ELEMENT_FINISH[element];
  const soft = Math.sqrt(FORCE[tier]);
  const across = Math.atan2(direction.y, direction.x) + Math.PI / 2;
  fx.add({ kind: "ring", x: at.x, y: at.y, size: 8, grow: 26 * soft, width: 2.6, squash: 0.32, rotation: across, life: 16, color: finish.rim });
  fx.add({ kind: "ring", x: at.x, y: at.y, size: 4, grow: 18 * soft, width: 1.6, squash: 0.32, rotation: across, life: 14, delay: 2, color: finish.core });
}

/** The attacker's seal releases its element; the target's material decides sparks (metal) or shreds (parchment). */
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

  // The impact seal releases the spell: a white-hot flash, a bloom of the element, rays of light from the seal centre,
  // two shock rings and a spray of sparks, then a little magic dust that drifts up and fades.
  fx.add({ kind: "glow", x, y, size: 40 * soft, grow: 0.5, life: 8, color: "#ffffff", alpha: 0.9 });
  fx.add({ kind: "glow", x, y, size: 90 * soft, grow: 0.5, life: 22, color: glow, alpha: 0.55 });
  fx.add({ kind: "ring", x, y, size: 10, grow: 64 * soft, width: 3.2 * soft, life: 20, color: finish.rim });
  fx.add({ kind: "ring", x, y, size: 10, grow: 92 * soft, width: 2 * soft, life: 24, delay: 4, color: finish.core });
  const rays = { weak: 8, even: 12, strong: 16 }[tier];
  for (let index = 0; index < rays; index += 1) {
    const angle = index / rays * Math.PI * 2 + rnd(-0.12, 0.12);
    const inner = 14 * soft;
    const reach = rnd(55, 100) * soft;
    fx.add({ kind: "bolt", points: [[x + Math.cos(angle) * inner, y + Math.sin(angle) * inner], [x + Math.cos(angle) * reach, y + Math.sin(angle) * reach]], width: 1.6 * soft, taper: 1, reveal: 3, life: rnd(10, 14), color: glow });
  }
  for (let index = 0; index < count(18) + 6; index += 1) {
    const angle = rnd(0, Math.PI * 2);
    const speed = rnd(5, 13) * soft;
    fx.add({ kind: "spark", x, y, vx: Math.cos(angle) * speed + pushX, vy: Math.sin(angle) * speed + pushY, drag: 0.9, life: rnd(16, 30), size: 1.6, color: pick([finish.core, finish.rim, "#ffffff"]) });
  }
  for (let index = 0; index < count(10) + 3; index += 1) {
    fx.add({ kind: "glow", x: x + rnd(-40, 40) * soft, y: y + rnd(-30, 30) * soft, vy: -rnd(0.5, 1.5), drag: 0.97, size: rnd(2.5, 5), life: rnd(30, 45), delay: rnd(2, 10), color: finish.core, alpha: 0.85 });
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

/** A square seal centred on a card box, `size` card widths across. */
function sealBox(card: CSSProperties, size: number): CSSProperties {
  const left = Number(card.left), top = Number(card.top), width = Number(card.width), height = Number(card.height);
  const side = width * size;
  return { left: left + width / 2 - side / 2, top: top + height / 2 - side / 2, width: side, height: side };
}

function damageStyle(at: Point, element: CardElement, value: number): CSSProperties {
  return {
    left: `clamp(84px, ${at.x}px, calc(100% - 84px))`,
    top: at.y,
    "--damage-accent": GLOW[element],
    "--damage-digits": String(value).length + 1,
  } as CSSProperties;
}

/** One measured attack motion shared by every battle mode. */
export function BattleAttackAnimation({ exchange }: { exchange: DuelExchange }) {
  const layer = useRef<HTMLDivElement>(null);
  const impactCanvas = useRef<HTMLCanvasElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const targetRef = useRef<HTMLDivElement>(null);
  const castSealRef = useRef<HTMLDivElement>(null);
  const impactSealRef = useRef<HTMLDivElement>(null);
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
    const castSeal = castSealRef.current;
    const impactSeal = impactSealRef.current;
    const board = root?.parentElement;
    if (!geometry || !root || !canvas || !ghost || !target || !castSeal || !impactSeal || !board) return;

    const width = geometry.origin.width;
    const height = geometry.origin.height;
    const ratio = Math.min(FX_MAX_DPR, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round((width + FX_GUTTER * 2) * ratio));
    canvas.height = Math.max(1, Math.round((height + FX_GUTTER * 2) * ratio));
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, FX_GUTTER * ratio, FX_GUTTER * ratio);
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

    // One physical hit plus one quiet element accent, on the frame the burst is drawn.
    const impactSound = () => {
      playSound(HIT_SOUND[tier]);
      playSound(elementSoundCue(exchange.playerCard.element));
    };

    const strike = async () => {
      const options = { fill: "forwards" as const };
      if (reducedMotion) {
        impactSound();
        setDamage({ tier, at: impact, counterAt });
        await new Promise<void>((resolve) => { timers.push(window.setTimeout(resolve, 500)); });
        return;
      }
      const spin = 360;
      // The card swings out along a gentle arc away from the board centre, so neighbouring slots never cross paths.
      const arcSide = counterAt.x < width / 2 ? -1 : 1;
      const normal = { x: -direction.y, y: direction.x };
      // Signed along the normal so the bend points outward whichever way the strike travels.
      const arc = Math.min(46, length * 0.18) * arcSide * (Math.sign(normal.x) || 1);
      const lift = { x: -direction.x * 10, y: 20 - direction.y * 10 };
      // The seal of the card's element opens behind it during the wind-up and fades once the card has flown through.
      castSeal.animate([
        { opacity: 0, transform: "scale(.3) rotate(-120deg)" },
        { opacity: 1, transform: "scale(1) rotate(0deg)" },
      ], { ...options, duration: RISE_MS + 60, easing: "cubic-bezier(.2,.8,.3,1)" });
      // Wind-up: a short pull back away from the target before the throw.
      await ghost.animate([
        { transform: transform(0, 0, 0, 0, 1) },
        { transform: transform(lift.x, lift.y, -6, 7, 1.12) },
      ], { ...options, duration: RISE_MS, easing: "cubic-bezier(.2,.8,.3,1)" }).finished;
      if (cancelled) return;
      ghost.style.filter = `drop-shadow(0 0 14px ${glow}) drop-shadow(0 18px 14px #000a)`;
      let lastTrailAt = -Infinity;
      const flightStart = performance.now();
      const tail: Array<[number, number]> = [];
      let ringsShown = 0;
      const trail = (now: number) => {
        const rect = ghost.getBoundingClientRect();
        const at = { x: rect.left - origin.left + rect.width / 2, y: rect.top - origin.top + rect.height / 2 };
        // The beam follows every display frame so it stays one smooth stroke; the motes are sampled at a fixed rate.
        tail.unshift([at.x, at.y]);
        if (tail.length > RIBBON_POINTS) tail.length = RIBBON_POINTS;
        if (tail.length > 1) fx.setRibbon(tail, 5 * Math.sqrt(FORCE[tier]), glow);
        const progress = (now - flightStart) / FLIGHT_MS[tier];
        if (ringsShown < FLIGHT_RINGS.length && progress >= FLIGHT_RINGS[ringsShown]!) {
          ringsShown += 1;
          flightRing(fx, at, exchange.playerCard.element, tier, direction);
        }
        if (now - lastTrailAt >= TRAIL_INTERVAL_MS) {
          lastTrailAt = now;
          trailParticles(fx, at, exchange.playerCard.element, tier, direction, (now - flightStart) / 28);
        }
        trailFrame = requestAnimationFrame(trail);
      };
      trailFrame = requestAnimationFrame(trail);
      playSound(flySoundCue(exchange.playerCard.element));
      const controlX = dx / 2 + normal.x * arc;
      const controlY = dy / 2 + normal.y * arc;
      // Accelerates into the target: slow release, fastest on contact.
      await ghost.animate(sampleFrames(FRAME_SAMPLES, (t) => {
        const p = 0.25 * t + 0.75 * t ** 3;
        const bank = 7 * (1 - p) + arcSide * 9 * Math.sin(Math.PI * p);
        const scale = 1.12 + 0.12 * Math.sin(Math.PI * p) - 0.18 * p ** 3;
        return { transform: transform(quadratic(lift.x, controlX, dx, p), quadratic(lift.y, controlY, dy, p), -6 + (spin + 6) * p, bank, scale) };
      }), { ...options, duration: FLIGHT_MS[tier], easing: "linear" }).finished;
      cancelAnimationFrame(trailFrame);
      fx.releaseRibbon();
      if (cancelled) return;
      castSeal.animate([
        { opacity: 1, transform: "scale(1)" },
        { opacity: 0, transform: "scale(1.2)" },
      ], { ...options, duration: 260, easing: "ease-in" });
      impactSeal.animate([
        { opacity: 0, transform: "scale(.4) rotate(60deg)" },
        { opacity: 1, transform: "scale(1) rotate(0deg)", offset: 0.3 },
        { opacity: 0, transform: "scale(1.4) rotate(-30deg)" },
      ], { ...options, duration: IMPACT_SEAL_MS[tier], easing: "cubic-bezier(.2,.7,.3,1)" });

      burst(fx, impact, exchange.playerCard.element, exchange.enemyCard.rarity, tier, direction);
      impactSound();
      shakeBoard(board, tier);
      setDamage({ tier, at: impact, counterAt });
      const force = FORCE[tier];
      // The target is knocked back along the strike line and settles like a damped spring, with a fading flash.
      target.animate(sampleFrames(FRAME_SAMPLES, (t) => {
        const settle = t === 1 ? 0 : (1 - Math.exp(-40 * t)) * Math.exp(-5 * t) * Math.sin(2 * Math.PI * 1.4 * t + 0.35) / 0.56; // starts at rest; the peak push is ≈16px × force
        const push = 16 * force * settle;
        const squash = t === 1 ? 1 : 1 - 0.06 * force * Math.exp(-9 * t);
        const flash = t === 1 ? 0 : 0.7 * Math.exp(-7 * t);
        return {
          transform: t === 1 ? "none" : `translate(${direction.x * push}px, ${direction.y * push}px) rotate(${direction.x * push * 0.3}deg) scale(${squash})`,
          filter: t === 1 ? "none" : `brightness(${1 + flash}) saturate(${1 + flash * 0.3})`,
        };
      }), { duration: RECOIL_MS[tier], easing: "linear" });
      if (tier === "strong") board.animate([{ scale: "1" }, { scale: "1.02" }, { scale: "1" }], { duration: 220, easing: "ease-out" });

      // Contact: the card squashes into the target, then bounces off.
      await ghost.animate([
        { transform: transform(dx, dy, spin, 0, 0.94) },
        { transform: transform(dx + direction.x * 4, dy + direction.y * 4, spin, arcSide * 6, 0.82), offset: 0.3 },
        { transform: transform(dx - direction.x * 14, dy - direction.y * 14, spin, arcSide * 8, 0.98) },
      ], { ...options, duration: HIT_MS[tier], easing: "cubic-bezier(.2,.8,.3,1)" }).finished;
      if (cancelled) return;
      ghost.style.filter = "";
      // The return mirrors the arc on the other side, eased at both ends so the card lands back in its slot softly.
      const backX = dx - direction.x * 14;
      const backY = dy - direction.y * 14;
      await ghost.animate(sampleFrames(FRAME_SAMPLES, (t) => {
        const p = t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
        const x = quadratic(backX, dx / 2 - normal.x * arc * 0.6, 0, p);
        const y = quadratic(backY, dy / 2 - normal.y * arc * 0.6 + 26, 0, p);
        return { transform: transform(x, y, spin * (1 - p), arcSide * 8 * (1 - p) * (1 - p), 1 + 0.1 * Math.sin(Math.PI * p) - 0.02 * (1 - p)) };
      }), { ...options, duration: RETURN_MS, easing: "linear" }).finished;
      if (cancelled) return;
      const flipOut = [{ transform: "perspective(900px) rotateY(0deg)" }, { transform: "perspective(900px) rotateY(90deg)" }];
      await Promise.all([
        ghost.animate(flipOut, { ...options, duration: FLIP_OUT_MS, easing: "cubic-bezier(.5,0,.75,0)" }).finished,
        target.animate(flipOut, { ...options, duration: FLIP_OUT_MS, easing: "cubic-bezier(.5,0,.75,0)" }).finished,
      ]);
      if (cancelled) return;
      // Edge-on now: reveal the fresh cards that replaced the used pair and turn them face up.
      const cards = slotCards.current;
      if (cards) {
        const flipIn = [
          { transform: "perspective(900px) rotateY(-90deg) scale(.96)" },
          { transform: "perspective(900px) rotateY(8deg) scale(1.02)", offset: 0.7 },
          { transform: "perspective(900px) rotateY(0deg) scale(1)" },
        ];
        ghost.style.visibility = "hidden";
        target.style.visibility = "hidden";
        playSound("card-flip", { gain: 0.6 });
        // The strike ends only once the fresh cards have settled, so the screen never cuts the flip short.
        await Promise.all([cards.player, cards.enemy].map((card) => {
          delete card.dataset.attackCovered;
          return card.animate(flipIn, { duration: FLIP_IN_MS, easing: "cubic-bezier(.2,.7,.3,1)" }).finished;
        }));
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
    <div ref={layer} className="battle-attack" aria-hidden="true" style={{ "--battle-fx-gutter": `${FX_GUTTER}px` } as CSSProperties}>
      <canvas ref={impactCanvas} className="battle-attack__fx" />
      {geometry ? (
        <>
          <MagicCircle ref={castSealRef} className="battle-attack__seal--cast" element={exchange.playerCard.element} style={sealBox(geometry.player, CAST_SEAL_SIZE)} />
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
          <MagicCircle ref={impactSealRef} className="battle-attack__seal--impact" element={exchange.playerCard.element} style={sealBox(geometry.enemy, IMPACT_SEAL_SIZE[tier])} />
        </>
      ) : null}
      {damage ? (
        <>
          <span className={`battle-attack__damage battle-attack__damage--${damage.tier}`} style={damageStyle(damage.at, exchange.playerCard.element, exchange.playerDamage)}>
            <b className="battle-attack__damage-value" data-value={`−${exchange.playerDamage}`}><span>−{exchange.playerDamage}</span></b>
          </span>
          {exchange.enemyDamage > 0 ? (
            <span className="battle-attack__damage battle-attack__damage--counter" style={damageStyle(damage.counterAt, exchange.enemyCard.element, exchange.enemyDamage)}>
              <b className="battle-attack__damage-value" data-value={`−${exchange.enemyDamage}`}><span>−{exchange.enemyDamage}</span></b>
            </span>
          ) : null}
        </>
      ) : null}
    </div>
  );
}