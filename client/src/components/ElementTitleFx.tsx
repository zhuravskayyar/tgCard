import { useEffect, useRef, useState, type ReactNode } from "react";
import type { CardElement } from "@cardastika/shared";
import { ELEMENT_FINISH } from "../cards/brightCutModel";

/** The title cycles through the four elements; each one leaves its own particles around the letters. */
const CYCLE: readonly CardElement[] = ["fire", "water", "earth", "air"];
const ELEMENT_MS = 3200;
const MAX_DPR = 1.5;
const MAX_PARTICLES = 140;

interface Particle {
  kind: "ember" | "drop" | "ripple" | "leaf" | "pebble" | "wind";
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  age: number;
  size: number;
  spin: number;
  angle: number;
  color: string;
}

const rnd = (min: number, max: number) => min + Math.random() * (max - min);

function spawn(element: CardElement, box: DOMRect): Particle[] {
  const finish = ELEMENT_FINISH[element];
  const x = rnd(box.left, box.right);
  if (element === "fire") {
    return [{ kind: "ember", x, y: rnd(box.top, box.top + box.height * 0.6), vx: rnd(-0.25, 0.25), vy: rnd(-1.1, -0.5), life: rnd(40, 70), age: 0, size: rnd(1.2, 2.6), spin: rnd(0.08, 0.2), angle: rnd(0, 6.28), color: Math.random() < 0.5 ? finish.rim : finish.spark }];
  }
  if (element === "water") {
    return [{ kind: "drop", x, y: box.bottom - 4, vx: 0, vy: rnd(0.2, 0.6), life: rnd(36, 52), age: 0, size: rnd(1.6, 2.6), spin: 0, angle: 0, color: finish.rim }];
  }
  if (element === "earth") {
    const leaf = Math.random() < 0.6;
    return [{ kind: leaf ? "leaf" : "pebble", x, y: rnd(box.top - 6, box.top + box.height * 0.4), vx: rnd(-0.5, 0.5), vy: rnd(0.15, 0.5), life: rnd(50, 80), age: 0, size: leaf ? rnd(3, 5) : rnd(1.4, 2.4), spin: rnd(-0.12, 0.12), angle: rnd(0, 6.28), color: leaf ? (Math.random() < 0.5 ? finish.rim : finish.mid) : "#6b4a2a" }];
  }
  return [{ kind: "wind", x: box.left - rnd(0, 20), y: rnd(box.top, box.bottom), vx: rnd(2.2, 3.4), vy: 0, life: rnd(46, 66), age: 0, size: rnd(14, 26), spin: rnd(0.08, 0.16), angle: rnd(0, 6.28), color: Math.random() < 0.5 ? finish.rim : finish.core }];
}

function draw(context: CanvasRenderingContext2D, particle: Particle) {
  const fade = Math.min(1, particle.age / 8) * (1 - particle.age / particle.life);
  context.globalAlpha = Math.max(0, fade);
  context.fillStyle = particle.color;
  context.strokeStyle = particle.color;
  switch (particle.kind) {
    case "ember": {
      const flicker = 0.7 + 0.3 * Math.sin(particle.angle);
      context.shadowColor = particle.color;
      context.shadowBlur = 6;
      context.beginPath();
      context.arc(particle.x, particle.y, particle.size * flicker, 0, Math.PI * 2);
      context.fill();
      context.shadowBlur = 0;
      break;
    }
    case "drop":
      context.beginPath();
      context.ellipse(particle.x, particle.y, particle.size * 0.7, particle.size * 1.3, 0, 0, Math.PI * 2);
      context.fill();
      break;
    case "ripple": {
      const grow = particle.age / particle.life;
      context.lineWidth = 1;
      context.beginPath();
      context.ellipse(particle.x, particle.y, particle.size + grow * 12, (particle.size + grow * 12) * 0.32, 0, 0, Math.PI * 2);
      context.stroke();
      break;
    }
    case "leaf":
      context.save();
      context.translate(particle.x, particle.y);
      context.rotate(particle.angle);
      context.beginPath();
      context.ellipse(0, 0, particle.size, particle.size * 0.42, 0, 0, Math.PI * 2);
      context.fill();
      context.restore();
      break;
    case "pebble":
      context.beginPath();
      context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      context.fill();
      break;
    case "wind":
      context.lineWidth = 1.4;
      context.lineCap = "round";
      context.beginPath();
      context.moveTo(particle.x - particle.size, particle.y);
      context.quadraticCurveTo(particle.x - particle.size / 2, particle.y - 4 * Math.sin(particle.angle), particle.x, particle.y);
      context.stroke();
      break;
  }
}

