import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { CardElement, CardRarity, DuelExchange } from "@cardastika/shared";
import { elementSoundCue, playSound, type SoundCue } from "../audio";
import { ELEMENT_FINISH, GLOW, getBrightCutPlate } from "../cards/brightCutModel";
import { holdCardMaterialAnimation } from "../cards/cardMaterialShader";
import { CardFxWrapper } from "./CardFxWrapper";
import { CardHud } from "./CardHud";
import { FireEffect, type FireEffectHandle } from "./FireEffect";
import "./battle-attack.css";

/** Longest strike (weak tier: slow flight) including the flip to the next cards; screens also wait for the end event. */
export const BATTLE_ATTACK_DURATION_MS = 1900;
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
const HIT_SOUND: Record<Tier, SoundCue> = { weak: "hit-weak", even: "hit-normal", strong: "hit-strong" };
const RISE_MS = 260;
const RETURN_MS = 520;
const FLIP_OUT_MS = 220;
const FLIP_IN_MS = 340;
// Particles live at most this many 60fps frames so the burst fades while the card returns.
const MAX_PARTICLE_FRAMES = 54;
const MAX_PARTICLES = 260;
const TRAIL_INTERVAL_MS = 1000 / 30;
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
const SOURCE_OVER_KINDS: ReadonlySet<string> = new Set(["smoke", "rock", "leaf", "shred", "crack", "spike", "pillar"]);
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

type ParticleKind = "glow" | "smoke" | "ember" | "spark" | "drop" | "ring" | "arc" | "rock" | "leaf" | "shred" | "star" | "bolt" | "crack" | "spike" | "gust" | "pillar" | "ripple";
interface Particle {
  kind: ParticleKind;
  x: number; y: number; vx: number; vy: number;
  gravity: number; drag: number; turn: number;
  life: number; maxLife: number; delay: number;
  size: number; grow: number; squash: number; width: number;
  rotation: number; spin: number; color: string; alpha: number;
  /** Frames over which a bolt or crack draws itself from its first point to its last. */
  reveal: number;
  /** Width at the far end of a bolt or crack relative to the start (1 = no taper). */
  taper: number;
  /** Radius of the soft halo stamped along a bolt (0 = none). */
  halo: number;
  points?: Array<[number, number]>;
}

/** One canvas of short-lived impact particles, ported from the Cardastika duel FX stand. */
class ImpactCanvas {
  private particles: Particle[] = [];
  private frame = 0;
  private last = 0;
  constructor(private readonly context: CanvasRenderingContext2D, private readonly width: number, private readonly height: number) {}

