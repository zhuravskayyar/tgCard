import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { CardElement, DuelExchange } from "@cardastika/shared";
import { getBrightCutMaterialId } from "../cards/brightCutModel";
import { CardFxWrapper } from "./CardFxWrapper";
import { CardHud } from "./CardHud";
import "./battle-attack.css";

export const BATTLE_ATTACK_DURATION_MS = 1050;

type CardPosition = CSSProperties & {
  "--attack-x": string;
  "--attack-y": string;
  "--attack-lift-y": string;
};

interface AttackGeometry {
  player: CardPosition;
  enemy: CSSProperties;
  impact: { x: number; y: number };
  playerDamage: { x: number; y: number };
  enemyDamage: { x: number; y: number };
}

type ImpactParticleShape = "spark" | "ember" | "drop" | "shard" | "leaf" | "dust" | "bolt";

interface ImpactParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  drag: number;
  rotation: number;
  spin: number;
  size: number;
  color: string;
  shape: ImpactParticleShape;
  life: number;
  maximumLife: number;
}

const ELEMENT_COLORS: Record<CardElement, { core: string; glow: string; fragment: string }> = {
  fire: { core: "#fff0b5", glow: "#ff742b", fragment: "#ffb34f" },
  water: { core: "#e8fbff", glow: "#39bfff", fragment: "#a9e8ff" },
  earth: { core: "#efffc5", glow: "#8fcb50", fragment: "#836847" },
  air: { core: "#fffce0", glow: "#f3d14c", fragment: "#f9e38b" },
};

function randomBetween(minimum: number, maximum: number) {
  return minimum + Math.random() * (maximum - minimum);
}

function createImpactParticles(element: CardElement, level: "weak" | "normal" | "strong", metallic: boolean, x: number, y: number) {
  const palette = ELEMENT_COLORS[element];
  const particles: ImpactParticle[] = [];
  const strong = level === "strong";
  const weak = level === "weak";
  const count = (strong ? 36 : weak ? 14 : 24) + (metallic ? 10 : 0);
  const speedScale = weak ? 0.62 : 1;

  for (let index = 0; index < count; index += 1) {
    const angle = randomBetween(0, Math.PI * 2);
    const speed = (element === "water" ? randomBetween(2.5, 8) : randomBetween(2, strong ? 10 : 7)) * speedScale;
    const shape: ImpactParticleShape = metallic
      ? index % 4 === 0 ? "spark" : element === "fire" ? "ember" : element === "water" ? "drop" : "shard"
      : element === "fire" ? index % 5 === 0 ? "dust" : "ember"
        : element === "water" ? "drop"
          : element === "earth" ? index % 4 === 0 ? "leaf" : "shard"
            : index % 3 === 0 ? "bolt" : "spark";
    const color = metallic && index % 3 === 0
      ? index % 2 === 0 ? "#fff2c2" : "#d8e7eb"
      : shape === "dust" ? "#46372b"
        : shape === "shard" && element === "earth" ? ["#584530", "#8e7148", "#b2a076"][index % 3]!
          : shape === "leaf" ? ["#72a83f", "#b4d976", "#d9eaa0"][index % 3]!
            : shape === "drop" ? ["#ffffff", "#a9e8ff", palette.glow][index % 3]!
              : shape === "bolt" ? palette.glow
                : shape === "spark" ? palette.core
                  : [palette.glow, palette.fragment, "#fff0b5"][index % 3]!;
    const lifetime = randomBetween(18, strong ? 36 : 30);
    particles.push({
      x: x + Math.cos(angle) * randomBetween(0, 7),
      y: y + Math.sin(angle) * randomBetween(0, 7),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed + (element === "water" ? -2 : element === "fire" ? -1.5 : 0),
      gravity: element === "earth" || element === "water" ? 0.16 : element === "fire" ? -0.035 : 0,
      drag: element === "earth" ? 0.975 : 0.96,
      rotation: angle,
      spin: randomBetween(-0.16, 0.16),
      size: shape === "dust" ? randomBetween(8, 17) : shape === "shard" ? randomBetween(3.5, 8) : randomBetween(1.4, 3.5),
      color,
      shape,
      life: lifetime,
      maximumLife: lifetime,
    });
  }
  return particles;
}

