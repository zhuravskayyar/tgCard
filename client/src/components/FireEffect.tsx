import { forwardRef, useImperativeHandle, useLayoutEffect, useRef } from "react";

/**
 * Fire for the battle strike, drawn in the same hard graphic style as the lightning:
 * crisp pointed flame blades built from four flat nested layers (dark red, body, hot, white core)
 * with a bright edge line, a soft halo behind them, a thrust-out / hold / burn-down life,
 * jets that fan out from the hit and fork like bolts, and a thin shock ring.
 * No soft additive blobs carry the look; the only glows are the short flash and the halo behind each blade.
 *
 * Usage: render <FireEffect ref={ref} width={w} height={h} gutter={g} /> inside the (position: absolute) battle layer,
 * then call ref.current.trail(...) every trail tick while the card flies and ref.current.burst(...) on impact.
 */

export type FireTier = "weak" | "even" | "strong";
export interface FirePoint { x: number; y: number }
export interface FireEffectHandle {
  /** Impact: flash, shock ring, radial flame jets with forks, a rooted wall of flames, licks, sparks and cinders. */
  burst(at: FirePoint, tier: FireTier, direction: FirePoint): void;
  /** One trail tick: blades stream backwards from the flying card. Call at a fixed rate (about 30 times a second). */
  trail(at: FirePoint, tier: FireTier, direction: FirePoint): void;
  stop(): void;
}
export interface FireEffectProps {
  /** Size of the battle layer in CSS pixels. */
  width: number;
  height: number;
  /** Extra canvas margin around the layer so flames can leave it. */
  gutter?: number;
}

const FORCE: Record<FireTier, number> = { weak: 0.55, even: 1, strong: 1.8 };
// Particles live at most this many 60fps frames so the burst fades while the card returns.
const MAX_FRAMES = 54;
const MAX_PARTICLES = 240;
const FX_MAX_DPR = 1.5;

const rnd = (min: number, max: number) => min + Math.random() * (max - min);
const pick = <T,>(items: readonly T[]) => items[Math.floor(Math.random() * items.length)]!;
const rgba = (hex: string, alpha: number) => {
  const value = parseInt(hex.slice(1), 16);
  return `rgba(${value >> 16},${(value >> 8) & 255},${value & 255},${Math.max(0, Math.min(1, alpha))})`;
};

/** Outer layer, body, hot layer, core: from the dark edge of the flame to its white-hot middle. */
type Palette = readonly [string, string, string, string];
const PALETTES = {
  ember: ["#8e1604", "#d9340f", "#ff7a1a", "#ffd27a"],
  blaze: ["#c92a0b", "#ff6a14", "#ffb22e", "#fff3c4"],
  hot: ["#ff7a1a", "#ffb22e", "#ffe27a", "#ffffff"],
} as const satisfies Record<string, Palette>;
/** Nested layers as [length scale, width scale]: each one shorter and thinner than the one behind it. */
const LAYERS = [[1, 1], [0.78, 0.7], [0.56, 0.45], [0.34, 0.24]] as const;
const SPARK_COLORS = ["#fff1c4", "#ffd25a", "#ff9a2e"] as const;

type Kind = "tongue" | "glow" | "ring" | "spark" | "cinder";
interface Particle {
  kind: Kind;
  x: number; y: number; vx: number; vy: number;
  gravity: number; drag: number;
  life: number; maxLife: number; delay: number;
  /** Direction the tip points, in radians (-PI/2 is straight up). */
  angle: number;
  length: number; width: number; bend: number; phase: number;
  size: number; grow: number; rotation: number; spin: number;
  color: string; alpha: number; palette: Palette;
}

const blobSprites = new Map<string, HTMLCanvasElement>();
function blobSprite(color: string): HTMLCanvasElement {
  let sprite = blobSprites.get(color);
  if (!sprite) {
    sprite = document.createElement("canvas");
    sprite.width = sprite.height = 64;
    const paint = sprite.getContext("2d")!;
    const gradient = paint.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, rgba(color, 1));
    gradient.addColorStop(0.45, rgba(color, 0.4));
    gradient.addColorStop(1, rgba(color, 0));
    paint.fillStyle = gradient;
    paint.fillRect(0, 0, 64, 64);
    blobSprites.set(color, sprite);
  }
  return sprite;
}

class FireRenderer {
  private particles: Particle[] = [];
  private frame = 0;
  private last = 0;
  constructor(private readonly context: CanvasRenderingContext2D, private readonly width: number, private readonly height: number, private readonly gutter: number) {}