  add(partial: Partial<Particle> & { kind: ParticleKind }) {
    if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
    const life = Math.min(MAX_PARTICLE_FRAMES, partial.life ?? 30);
    const particle: Particle = {
      x: 0, y: 0, vx: 0, vy: 0, gravity: 0, drag: 1, turn: 0, delay: 0, size: 3, grow: 0, squash: 1, width: 1,
      rotation: 0, spin: 0, color: "#ffffff", alpha: 1, reveal: 0, taper: 1, halo: 0, ...partial, life, maxLife: life,
    };
    if (particle.kind === "rock") {
      particle.points = Array.from({ length: 5 }, (_, index) => {
        const angle = index / 5 * Math.PI * 2 + rnd(-0.3, 0.3);
        const radius = particle.size * rnd(0.6, 1.1);
        return [Math.cos(angle) * radius, Math.sin(angle) * radius] as [number, number];
      });
    }
    if (particle.kind === "pillar") {
      // Unit outline (x in -1..1, y in 0..-1): a broken stone column with a jagged crown, scaled by width/height when drawn.
      particle.points = [[-1, 0], [-1 + rnd(0, 0.15), -rnd(0.35, 0.5)], [-rnd(0.4, 0.7), -rnd(0.8, 0.92)], [rnd(-0.2, 0.2), -1], [rnd(0.35, 0.7), -rnd(0.78, 0.95)], [1 - rnd(0, 0.15), -rnd(0.4, 0.55)], [1, 0]];
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
    if (this.particles.length) this.frame = requestAnimationFrame(this.loop);
    else { this.frame = 0; this.clear(); }
  };

  private blob(x: number, y: number, radius: number, color: string, alpha: number) {
    if (radius <= 0 || alpha <= 0) return;
    this.context.globalAlpha = Math.min(1, alpha);
    this.context.drawImage(blobSprite(color), x - radius, y - radius, radius * 2, radius * 2);
    this.context.globalAlpha = 1;
  }

  private path(points: Array<[number, number]>) {
    this.context.beginPath();
    points.forEach(([x, y], index) => index ? this.context.lineTo(x, y) : this.context.moveTo(x, y));
  }

  /** How many points of a self-drawing bolt/crack are visible right now. */
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
        context.ellipse(p.x, p.y, p.size, p.size * Math.min(2.6, 1.2 + Math.hypot(p.vx, p.vy) * 0.12), Math.atan2(p.vy, p.vx) + Math.PI / 2, 0, Math.PI * 2);
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
      case "arc": {
        const radius = Math.max(1, p.size + p.grow * (1 - remaining));
        context.beginPath();
        context.ellipse(p.x, p.y, radius, radius * p.squash, p.rotation, -Math.PI * 0.75, Math.PI * 0.35);
        context.strokeStyle = rgba(p.color, alpha * 0.2);
        context.lineWidth = p.width * 3 * remaining;
        context.stroke();
        context.strokeStyle = rgba(p.color, alpha);
        context.lineWidth = Math.max(0.5, p.width * remaining);
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
        // Two facets: a lit one on top and a shaded one underneath, so chunks read as solid stone.
        context.fillStyle = "rgba(255,235,190,.22)";
        context.beginPath();
        context.moveTo(0, 0);
        context.lineTo(p.points![0]![0], p.points![0]![1]);
        context.lineTo(p.points![1]![0], p.points![1]![1]);
        context.closePath();
        context.fill();
        context.fillStyle = "rgba(0,0,0,.28)";
        context.beginPath();
        context.moveTo(0, 0);
        context.lineTo(p.points![2]![0], p.points![2]![1]);
        context.lineTo(p.points![3]![0], p.points![3]![1]);
        context.closePath();
        context.fill();
        context.strokeStyle = "rgba(255,230,180,.35)";
        context.lineWidth = 1;
        context.stroke();
        context.restore();
        break;
      case "spike": {
        // A shard thrusts out fast, holds, then sinks back; its right half catches the light.
        const progress = 1 - remaining;
        const rise = progress < 0.22 ? 1 - (1 - progress / 0.22) ** 3 : progress > 0.72 ? 1 - (progress - 0.72) / 0.28 : 1;
        const height = p.size * rise;
        if (height < 0.5) break;
        const half = p.width;
        const lean = half * 0.3;
        context.save();
        context.translate(p.x, p.y);
        context.rotate(p.rotation);
        context.fillStyle = p.color;
        context.beginPath();
        context.moveTo(-half, 0);
        context.lineTo(lean, -height);
        context.lineTo(half, 0);
        context.closePath();
        context.fill();
        context.fillStyle = "rgba(255,235,190,.28)";
        context.beginPath();
        context.moveTo(0, 0);
        context.lineTo(lean, -height);
        context.lineTo(half, 0);
        context.closePath();
        context.fill();
        context.strokeStyle = "rgba(30,20,10,.55)";
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(-half, 0);
        context.lineTo(lean, -height);
        context.lineTo(half, 0);
        context.stroke();
        context.restore();
        break;
      }
      case "pillar": {
        // A stone column thrusts up fast, holds, then sinks back. Left face lit, right face in shade, a crack running down from the crown.
        const progress = 1 - remaining;
        const rise = progress < 0.2 ? 1 - (1 - progress / 0.2) ** 3 : progress > 0.7 ? 1 - (progress - 0.7) / 0.3 : 1;
        const height = p.size * rise;
        if (height < 0.5) break;
        const outline = p.points!.map(([ux, uy]) => [ux * p.width, uy * height] as [number, number]);
        context.save();
        context.translate(p.x, p.y);
        context.rotate(p.rotation);
        context.fillStyle = p.color;
        this.path(outline);
        context.closePath();
        context.fill();
        context.fillStyle = "rgba(255,235,190,.24)";
        this.path([...outline.slice(0, 4), [0, 0]]);
        context.closePath();
        context.fill();
        context.fillStyle = "rgba(0,0,0,.32)";
        this.path([...outline.slice(3), [0, 0]]);
        context.closePath();
        context.fill();
        context.strokeStyle = "rgba(255,236,190,.42)";
        context.lineWidth = 1.4;
        this.path(outline.slice(0, 4));
        context.stroke();
        context.strokeStyle = "rgba(25,15,8,.55)";
        context.lineWidth = 1;
        this.path([outline[3]!, [p.width * 0.05, -height * 0.58], [-p.width * 0.12, -height * 0.34], [p.width * 0.04, -height * 0.16]]);
        context.stroke();
        context.restore();
        break;
      }
      case "ripple": {
        // A wave ring on water: it bursts out quickly, slows as it spreads, and thins. A soft trough, a crest line and a bright highlight on the far side.
        const progress = 1 - remaining;
        const radius = Math.max(1, p.size + p.grow * (1 - (1 - progress) ** 2.2));
        const radiusY = radius * p.squash;
        const line = Math.max(0.6, p.width * (0.35 + 0.65 * remaining));
        context.fillStyle = rgba(p.color, alpha * 0.07);
        context.beginPath();
        context.ellipse(p.x, p.y, radius, radiusY, 0, 0, Math.PI * 2);
        context.fill();
        context.strokeStyle = rgba(p.color, alpha * 0.2);
        context.lineWidth = line * 3.4;
        context.stroke();
        context.strokeStyle = rgba(p.color, alpha * 0.75);
        context.lineWidth = line;
        context.stroke();
        context.strokeStyle = rgba("#ffffff", alpha * 0.9);
        context.lineWidth = Math.max(0.5, line * 0.55);
        context.beginPath();
        context.ellipse(p.x, p.y - line * 0.4, radius, radiusY, 0, Math.PI, Math.PI * 2);
        context.stroke();
        break;
      }
      case "gust": {
        const tail = 3.2;
        context.strokeStyle = rgba(p.color, alpha * 0.25);
        context.lineWidth = p.size * 3;
        context.beginPath();
        context.moveTo(p.x, p.y);
        context.lineTo(p.x - p.vx * tail, p.y - p.vy * tail);
        context.stroke();
        context.strokeStyle = rgba(p.color, alpha);
        context.lineWidth = Math.max(0.6, p.size * (0.5 + remaining * 0.5));
        context.beginPath();
        context.moveTo(p.x, p.y);
        context.lineTo(p.x - p.vx * tail, p.y - p.vy * tail);
        context.stroke();
        break;
      }
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
        // Draws itself from the sky down, then flickers: soft halo, wide glow, coloured body and a white-hot core.
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
      case "crack":
        context.strokeStyle = rgba(p.color, alpha * 0.85);
        this.strokeRun(p.points!, this.revealed(p), p.width, p.taper);
        break;
    }
  }
}