function drawParticle(context: CanvasRenderingContext2D, particle: ImpactParticle) {
  const alpha = Math.max(0, particle.life / particle.maximumLife);
  context.save();
  context.globalAlpha = alpha;
  context.translate(particle.x, particle.y);
  context.rotate(particle.rotation);
  context.fillStyle = particle.color;
  context.strokeStyle = particle.color;

  if (particle.shape === "spark" || particle.shape === "bolt") {
    const length = particle.shape === "bolt" ? particle.size * 7 : particle.size * 3.5;
    context.lineWidth = particle.shape === "bolt" ? 1.8 : 1.25;
    context.beginPath();
    context.moveTo(-length * 0.3, 0);
    if (particle.shape === "bolt") {
      context.lineTo(-length * 0.12, -particle.size * 0.8);
      context.lineTo(length * 0.02, particle.size * 0.45);
      context.lineTo(length * 0.18, -particle.size * 0.55);
    }
    context.lineTo(length * 0.7, 0);
    context.stroke();
  } else if (particle.shape === "drop") {
    context.beginPath();
    context.ellipse(0, 0, particle.size * 0.52, particle.size * 1.25, 0, 0, Math.PI * 2);
    context.fill();
  } else if (particle.shape === "shard" || particle.shape === "leaf") {
    const size = particle.size;
    context.beginPath();
    context.moveTo(-size, -size * 0.45);
    context.lineTo(size * 0.2, -size * 0.8);
    context.lineTo(size, size * 0.35);
    context.lineTo(-size * 0.45, size * 0.8);
    context.closePath();
    context.fill();
  } else if (particle.shape === "dust") {
    context.shadowColor = particle.color;
    context.shadowBlur = particle.size * 1.7;
    context.beginPath();
    context.arc(0, 0, particle.size, 0, Math.PI * 2);
    context.fill();
  } else {
    context.shadowColor = particle.color;
    context.shadowBlur = particle.size * 2.2;
    context.beginPath();
    context.arc(0, 0, particle.size, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

function drawImpactFrame(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  center: { x: number; y: number },
  element: CardElement,
  level: "weak" | "normal" | "strong",
  particles: ImpactParticle[],
  progress: number,
  deltaFrames: number,
) {
  const palette = ELEMENT_COLORS[element];
  const scale = level === "strong" ? 1.16 : level === "weak" ? 0.72 : 1;
  const intensity = Math.sin(Math.min(1, progress) * Math.PI) * scale;
  const radius = 8 + progress * 74 * scale;

  if (intensity > 0) {
    const flash = context.createRadialGradient(center.x, center.y, 0, center.x, center.y, 36 + intensity * 30);
    flash.addColorStop(0, `${palette.core}${Math.round(intensity * 88).toString(16).padStart(2, "0")}`);
    flash.addColorStop(0.35, `${palette.glow}${Math.round(intensity * 44).toString(16).padStart(2, "0")}`);
    flash.addColorStop(1, `${palette.glow}00`);
    context.fillStyle = flash;
    context.fillRect(0, 0, width, height);
  }

  context.save();
  context.globalAlpha = Math.max(0, 1 - progress);
  context.strokeStyle = palette.core;
  context.lineWidth = Math.max(1, 4 - progress * 3);
  context.shadowColor = palette.glow;
  context.shadowBlur = 14;
  context.beginPath();
  if (element === "water") context.ellipse(center.x, center.y, radius * 1.12, radius * 0.78, 0, 0, Math.PI * 2);
  else context.arc(center.x, center.y, radius, 0, Math.PI * 2);
  context.stroke();

  if (element === "air") {
    for (let ray = 0; ray < 7; ray += 1) {
      const angle = Math.PI * 2 * ray / 7 + 0.2;
      const length = (28 + progress * 42) * scale;
      context.beginPath();
      context.moveTo(center.x + Math.cos(angle) * 10, center.y + Math.sin(angle) * 10);
      context.lineTo(center.x + Math.cos(angle + 0.05) * length * 0.48, center.y + Math.sin(angle + 0.05) * length * 0.48);
      context.lineTo(center.x + Math.cos(angle - 0.04) * length, center.y + Math.sin(angle - 0.04) * length);
      context.stroke();
    }
  }
  context.restore();

  for (const particle of particles) {
    if (particle.life <= 0) continue;
    particle.x += particle.vx * deltaFrames;
    particle.y += particle.vy * deltaFrames;
    particle.vx *= particle.drag ** deltaFrames;
    particle.vy = particle.vy * particle.drag ** deltaFrames + particle.gravity * deltaFrames;
    particle.rotation += particle.spin * deltaFrames;
    particle.life -= deltaFrames;
    drawParticle(context, particle);
  }
}

function drawAttackTrail(
  context: CanvasRenderingContext2D,
  geometry: AttackGeometry,
  element: CardElement,
  level: "weak" | "normal" | "strong",
  metallic: boolean,
  progress: number,
) {
  const flightStart = 0.24;
  const flightEnd = 0.5;
  if (progress < flightStart || progress > flightEnd) return;

  const flightProgress = Math.max(0, Math.min(1, (progress - flightStart) / (flightEnd - flightStart)));
  const easedProgress = 1 - (1 - flightProgress) ** 3;
  const fromX = Number(geometry.player.left ?? 0) + Number(geometry.player.width ?? 0) / 2;
  const fromY = Number(geometry.player.top ?? 0) + Number(geometry.player.height ?? 0) * (0.5 - 0.055);
  const tailProgress = Math.max(0, easedProgress - (level === "weak" ? 0.18 : 0.3));
  const tailX = fromX + (geometry.impact.x - fromX) * tailProgress;
  const tailY = fromY + (geometry.impact.y - fromY) * tailProgress;
  const headX = fromX + (geometry.impact.x - fromX) * easedProgress;
  const headY = fromY + (geometry.impact.y - fromY) * easedProgress;
  const palette = ELEMENT_COLORS[element];
  const alpha = Math.sin(flightProgress * Math.PI * 0.72) * 0.82;
  const weight = level === "strong" ? 1.25 : level === "weak" ? 0.72 : 1;

  context.save();
  context.globalAlpha = alpha;
  context.strokeStyle = palette.glow;
  context.lineWidth = 6 * weight;
  context.lineCap = "round";
  context.shadowColor = palette.glow;
  context.shadowBlur = 14 * weight;
  context.beginPath();
  context.moveTo(tailX, tailY);
  context.lineTo(headX, headY);
  context.stroke();

  for (let index = 0; index < 7; index += 1) {
    const sample = Math.max(0, easedProgress - index * 0.055);
    const wobble = Math.sin(progress * 88 + index * 2.1) * (2 + index * 0.45);
    const x = fromX + (geometry.impact.x - fromX) * sample + wobble;
    const y = fromY + (geometry.impact.y - fromY) * sample - wobble * 0.6;
    context.globalAlpha = alpha * (1 - index / 8);
    context.fillStyle = metallic && index % 3 === 0 ? "#fff0bd" : palette.core;
    context.beginPath();
    context.arc(x, y, (level === "strong" ? 2.6 : 2) * (1 - index * 0.06), 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

function getEffectLevel(exchange: DuelExchange) {
  return exchange.playerMultiplier < 1 ? "weak" : exchange.playerMultiplier > 1 ? "strong" : "normal";
}

/** One measured attack motion shared by every battle mode. */
export function BattleAttackAnimation({ exchange }: { exchange: DuelExchange }) {
  const layer = useRef<HTMLDivElement>(null);
  const impactCanvas = useRef<HTMLCanvasElement>(null);
  const [geometry, setGeometry] = useState<AttackGeometry | null>(null);
  const level = getEffectLevel(exchange);

  useLayoutEffect(() => {
    const root = layer.current;
    const board = root?.parentElement;
    if (!root || !board) return;

    const measure = () => {
      const playerRow = board.querySelector(".duel-card-row--player, .arena-card-row:not(.arena-card-row--target)");
      const enemyRow = board.querySelector(".duel-card-row--enemy, .arena-card-row--target");
      const slotCard = (row: Element | null) => {
        const slot = row?.children[exchange.slotIndex];
        return (slot?.matches(".duel-card") ? slot : slot?.querySelector(".duel-card, .arena-hidden-card")) as HTMLElement | null;
      };
      const player = slotCard(playerRow);
      const enemy = slotCard(enemyRow);
      if (!player || !enemy) return;

      const origin = root.getBoundingClientRect();
      const from = player.getBoundingClientRect();
      const to = enemy.getBoundingClientRect();
      const position = (rect: DOMRect): CSSProperties => ({
        left: rect.left - origin.left,
        top: rect.top - origin.top,
        width: rect.width,
        height: rect.height,
      });
      const fromPosition = position(from);
      const toPosition = position(to);
      setGeometry({
        player: {
          ...fromPosition,
          "--attack-x": `${to.left + to.width / 2 - from.left - from.width / 2}px`,
          "--attack-y": `${to.top + to.height / 2 - from.top - from.height / 2}px`,
          "--attack-lift-y": `${from.height * -0.055}px`,
        } as CardPosition,
        enemy: toPosition,
        impact: { x: to.left - origin.left + to.width / 2, y: to.top - origin.top + to.height / 2 },
        playerDamage: { x: from.left - origin.left + from.width / 2, y: from.top - origin.top + 8 },
        enemyDamage: { x: to.left - origin.left + to.width / 2, y: to.top - origin.top + 8 },
      });
      player.dataset.attackCovered = "true";
      enemy.dataset.attackCovered = "true";
    };

    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(board);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
      board.querySelectorAll('[data-attack-covered="true"]').forEach((card) => delete (card as HTMLElement).dataset.attackCovered);
    };
  }, [exchange]);

  useLayoutEffect(() => {
    const canvas = impactCanvas.current;
    const root = layer.current;
    if (!canvas || !root || !geometry) return;
    const bounds = root.getBoundingClientRect();
    const width = bounds.width;
    const height = bounds.height;
    const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(width * pixelRatio));
    canvas.height = Math.max(1, Math.round(height * pixelRatio));
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

    let frame = 0;
    let impactTimer = 0;
    let cleanupTimer = 0;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const duration = 560;
    const impactDelay = Math.round(BATTLE_ATTACK_DURATION_MS * 0.4);
    const metallic = getBrightCutMaterialId(exchange.playerCard.rarity) !== "paper";

    const makeImpactParticles = () => createImpactParticles(
        exchange.playerCard.element,
        level,
        metallic,
        geometry.impact.x,
        geometry.impact.y,
      );

    if (reducedMotion) {
      impactTimer = window.setTimeout(() => {
        const particles = makeImpactParticles();
        context.clearRect(0, 0, width, height);
        drawImpactFrame(context, width, height, geometry.impact, exchange.playerCard.element, level, particles, 0.44, 0);
        cleanupTimer = window.setTimeout(() => context.clearRect(0, 0, width, height), 220);
      }, impactDelay);
    } else {
      const startedAt = performance.now();
      let previousFrameAt = startedAt;
      let particles: ImpactParticle[] | null = null;
      const render = (time: number) => {
        const elapsed = time - startedAt;
        const progress = Math.min(1, elapsed / BATTLE_ATTACK_DURATION_MS);
        const deltaFrames = Math.max(0.5, Math.min(2.5, (time - previousFrameAt) / (1000 / 60)));
        previousFrameAt = time;
        context.clearRect(0, 0, width, height);
        drawAttackTrail(context, geometry, exchange.playerCard.element, level, metallic, progress);
        if (elapsed >= impactDelay) {
          particles ??= makeImpactParticles();
          const impactProgress = Math.min(1, (elapsed - impactDelay) / duration);
          drawImpactFrame(context, width, height, geometry.impact, exchange.playerCard.element, level, particles, impactProgress, deltaFrames);
        }
        if (elapsed < BATTLE_ATTACK_DURATION_MS) frame = window.requestAnimationFrame(render);
      };
      frame = window.requestAnimationFrame(render);
    }

    return () => {
      window.clearTimeout(impactTimer);
      window.clearTimeout(cleanupTimer);
      window.cancelAnimationFrame(frame);
      context.clearRect(0, 0, width, height);
    };
  }, [exchange, geometry, level]);

  return (
    <div ref={layer} className={`battle-attack battle-attack--${level}`} aria-hidden="true" style={{ "--attack-duration": `${BATTLE_ATTACK_DURATION_MS}ms` } as CSSProperties}>
      <canvas ref={impactCanvas} className="battle-attack__fx" />
      {geometry ? (["enemy", "player"] as const).map((side) => {
        const card = side === "player" ? exchange.playerCard : exchange.enemyCard;
        return (
          <div key={side} className={`duel-card battle-attack__card battle-attack__card--${side} deck-card--${card.element} deck-card--${card.rarity}`} style={geometry[side]}>
            <CardFxWrapper artKey={card.artKey} cardId={card.cardId} compact element={card.element} rarity={card.rarity}>
              <CardHud element={card.element} power={card.finalPower} rarity={card.rarity} />
              {card.source === "guild" ? <span className="duel-card__guild-mark">Гільдія</span> : null}
            </CardFxWrapper>
          </div>
        );
      }) : null}
      {geometry ? <>
        <span className="battle-attack__damage battle-attack__damage--player" style={{ left: geometry.enemyDamage.x, top: geometry.enemyDamage.y }}>−{exchange.playerDamage}</span>
        <span className="battle-attack__damage battle-attack__damage--enemy" style={{ left: geometry.playerDamage.x, top: geometry.playerDamage.y }}>−{exchange.enemyDamage}</span>
      </> : null}
    </div>
  );
}