  add(partial: Partial<Particle> & { kind: Kind }) {
    if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
    const life = Math.min(MAX_FRAMES, partial.life ?? 24);
    this.particles.push({
      x: 0, y: 0, vx: 0, vy: 0, gravity: 0, drag: 1, delay: 0,
      angle: -Math.PI / 2, length: 40, width: 10, bend: 0, phase: Math.random() * 6.28,
      size: 3, grow: 0, rotation: 0, spin: 0, color: "#ffffff", alpha: 1, palette: PALETTES.blaze,
      ...partial, life, maxLife: life,
    });
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
    this.context.clearRect(-this.gutter, -this.gutter, this.width + this.gutter * 2, this.height + this.gutter * 2);
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
    this.context.globalCompositeOperation = "lighter";
    this.context.globalAlpha = Math.min(1, alpha);
    this.context.drawImage(blobSprite(color), x - radius, y - radius, radius * 2, radius * 2);
    this.context.globalAlpha = 1;
  }

  /** The silhouette of one flame blade in local space: base at (0, 0), tip along -y, a pointed tip with slightly concave sides and a rippled edge. */
  private outline(length: number, width: number, bend: number, phase: number) {
    const context = this.context;
    const steps = 14;
    context.beginPath();
    for (let side = 0; side < 2; side += 1) {
      for (let step = 0; step <= steps; step += 1) {
        const t = side ? 1 - step / steps : step / steps;
        const tangentX = 2 * bend * length * t;
        const norm = Math.hypot(tangentX, length) || 1;
        const half = width * Math.sin(Math.PI * Math.sqrt(t)) * (1 - t) ** 0.4 * (1 + 0.16 * Math.sin(t * 10 + phase + side * 1.7));
        const sign = side ? 1 : -1;
        const px = bend * length * t * t + sign * (length / norm) * half;
        const py = -t * length + sign * (tangentX / norm) * half;
        if (side === 0 && step === 0) context.moveTo(px, py);
        else context.lineTo(px, py);
      }
    }
    context.closePath();
  }

  /** Thrust out fast, hold and lick, then burn down from the tip: the same rhythm as a bolt drawing itself and fading. */
  private tongue(p: Particle, age: number) {
    const context = this.context;
    const frames = age * p.maxLife;
    const rise = age < 0.28 ? 1 - (1 - age / 0.28) ** 3 : 1;
    const burn = age < 0.55 ? 1 : 1 - ((age - 0.55) / 0.45) ** 1.6;
    const length = p.length * rise * burn * (1 + 0.06 * Math.sin(frames * 0.9 + p.phase));
    const width = p.width * rise * (0.4 + 0.6 * burn);
    if (length < 2 || width < 0.8) return;
    const bend = p.bend + 0.12 * Math.sin(frames * 0.35 + p.phase * 1.3);
    const dirX = Math.cos(p.angle);
    const dirY = Math.sin(p.angle);
    // Halo behind the blade, like the glow along a bolt.
    this.blob(p.x + dirX * length * 0.4, p.y + dirY * length * 0.4, Math.max(length, width * 3) * 0.55, p.palette[1], 0.22 * rise * burn * p.alpha);
    context.globalCompositeOperation = "source-over";
    context.save();
    context.translate(p.x, p.y);
    context.rotate(p.angle + Math.PI / 2);
    context.globalAlpha = Math.min(1, p.alpha * Math.min(1, burn * 2));
    LAYERS.forEach(([lengthScale, widthScale], layer) => {
      this.outline(length * lengthScale, width * widthScale, bend, p.phase + layer * 0.9);
      context.fillStyle = p.palette[layer]!;
      context.fill();
      if (layer === 0) {
        context.strokeStyle = rgba(p.palette[2], 0.75);
        context.lineWidth = 1;
        context.stroke();
      }
    });
    context.restore();
    context.globalAlpha = 1;
  }