/** Jagged lightning: midpoint displacement gives sharp, natural kinks instead of a random walk. */
function lightningPath(from: Point, to: Point, sway: number, passes: number): Array<[number, number]> {
  let points: Array<[number, number]> = [[from.x, from.y], [to.x, to.y]];
  let offset = sway;
  for (let pass = 0; pass < passes; pass += 1) {
    const next: Array<[number, number]> = [points[0]!];
    for (let index = 1; index < points.length; index += 1) {
      const [ax, ay] = points[index - 1]!;
      const [bx, by] = points[index]!;
      const normalX = -(by - ay);
      const normalY = bx - ax;
      const norm = Math.hypot(normalX, normalY) || 1;
      const shift = rnd(-offset, offset);
      next.push([(ax + bx) / 2 + normalX / norm * shift, (ay + by) / 2 + normalY / norm * shift], [bx, by]);
    }
    points = next;
    offset *= 0.55;
  }
  return points;
}

/** One strike from the sky onto the target (or a fissure along the ground). Forks peel off the main channel and fork again; `at` is how far along the main channel a fork starts. */
type Bolt = { points: Array<[number, number]>; width: number; at: number; taper: number };
function lightningStrike(from: Point, to: Point, width: number, branchCount: number): Bolt[] {
  const length = Math.hypot(to.x - from.x, to.y - from.y) || 1;
  const main = lightningPath(from, to, length * 0.16, 5);
  const bolts: Bolt[] = [{ points: main, width, at: 0, taper: 1 }];
  const heading = Math.atan2(to.y - from.y, to.x - from.x);
  for (let index = 0; index < branchCount; index += 1) {
    const startIndex = Math.floor(rnd(main.length * 0.15, main.length * 0.8));
    const start = main[startIndex]!;
    const at = startIndex / (main.length - 1);
    const angle = heading + (Math.random() < 0.5 ? -1 : 1) * rnd(0.35, 0.95);
    const reach = length * rnd(0.18, 0.34);
    const branch = lightningPath({ x: start[0], y: start[1] }, { x: start[0] + Math.cos(angle) * reach, y: start[1] + Math.sin(angle) * reach }, reach * 0.2, 4);
    bolts.push({ points: branch, width: width * 0.5, at, taper: 0.25 });
    if (Math.random() < 0.6) {
      const fork = branch[Math.floor(branch.length * 0.55)]!;
      const forkAngle = angle + (Math.random() < 0.5 ? -1 : 1) * rnd(0.4, 0.8);
      const forkReach = reach * 0.45;
      bolts.push({ points: lightningPath({ x: fork[0], y: fork[1] }, { x: fork[0] + Math.cos(forkAngle) * forkReach, y: fork[1] + Math.sin(forkAngle) * forkReach }, forkReach * 0.2, 3), width: width * 0.28, at: Math.min(1, at + 0.12), taper: 0.2 });
    }
  }
  return bolts;
}