/** Advances one particle; dt is in 60fps frames so motion is the same on 60Hz and 120Hz screens. */
function step(particle: Particle, born: Particle[], floor: number, dt: number) {
  particle.age += dt;
  particle.angle += particle.spin * dt;
  particle.x += particle.vx * dt;
  particle.y += particle.vy * dt;
  if (particle.kind === "ember") particle.vx += Math.sin(particle.angle) * 0.03 * dt;
  if (particle.kind === "drop") {
    particle.vy += 0.09 * dt;
    if (particle.y > floor) {
      particle.age = particle.life;
      born.push({ ...particle, kind: "ripple", y: floor, vy: 0, age: 0, life: 26, size: 2 });
    }
  }
  if (particle.kind === "leaf") particle.vx += Math.sin(particle.angle) * 0.05 * dt;
  if (particle.kind === "pebble") particle.vy += 0.06 * dt;
  if (particle.kind === "wind") particle.y += Math.sin(particle.angle) * 0.6 * dt;
}

/** Wraps the title text: tints it with the active element and draws that element's particles around it. */
export function ElementTitleFx({ children }: { children: ReactNode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [element, setElement] = useState<CardElement>(CYCLE[0]!);
  const elementRef = useRef(element);
  elementRef.current = element;

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => !document.hidden && setElement((current) => CYCLE[(CYCLE.indexOf(current) + 1) % CYCLE.length]!), ELEMENT_MS);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const text = textRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !text || !context || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const particles: Particle[] = [];
    let frame = 0;
    let carry = 0;
    let width = 0;
    let height = 0;
    let ratio = 0;
    let last = performance.now();

    const resize = () => {
      const nextRatio = Math.min(MAX_DPR, window.devicePixelRatio || 1);
      // Reallocating the bitmap is costly; only do it when the size really changed.
      if (canvas.clientWidth === width && canvas.clientHeight === height && nextRatio === ratio) return;
      ratio = nextRatio;
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.max(1, Math.round(width * ratio));
      canvas.height = Math.max(1, Math.round(height * ratio));
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const dt = Math.min(3, Math.max(0, (now - last) / (1000 / 60)));
      last = now;
      if (document.hidden) return;
      const origin = canvas.getBoundingClientRect();
      const glyphs = text.getBoundingClientRect();
      const box = new DOMRect(glyphs.left - origin.left, glyphs.top - origin.top, glyphs.width, glyphs.height);
      // Capped so a full board does not release a burst of saved-up spawns later.
      carry = Math.min(2, carry + (elementRef.current === "air" ? 0.35 : 0.6) * dt);
      while (carry >= 1 && particles.length < MAX_PARTICLES) {
        carry -= 1;
        particles.push(...spawn(elementRef.current, box));
      }
      const born: Particle[] = [];
      context.clearRect(0, 0, width, height);
      for (let index = particles.length - 1; index >= 0; index -= 1) {
        const particle = particles[index]!;
        step(particle, born, box.bottom + 8, dt);
        if (particle.age >= particle.life || particle.x > width + 30) particles.splice(index, 1);
        else draw(context, particle);
      }
      particles.push(...born);
      context.globalAlpha = 1;
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  return (
    <span className="element-title" data-element={element}>
      <canvas aria-hidden="true" className="element-title__fx" ref={canvasRef} />
      <span className="auth-screen__title-text" ref={textRef}>{children}</span>
    </span>
  );
}