  private draw(p: Particle, remaining: number, alpha: number) {
    const context = this.context;
    switch (p.kind) {
      case "tongue": this.tongue(p, 1 - remaining); break;
      case "glow": this.blob(p.x, p.y, p.size * (1 + p.grow * (1 - remaining)), p.color, alpha); break;
      case "ring": {
        // A thin fire ring: soft wide stroke, orange body, bright line inside.
        context.globalCompositeOperation = "lighter";
        const radius = p.size + p.grow * Math.sqrt(1 - remaining);
        context.beginPath();
        context.arc(p.x, p.y, radius, 0, Math.PI * 2);
        context.strokeStyle = rgba(p.color, alpha * 0.22);
        context.lineWidth = p.width * 3 * remaining + 1;
        context.stroke();
        context.strokeStyle = rgba(p.color, alpha);
        context.lineWidth = p.width * remaining + 0.5;
        context.stroke();
        context.strokeStyle = rgba("#ffffff", alpha * 0.8);
        context.lineWidth = Math.max(0.5, p.width * remaining * 0.35);
        context.stroke();
        break;
      }
      case "spark":
        context.globalCompositeOperation = "lighter";
        context.strokeStyle = rgba(p.color, alpha);
        context.lineWidth = p.size * (0.4 + remaining * 0.6);
        context.beginPath();
        context.moveTo(p.x, p.y);
        context.lineTo(p.x - p.vx * 1.7, p.y - p.vy * 1.7);
        context.stroke();
        break;
      case "cinder": {
        // A crisp little diamond of glowing ash rather than a soft dot.
        const size = p.size * (0.4 + 0.6 * remaining);
        context.globalCompositeOperation = "lighter";
        context.save();
        context.translate(p.x, p.y);
        context.rotate(p.rotation);
        context.fillStyle = rgba(p.color, alpha * (0.65 + 0.35 * Math.random()));
        context.beginPath();
        context.moveTo(0, -size * 1.6);
        context.lineTo(size, 0);
        context.lineTo(0, size * 1.6);
        context.lineTo(-size, 0);
        context.closePath();
        context.fill();
        context.restore();
        break;
      }
    }
  }

  burst(at: FirePoint, tier: FireTier, direction: FirePoint) {
    const force = FORCE[tier];
    const soft = Math.sqrt(force);
    const count = (value: number) => Math.round(value * force);
    const { x, y } = at;

    // Flash and shock ring: a hard white-gold core, then a thin ring of fire, like the flash of a strike.
    this.add({ kind: "glow", x, y, size: 70 * soft, grow: 0.4, life: 6, color: "#fff1c4", alpha: 0.8 });
    this.add({ kind: "glow", x, y, size: 96 * soft, grow: 0.5, life: 14, color: "#ff7a1a", alpha: 0.3 });
    this.add({ kind: "ring", x, y, size: 8, grow: 70 * soft, width: 3.2 * soft, life: 16, color: "#ff9a2e" });
    this.add({ kind: "ring", x, y, size: 6, grow: 46 * soft, width: 2 * soft, life: 12, delay: 2, color: "#ffe9a8" });

    // Jets: flame blades fan out from the hit in a swirl, longest back towards the attacker and shortest into the ground; most fork once, like bolts.
    const jets = { weak: 7, even: 10, strong: 14 }[tier];
    const swirl = Math.random() < 0.5 ? -1 : 1;
    for (let index = 0; index < jets; index += 1) {
      const angle = index / jets * Math.PI * 2 + rnd(-0.18, 0.18);
      const back = -(Math.cos(angle) * direction.x + Math.sin(angle) * direction.y);
      const ground = 1 - 0.35 * Math.max(0, Math.sin(angle));
      const length = rnd(40, 84) * soft * ground * (1 + 0.25 * back);
      const width = rnd(7, 12) * soft;
      const palette = index % 3 === 0 ? PALETTES.hot : index % 2 ? PALETTES.blaze : PALETTES.ember;
      const delay = rnd(0, 2);
      this.add({ kind: "tongue", x: x + Math.cos(angle) * 6, y: y + Math.sin(angle) * 6, angle, length, width, bend: swirl * rnd(0.12, 0.32), life: rnd(22, 30), delay, palette });
      if (Math.random() < 0.7) {
        const forkAngle = angle + (Math.random() < 0.5 ? -1 : 1) * rnd(0.5, 0.9);
        this.add({ kind: "tongue", x: x + Math.cos(angle) * length * 0.45, y: y + Math.sin(angle) * length * 0.45, angle: forkAngle, length: length * 0.42, width: width * 0.55, bend: swirl * rnd(0.1, 0.25), life: rnd(18, 24), delay: delay + 2, palette });
      }
    }

    // A wall of flames rooted in the ground at the hit: back row dark, middle red-orange, front hot yellow.
    const rows = [PALETTES.ember, PALETTES.blaze, PALETTES.hot] as const;
    const perRow = Math.ceil((count(7) + 5) / 3);
    rows.forEach((palette, row) => {
      for (let index = 0; index < perRow; index += 1) {
        const spread = rnd(-1, 1);
        const middle = 1 - spread * spread * 0.55;
        this.add({ kind: "tongue", x: x + spread * 42 * soft, y: y + 16 - row * 2, angle: -Math.PI / 2 + spread * 0.16 + rnd(-0.08, 0.08), length: rnd(44, 84) * soft * (0.55 + middle * 0.6) * (1 - row * 0.1), width: rnd(9, 15) * soft * (1 - row * 0.12) * (0.7 + 0.3 * middle), bend: rnd(-0.3, 0.3), life: rnd(30, 44), delay: rnd(0, 10), palette });
      }
    });
    // Small licks tear loose and rise.
    for (let index = 0; index < count(6); index += 1) {
      this.add({ kind: "tongue", x: x + rnd(-34, 34), y: y + rnd(-2, 12), vy: -rnd(1.8, 3.4), drag: 0.98, angle: -Math.PI / 2 + rnd(-0.3, 0.3), length: rnd(14, 26) * soft, width: rnd(4, 6), bend: rnd(-0.4, 0.4), life: rnd(14, 22), delay: rnd(4, 18), palette: PALETTES.hot });
    }

    for (let index = 0; index < count(14); index += 1) {
      const angle = rnd(0, Math.PI * 2);
      const speed = rnd(5, 13) * soft;
      this.add({ kind: "spark", x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, drag: 0.92, life: rnd(14, 26), size: 1.6, color: pick(SPARK_COLORS) });
    }
    for (let index = 0; index < count(18); index += 1) {
      const angle = rnd(0, Math.PI * 2);
      const speed = rnd(2, 7) * soft;
      this.add({ kind: "cinder", x, y, vx: Math.cos(angle) * speed + direction.x * 2, vy: Math.sin(angle) * speed + direction.y * 2, gravity: -0.05, drag: 0.965, life: rnd(38, 80), size: rnd(1.6, 3.2), rotation: rnd(0, 6.28), spin: rnd(-0.15, 0.15), color: pick(SPARK_COLORS) });
    }
  }