/** Each element leaves its own short trail, sampled at a fixed rate on every display. */
function trailParticles(fx: ImpactCanvas, at: Point, element: CardElement, tier: Tier, direction: Point) {
  const { x, y } = at;
  const finish = ELEMENT_FINISH[element];
  const soft = Math.sqrt(FORCE[tier]);
  const drift = { vx: -direction.x * 1.8, vy: -direction.y * 1.8 };
  if (element === "water") {
    fx.add({ kind: "ripple", x, y: y + 10, ...drift, size: 3, grow: 22 * soft, width: 1.9, squash: 0.45, life: 18, color: finish.rim });
    fx.add({ kind: "drop", x: x + rnd(-16, 16), y, ...drift, gravity: 0.1, size: 2.2, life: 18, color: finish.core });
  } else if (element === "earth") {
    fx.add({ kind: "rock", x: x + rnd(-18, 18), y: y + 12, ...drift, gravity: 0.2, size: rnd(2, 4) * soft, spin: rnd(-0.2, 0.2), life: 20, color: "#80633c" });
    fx.add({ kind: "smoke", x, y: y + 12, ...drift, size: 16 * soft, grow: 0.6, life: 18, color: "#a58b5b", alpha: 0.5 });
  } else {
    fx.add({ kind: "arc", x, y, ...drift, size: 23 * soft, grow: 20, width: 1.7, squash: 0.35, rotation: Math.atan2(direction.y, direction.x), spin: 0.08, life: 16, color: finish.core });
    fx.add({ kind: "spark", x: x + rnd(-16, 16), y, vx: drift.vx * 2, vy: drift.vy * 2, size: 1.5, life: 14, color: finish.rim });
    const side = Math.random() < 0.5 ? -1 : 1;
    fx.add({ kind: "gust", x: x + rnd(-16, 16), y: y + rnd(-16, 16), vx: drift.vx * 1.6 + rnd(-2, 2), vy: drift.vy * 1.6 + rnd(-2, 2), turn: side * rnd(0.08, 0.16), size: 1.5, life: 18, color: finish.core });
    fx.add({ kind: "glow", x: x + rnd(-20, 20), y: y + rnd(-20, 20), ...drift, size: rnd(2.5, 5), life: 22, color: finish.core, alpha: 0.8 });
    if (Math.random() < 0.5) {
      // A short crackle of static jumping off the card.
      const angle = rnd(0, Math.PI * 2);
      const reach = rnd(22, 44) * soft;
      fx.add({ kind: "bolt", points: lightningPath({ x, y }, { x: x + Math.cos(angle) * reach, y: y + Math.sin(angle) * reach }, reach * 0.25, 3), width: 1.3, taper: 0.3, color: GLOW[element], life: rnd(5, 9) });
    }
  }
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

  // Fire draws its own flash and ring in FireEffect.
  if (element !== "fire") {
    fx.add({ kind: "glow", x, y, size: 34 * soft, grow: 0.5, life: 9, color: finish.core, alpha: 0.65 });
    fx.add({ kind: "glow", x, y, size: 76 * soft, grow: 0.5, life: 24, color: glow, alpha: 0.5 });
    fx.add({ kind: "ring", x, y, size: 8, grow: 52 * soft, width: 3 * soft, life: 20, color: finish.rim });
  }
  if (element === "earth") {
    // Fissures tear across the ground: jagged, forking, opening outward from the hit with a lit seam inside.
    const fissures = { weak: 4, even: 6, strong: 9 }[tier];
    for (let index = 0; index < fissures; index += 1) {
      const angle = index / fissures * Math.PI * 2 + rnd(-0.25, 0.25);
      const reach = rnd(60, 105) * soft;
      lightningStrike({ x, y: y + 12 }, { x: x + Math.cos(angle) * reach, y: y + 12 + Math.sin(angle) * reach * 0.5 }, 3 * soft, 2).forEach((seam) => {
        const delay = seam.at * 5;
        fx.add({ kind: "crack", points: seam.points, width: seam.width * 1.7, taper: seam.taper, reveal: 6, delay, color: "#2a1b0e", life: 40 });
        fx.add({ kind: "crack", points: seam.points, width: seam.width * 0.5, taper: seam.taper, reveal: 6, delay, color: finish.rim, life: 30 });
      });
    }
  }

  if (element === "water") {
    // Concentric ripples leave the hit one after another, each a bright crest on a soft trough, slowing as they spread.
    const rings = { weak: 3, even: 4, strong: 6 }[tier];
    for (let index = 0; index < rings; index += 1) {
      fx.add({ kind: "ripple", x, y: y + 12, size: 6, grow: (46 + index * 24) * soft, width: Math.max(1.4, 3.4 - index * 0.35) * soft, squash: 0.38, life: 30 + index * 2, delay: index * 4, color: index % 2 ? finish.core : finish.rim, alpha: 0.95 - index * 0.08 });
    }
    // The water column that jumps up on impact, then falls into the next rings.
    for (let index = 0; index < 4; index += 1) {
      fx.add({ kind: "glow", x: x + rnd(-6, 6), y: y - index * 10 * soft, vy: -rnd(2, 3.4) * soft, drag: 0.94, size: (28 - index * 3) * soft, grow: 0.5, life: 20 + index * 3, color: index % 2 ? finish.core : "#d8f2ff", alpha: 0.45 });
    }
    // Crown splash: drops leave on an ellipse, fastest sideways, then fall back.
    const crown = count(16) + 6;
    for (let index = 0; index < crown; index += 1) {
      const angle = index / crown * Math.PI * 2;
      fx.add({ kind: "drop", x: x + Math.cos(angle) * 14 * soft, y: y + Math.sin(angle) * 6 * soft + 8, vx: Math.cos(angle) * rnd(2, 5.5) * soft + pushX * 0.4, vy: -rnd(3.5, 8) * soft * (0.6 + 0.4 * Math.abs(Math.sin(angle))), gravity: 0.3, life: rnd(36, 60), size: rnd(1.6, 3.4), color: pick(["#d8f2ff", "#6cc8ff", "#ffffff"]) });
    }
    for (let index = 0; index < count(14); index += 1) {
      const angle = -1.57 + rnd(-1.3, 1.3);
      const speed = rnd(3, 10) * soft;
      fx.add({ kind: "drop", x, y, vx: Math.cos(angle) * speed + pushX, vy: Math.sin(angle) * speed, gravity: 0.28, life: rnd(40, 70), size: rnd(1.4, 3.2), color: pick(["#d8f2ff", "#6cc8ff", "#ffffff"]) });
    }
    // Drops landing back on the surface start small ripples of their own.
    for (let index = 0; index < count(7) + 3; index += 1) {
      fx.add({ kind: "ripple", x: x + rnd(-70, 70) * soft, y: y + 12 + rnd(-8, 14), size: 2, grow: rnd(12, 22), width: 1.4, squash: 0.4, life: 18, delay: rnd(12, 34), color: pick(["#d8f2ff", finish.core]), alpha: 0.85 });
    }
    for (let index = 0; index < count(4); index += 1) fx.add({ kind: "smoke", x: x + rnd(-26, 26), y: y + rnd(-18, 8), vy: -rnd(0.4, 1), life: rnd(40, 70), size: rnd(22, 36), grow: 1, color: "#cfeaff", alpha: 0.4 });
  } else if (element === "earth") {
    // Stone pillars burst out of the ground in a ring around the hit, back ones first so the front ones overlap them.
    const pillars = { weak: 4, even: 7, strong: 10 }[tier];
    const ring = Array.from({ length: pillars }, (_, index) => index / pillars * Math.PI * 2 + rnd(-0.2, 0.2)).sort((a, b) => Math.sin(a) - Math.sin(b));
    ring.forEach((angle, index) => {
      const reach = rnd(26, 62) * soft;
      fx.add({ kind: "pillar", x: x + Math.cos(angle) * reach * 1.2, y: y + 16 + Math.sin(angle) * reach * 0.45, size: rnd(40, 76) * soft, width: rnd(9, 15) * soft, rotation: Math.cos(angle) * 0.12 + rnd(-0.06, 0.06), life: rnd(30, 38), delay: index * 1.2 + rnd(0, 3), color: pick(["#6b5238", "#7d6240", "#594430"]) });
    });
    for (let index = 0; index < count(14); index += 1) {
      const angle = rnd(0, Math.PI * 2);
      const speed = rnd(2, 8) * soft;
      fx.add({ kind: "rock", x, y, vx: Math.cos(angle) * speed + pushX, vy: Math.sin(angle) * speed - 2, gravity: 0.3, drag: 0.985, life: rnd(45, 70), size: rnd(3, 7), spin: rnd(-0.3, 0.3), color: pick(["#5b4631", "#7a5f3d", "#3f3224"]) });
    }
    // Low dust shockwave rolling outward along the ground.
    for (let index = 0; index < count(10); index += 1) {
      const angle = index / count(10) * Math.PI * 2;
      fx.add({ kind: "smoke", x: x + Math.cos(angle) * 10, y: y + Math.sin(angle) * 5 + 8, vx: Math.cos(angle) * rnd(2, 4.2) * soft, vy: Math.sin(angle) * rnd(0.6, 1.4) - 0.25, drag: 0.95, size: rnd(18, 30), grow: 1.2, life: rnd(40, 70), color: pick(["#8f7a56", "#a89168", "#6f5d42"]), alpha: 0.7 });
    }
    for (let index = 0; index < count(5); index += 1) fx.add({ kind: "smoke", x: x + rnd(-26, 26), y: y + rnd(-18, 18), vx: rnd(-1, 1), vy: -rnd(0.1, 0.6), life: rnd(50, 90), size: rnd(22, 38), grow: 1.1, color: "#9b845f" });
    for (let index = 0; index < count(5); index += 1) {
      const angle = rnd(0, Math.PI * 2);
      const speed = rnd(1.5, 5) * soft;
      fx.add({ kind: "leaf", x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, gravity: 0.04, drag: 0.96, spin: rnd(-0.2, 0.2), life: rnd(55, 95), size: rnd(4, 8), color: pick(["#8fdc4e", "#5aa83a", "#c6f08a"]) });
    }
  } else {
    for (let index = 0; index < 3; index += 1) {
      fx.add({ kind: "arc", x, y, size: 20 + index * 9, grow: 54 * soft, width: (2.6 - index * 0.35) * soft, squash: 0.4 + index * 0.12, rotation: index * Math.PI * 0.55, spin: 0.07 + index * 0.015, life: 30, delay: index * 2, color: index % 2 ? finish.core : finish.rim });
    }
    // Wind: a vortex of curling gusts, drifting motes of air and soft puffs pushed outward.
    const turnSign = Math.random() < 0.5 ? -1 : 1;
    for (let index = 0; index < count(14) + 6; index += 1) {
      const angle = rnd(0, Math.PI * 2);
      const radius = rnd(8, 26) * soft;
      const speed = rnd(4, 9) * soft;
      fx.add({ kind: "gust", x: x + Math.cos(angle) * radius, y: y + Math.sin(angle) * radius * 0.8, vx: -Math.sin(angle) * speed + Math.cos(angle) * 1.2, vy: Math.cos(angle) * speed * 0.8 + Math.sin(angle) * 1.2, turn: turnSign * rnd(0.07, 0.13), drag: 0.965, size: rnd(1.5, 2.4), life: rnd(22, 36), delay: rnd(0, 5), color: pick([finish.core, finish.rim, "#ffffff"]) });
    }
    for (let index = 0; index < count(16); index += 1) {
      const angle = rnd(0, Math.PI * 2);
      const speed = rnd(0.8, 3.2) * soft;
      fx.add({ kind: "glow", x: x + rnd(-30, 30), y: y + rnd(-30, 30), vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, drag: 0.95, turn: turnSign * 0.05, size: rnd(2.5, 6), life: rnd(22, 42), color: finish.core, alpha: 0.85 });
    }
    for (let index = 0; index < count(5); index += 1) {
      const angle = rnd(0, Math.PI * 2);
      fx.add({ kind: "smoke", x, y, vx: Math.cos(angle) * rnd(1.5, 3) * soft, vy: Math.sin(angle) * rnd(1, 2.2) * soft, drag: 0.93, size: rnd(18, 30), grow: 1.2, life: rnd(26, 40), color: "#e6eeff", alpha: 0.28 });
    }
    // Lightning falls from the sky and draws itself down the channel with a halo, forks that fork again and a white-hot core. It flashes, afterglows and restrikes with fresh kinks.
    const strikes = { weak: 1, even: 2, strong: 3 }[tier];
    const forks = { weak: 2, even: 4, strong: 6 }[tier];
    for (let strike = 0; strike < strikes; strike += 1) {
      const from = { x: x + rnd(-45, 45) * (strike ? 1.5 : 0.4), y: Math.max(-FX_GUTTER + 6, y - rnd(170, 230) * soft) };
      fx.add({ kind: "glow", x: from.x, y: from.y, size: 30 * soft, grow: 0.5, life: 9, color: glow, alpha: 0.55, delay: strike * 3 });
      lightningStrike(from, { x, y }, 2.6 * soft, forks).forEach((bolt) => {
        const delay = strike * 3 + bolt.at * 4;
        const halo = bolt.at === 0 ? 14 * soft : 0;
        fx.add({ kind: "bolt", points: bolt.points, width: bolt.width, taper: bolt.taper, reveal: 3, halo, color: glow, life: rnd(11, 15), delay });
        fx.add({ kind: "bolt", points: bolt.points, width: bolt.width * 1.6, taper: bolt.taper, reveal: 3, color: glow, alpha: 0.25, life: 28, delay });
      });
      lightningStrike(from, { x, y }, 2 * soft, forks).forEach((bolt) => fx.add({ kind: "bolt", points: bolt.points, width: bolt.width, taper: bolt.taper, reveal: 2, color: glow, life: rnd(8, 12), delay: 7 + strike * 3 + bolt.at * 3 }));
    }
    fx.add({ kind: "glow", x, y, size: 110 * soft, grow: 0.4, life: 6, color: "#ffffff", alpha: 0.75, delay: 3 });
    // Electric arcs fan out from the point of impact along the ground and the card.
    const arcs = { weak: 3, even: 5, strong: 7 }[tier];
    for (let index = 0; index < arcs; index += 1) {
      const angle = index / arcs * Math.PI * 2 + rnd(-0.3, 0.3);
      const reach = rnd(40, 85) * soft;
      lightningStrike({ x, y }, { x: x + Math.cos(angle) * reach, y: y + Math.sin(angle) * reach }, 1.6 * soft, 1).forEach((bolt) => fx.add({ kind: "bolt", points: bolt.points, width: bolt.width, taper: bolt.at === 0 ? 0.3 : bolt.taper, reveal: 2, color: glow, life: rnd(8, 14), delay: 3 + bolt.at * 2 }));
    }
    for (let index = 0; index < count(18); index += 1) {
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
  const fireRef = useRef<FireEffectHandle>(null);
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
        await new Promise<void>((resolve) => { timers.push(window.setTimeout(resolve, 700)); });
        return;
      }
      const spin = 360;
      // The card swings out along a gentle arc away from the board centre, so neighbouring slots never cross paths.
      const arcSide = counterAt.x < width / 2 ? -1 : 1;
      const normal = { x: -direction.y, y: direction.x };
      // Signed along the normal so the bend points outward whichever way the strike travels.
      const arc = Math.min(46, length * 0.18) * arcSide * (Math.sign(normal.x) || 1);
      const lift = { x: -direction.x * 10, y: 20 - direction.y * 10 };
      // Wind-up: a short pull back away from the target before the throw.
      await ghost.animate([
        { transform: transform(0, 0, 0, 0, 1) },
        { transform: transform(lift.x, lift.y, -6, 7, 1.12) },
      ], { ...options, duration: RISE_MS, easing: "cubic-bezier(.2,.8,.3,1)" }).finished;
      if (cancelled) return;
      ghost.style.filter = `drop-shadow(0 0 14px ${glow}) drop-shadow(0 18px 14px #000a)`;
      let lastTrailAt = -Infinity;
      const trail = (now: number) => {
        if (now - lastTrailAt >= TRAIL_INTERVAL_MS) {
          lastTrailAt = now;
          const rect = ghost.getBoundingClientRect();
          const at = { x: rect.left - origin.left + rect.width / 2, y: rect.top - origin.top + rect.height / 2 };
          if (exchange.playerCard.element === "fire") fireRef.current?.trail(at, tier, direction);
          else trailParticles(fx, at, exchange.playerCard.element, tier, direction);
        }
        trailFrame = requestAnimationFrame(trail);
      };
      trailFrame = requestAnimationFrame(trail);
      playSound("battle-fly");
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
      if (cancelled) return;

      burst(fx, impact, exchange.playerCard.element, exchange.enemyCard.rarity, tier, direction);
      if (exchange.playerCard.element === "fire") fireRef.current?.burst(impact, tier, direction);
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
      if (tier === "strong") board.animate([{ scale: "1" }, { scale: "1.02" }, { scale: "1" }], { duration: 300, easing: "ease-out" });

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
      fireRef.current?.stop();
    };
  }, [exchange, geometry, tier]);

  return (
    <div ref={layer} className="battle-attack" aria-hidden="true" style={{ "--battle-fx-gutter": `${FX_GUTTER}px` } as CSSProperties}>
      <canvas ref={impactCanvas} className="battle-attack__fx" />
      {geometry && exchange.playerCard.element === "fire" ? <FireEffect ref={fireRef} width={geometry.origin.width} height={geometry.origin.height} gutter={FX_GUTTER} /> : null}
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