  trail(at: FirePoint, tier: FireTier, direction: FirePoint) {
    const soft = Math.sqrt(FORCE[tier]);
    const { x, y } = at;
    const tip = Math.atan2(-direction.y, -direction.x);
    const drift = { vx: -direction.x * 1.4, vy: -direction.y * 1.4 };
    this.add({ kind: "tongue", x: x + rnd(-6, 6), y: y + rnd(-6, 6), ...drift, angle: tip + rnd(-0.25, 0.25), length: rnd(34, 56) * soft, width: rnd(10, 15) * soft, bend: rnd(-0.25, 0.25), life: rnd(14, 20), palette: PALETTES.ember });
    this.add({ kind: "tongue", x: x + rnd(-5, 5), y: y + rnd(-5, 5), ...drift, angle: tip + rnd(-0.2, 0.2), length: rnd(22, 38) * soft, width: rnd(6, 9) * soft, bend: rnd(-0.25, 0.25), life: rnd(12, 17), palette: PALETTES.hot });
    this.add({ kind: "cinder", x: x + rnd(-18, 18), y: y + rnd(-12, 12), ...drift, gravity: -0.06, life: 20, size: 2, rotation: rnd(0, 6.28), spin: rnd(-0.15, 0.15), color: pick(SPARK_COLORS) });
    if (Math.random() < 0.35) this.add({ kind: "spark", x: x + rnd(-14, 14), y: y + rnd(-14, 14), vx: drift.vx * 2.5, vy: drift.vy * 2.5, life: 12, size: 1.5, color: "#ffd25a" });
  }
}

/** A canvas of its own for fire, positioned like the battle layer's other effect canvas (the layer must be position: absolute). */
export const FireEffect = forwardRef<FireEffectHandle, FireEffectProps>(function FireEffect({ width, height, gutter = 64 }, ref) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<FireRenderer | null>(null);

  useLayoutEffect(() => {
    const element = canvas.current;
    const context = element?.getContext("2d");
    if (!element || !context) return;
    const ratio = Math.min(FX_MAX_DPR, window.devicePixelRatio || 1);
    element.width = Math.max(1, Math.round((width + gutter * 2) * ratio));
    element.height = Math.max(1, Math.round((height + gutter * 2) * ratio));
    context.setTransform(ratio, 0, 0, ratio, gutter * ratio, gutter * ratio);
    const fire = new FireRenderer(context, width, height, gutter);
    renderer.current = fire;
    return () => {
      fire.stop();
      renderer.current = null;
    };
  }, [width, height, gutter]);

  useImperativeHandle(ref, () => ({
    burst: (at, tier, direction) => renderer.current?.burst(at, tier, direction),
    trail: (at, tier, direction) => renderer.current?.trail(at, tier, direction),
    stop: () => renderer.current?.stop(),
  }), []);

  return (
    <canvas
      ref={canvas}
      aria-hidden="true"
      style={{ position: "absolute", zIndex: 3, left: -gutter, top: -gutter, width: width + gutter * 2, height: height + gutter * 2, pointerEvents: "none" }}
    />
  );
});