import { useEffect, useId, useRef } from "react";

interface ExperienceVineProps {
  level: number;
  progress: number;
}

interface VineController {
  setProgress: (progress: number, level: number) => void;
  destroy: () => void;
}

const NS = "http://www.w3.org/2000/svg";
const X0 = 22;
const X1 = 498;
const LEAF_COUNT = 18;
const LEAF_SHAPE = "M0 0C2 -5 4 -8 8 -8C9 -11 13 -12 15 -9C18 -11 22 -8 21 -5C24 -3 26 -1 28 0C26 2 24 4 21 5C22 8 18 11 15 9C13 12 9 11 8 8C4 8 2 5 0 0Z";
const LEAF_VEIN = "M1 0L26 0M6 0L10 -5M6 0L10 5M13 0L17 -5M13 0L17 5M20 0L23 -3M20 0L23 3";
const MOTE_COLORS = ["#f2b83a", "#ffe08a", "#c8922a"];

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function easeOutBack(t: number) {
  const c = 1.7;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
}

function svgElement(name: string, attributes: Record<string, string | number>, parent?: Element) {
  const element = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  parent?.appendChild(element);
  return element;
}

// Builds the vine once and animates only while the displayed progress catches up with the target.
function mountVine(svg: SVGSVGElement, prefix: string, reduceMotion: boolean): VineController {
  const part = (name: string) => svg.querySelector<SVGElement>(`[data-part="${name}"]`)!;
  const ref = (name: string) => `url(#${prefix}-${name})`;
  let seed = 11;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };

  const points: Array<[number, number]> = [];
  let path = "";
  for (let x = X0; x <= X1; x += 3) {
    const y = 35 + 2.2 * Math.sin(x / 60) + 0.8 * Math.sin(x / 17 + 0.8);
    points.push([x, y]);
    path += `${x === X0 ? "M" : "L"}${x} ${y.toFixed(1)}`;
  }
  for (const name of ["dead2", "dead", "vine", "hl", "halo", "halo2"]) part(name).setAttribute("d", path);

  const top: string[] = [];
  const bottom: string[] = [];
  let ticks = "";
  points.forEach(([x, y], index) => {
    const next = points[Math.min(index + 1, points.length - 1)];
    const previous = points[Math.max(index - 1, 0)];
    const dx = next[0] - previous[0];
    const dy = next[1] - previous[1];
    const length = Math.hypot(dx, dy);
    const nx = -dy / length;
    const ny = dx / length;
    const halfWidth = (3.8 - 2.5 * (x - X0) / (X1 - X0)) / 2;
    top.push(`${(x + nx * halfWidth).toFixed(1)} ${(y + ny * halfWidth).toFixed(1)}`);
    bottom.push(`${(x - nx * halfWidth).toFixed(1)} ${(y - ny * halfWidth).toFixed(1)}`);
    if (index % 2 === 0) {
      ticks += `M${(x + nx * halfWidth * 0.8).toFixed(1)} ${(y + ny * halfWidth * 0.8).toFixed(1)}L${(x - nx * halfWidth * 0.8 + 1.4).toFixed(1)} ${(y - ny * halfWidth * 0.8).toFixed(1)}`;
    }
  });
  part("stem").setAttribute("d", `M${top.join("L")}L${bottom.reverse().join("L")}Z`);
  part("ticks").setAttribute("d", ticks);

  const vine = part("vine") as SVGPathElement;
  const totalLength = vine.getTotalLength();
  const at = (position: number) => {
    const clamped = Math.max(0, Math.min(totalLength - 2.1, position));
    const a = vine.getPointAtLength(clamped);
    const b = vine.getPointAtLength(clamped + 2);
    return { x: a.x, y: a.y, heading: Math.atan2(b.y - a.y, b.x - a.x) };
  };

  const leaves = Array.from({ length: LEAF_COUNT }, (_, index) => {
    const position = totalLength * (index + 0.6) / (LEAF_COUNT + 0.5);
    const point = at(position);
    const side = index % 2 ? 1 : -1;
    const group = svgElement("g", {}, part("leaves"));
    svgElement("path", { d: `M0 0Q3 ${-side} 6 0`, fill: "none", stroke: "#2e2014", "stroke-width": 0.9 }, group);
    const leaf = svgElement("g", { transform: "translate(6 0)" }, group);
    svgElement("path", { d: LEAF_SHAPE, fill: ref(index % 3 ? "leaf-a" : "leaf-b"), stroke: "#2e2014", "stroke-width": 0.9, "stroke-linejoin": "round" }, leaf);
    svgElement("path", { d: LEAF_VEIN, fill: "none", stroke: "#2e2014", "stroke-width": 0.55, opacity: 0.7, "stroke-linecap": "round" }, leaf);
    const glow = svgElement("g", {}, part("leafglow"));
    svgElement("path", { d: LEAF_SHAPE, fill: "#ffd470" }, svgElement("g", { transform: "translate(6 0)" }, glow));
    return { position, x: point.x, y: point.y, angle: point.heading * 180 / Math.PI + side * (24 + random() * 14), size: 0.5 + random() * 0.2, side, group, glow };
  });

  const tendrils = [2, 6, 10, 14].map((index, order) => {
    const position = totalLength * (index + 0.2) / (LEAF_COUNT + 0.5);
    const point = at(position);
    const side = order % 2 ? -1 : 1;
    let heading = point.heading + side * 1.3;
    let { x, y } = point;
    let d = `M${x.toFixed(1)} ${y.toFixed(1)}`;
    for (let step = 0; step < 50; step += 1) {
      const t = step / 50;
      heading += -side * (0.015 + 0.28 * t * t);
      x += 0.9 * Math.cos(heading);
      y += 0.9 * Math.sin(heading);
      d += `L${x.toFixed(1)} ${y.toFixed(1)}`;
    }
    const element = svgElement("path", { d }, part("tendrils")) as SVGPathElement;
    const bead = svgElement("circle", { cx: x, cy: y, r: 1.5, fill: "#f2b83a", stroke: "#3a2a1c", "stroke-width": 0.4, filter: ref("glow") }, part("beads"));
    return { position, element, bead, length: element.getTotalLength() };
  });

  const flower = (parent: Element, size: number) => {
    const group = svgElement("g", {}, parent);
    for (let petal = 0; petal < 5; petal += 1) {
      svgElement("path", { d: "M0 0C3.4 -3 3.4 -9 0 -13C-3.4 -9 -3.4 -3 0 0Z", fill: ref("petal"), stroke: "#2e2014", "stroke-width": 0.9 / size * 0.5, transform: `rotate(${petal * 72}) scale(${size})` }, group);
    }
    svgElement("circle", { r: 2 * size, fill: "#f2b83a", stroke: "#2e2014", "stroke-width": 0.4, filter: ref("glow") }, group);
  };

  const blooms = [3, 7, 11, 15].map((index, order) => {
    const position = totalLength * (index + 0.6) / (LEAF_COUNT + 0.5);
    const point = at(position);
    const side = order % 2 ? 1 : -1;
    const group = svgElement("g", {}, part("blooms"));
    svgElement("path", { d: `M0 0Q3 ${-side} 6 0`, fill: "none", stroke: "#2e2014", "stroke-width": 0.9 }, group);
    flower(svgElement("g", { transform: "translate(7 0)" }, group), 0.36 + order * 0.03);
    return { position, x: point.x, y: point.y, angle: point.heading * 180 / Math.PI + side * 80, group, end: false };
  });
  const endPoint = at(totalLength);
  const endGroup = svgElement("g", {}, part("blooms"));
  flower(svgElement("g", { transform: "translate(4 0)" }, endGroup), 0.6);
  blooms.push({ position: totalLength, x: endPoint.x, y: endPoint.y, angle: -90, group: endGroup, end: true });

  const nodes = [0.25, 0.5, 0.75].map((fraction) => {
    const point = at(totalLength * fraction);
    const element = svgElement("path", { d: "M0 -3.6L2.6 0L0 3.6L-2.6 0Z", transform: `translate(${point.x.toFixed(1)} ${point.y.toFixed(1)})`, "stroke-width": 0.8, stroke: "#2e2014" }, part("nodes"));
    return { position: totalLength * fraction, element, lit: null as boolean | null };
  });

  const mote = (x: number, y: number, far: boolean) => {
    const circle = svgElement("circle", { cx: x, cy: y, r: (0.6 + Math.random() * 1.1).toFixed(1), fill: MOTE_COLORS[Math.floor(Math.random() * 3)], class: "experience-vine__mote" }, part("sparks")) as SVGCircleElement;
    circle.style.setProperty("--dx", `${((Math.random() - 0.5) * (far ? 36 : 20)).toFixed(0)}px`);
    circle.style.setProperty("--dy", `${(-10 - Math.random() * (far ? 28 : 16)).toFixed(0)}px`);
    circle.style.setProperty("--t", `${(1.2 + Math.random() * 1.2).toFixed(1)}s`);
    window.setTimeout(() => circle.remove(), 2500);
  };

  let shown = 0;
  let target = 0;
  let pendingTarget: number | null = null;
  let currentLevel: number | null = null;
  let frame = 0;
  let last = 0;
  let flashTimer = 0;

  const render = (growing: boolean) => {
    const length = shown * totalLength;
    const visible = length > 1;
    const tip = at(Math.min(length, totalLength));
    const dash = `${length} ${totalLength + 10}`;
    for (const name of ["hl", "halo", "halo2"]) part(name).setAttribute("stroke-dasharray", dash);
    part("clip").setAttribute("width", String(visible ? tip.x + 1 : 0));
    const bark = part("bark");
    bark.setAttribute("x1", String(tip.x - 130));
    bark.setAttribute("x2", String(tip.x));
    part("tip").setAttribute("transform", `translate(${tip.x.toFixed(1)} ${tip.y.toFixed(1)})`);
    part("tip").setAttribute("opacity", visible ? "1" : "0");
    part("halo").setAttribute("opacity", String(visible ? 0.25 + 0.5 * shown : 0));
    part("halo2").setAttribute("opacity", String(visible ? 0.12 + 0.35 * shown : 0));
    part("leafglow").setAttribute("opacity", String(visible ? (0.2 + 0.5 * shown) * 0.7 : 0));
    for (const leaf of leaves) {
      const t = clamp01((length - leaf.position) / 34);
      const scale = t ? easeOutBack(t) * leaf.size : 0;
      const transform = `translate(${leaf.x.toFixed(1)} ${leaf.y.toFixed(1)}) rotate(${leaf.angle.toFixed(1)}) scale(${scale.toFixed(3)} ${(scale * leaf.side).toFixed(3)})`;
      leaf.group.setAttribute("transform", transform);
      leaf.glow.setAttribute("transform", transform);
    }
    for (const tendril of tendrils) {
      const t = clamp01((length - tendril.position) / 70);
      tendril.element.setAttribute("stroke-dasharray", `${(t * tendril.length).toFixed(1)} ${tendril.length + 5}`);
      tendril.element.setAttribute("opacity", t > 0 ? "1" : "0");
      tendril.bead.setAttribute("opacity", t > 0.98 ? "1" : "0");
    }
    for (const bloom of blooms) {
      const t = bloom.end ? clamp01((shown - 0.95) / 0.05) : clamp01((length - bloom.position - 14) / 46);
      bloom.group.setAttribute("transform", `translate(${bloom.x.toFixed(1)} ${bloom.y.toFixed(1)}) rotate(${bloom.angle.toFixed(1)}) scale(${(t ? easeOutBack(t) : 0).toFixed(3)})`);
    }
    for (const node of nodes) {
      const lit = length > node.position;
      if (lit === node.lit) continue;
      node.lit = lit;
      node.element.setAttribute("fill", lit ? "#f6c14a" : "#ecdcb6");
      node.element.setAttribute("filter", lit ? ref("glow") : "none");
    }
    if (!reduceMotion && growing && visible && Math.random() < 0.5) mote(tip.x, tip.y, false);
  };

  const levelUp = () => {
    const flash = part("flash");
    flash.classList.remove("experience-vine__flash--active");
    void flash.getBoundingClientRect();
    flash.classList.add("experience-vine__flash--active");
    if (!reduceMotion) {
      for (let index = 0; index < 30; index += 1) {
        window.setTimeout(() => {
          const point = at(Math.random() * totalLength);
          mote(point.x, point.y, true);
        }, index * 30);
      }
    }
    flashTimer = window.setTimeout(() => {
      shown = 0;
      target = pendingTarget ?? 0;
      pendingTarget = null;
      start();
    }, 1100);
  };

  const step = (now: number) => {
    const elapsed = Math.min(0.05, (now - last) / 1000);
    last = now;
    const difference = target - shown;
    const growing = Math.abs(difference) > 0.0004;
    if (growing) {
      shown = reduceMotion ? target : shown + difference * (1 - Math.exp(-elapsed * 2.2));
      if (Math.abs(target - shown) < 0.0004) shown = target;
    }
    render(growing);
    if (growing) {
      frame = requestAnimationFrame(step);
      return;
    }
    frame = 0;
    if (pendingTarget !== null && shown >= 0.999) levelUp();
  };

  const start = () => {
    if (frame) return;
    last = performance.now();
    frame = requestAnimationFrame(step);
  };

  render(false);

  return {
    setProgress(progress, level) {
      const next = clamp01(progress);
      if (currentLevel !== null && level > currentLevel) {
        pendingTarget = next;
        target = 1;
      } else if (pendingTarget !== null) {
        pendingTarget = next;
      } else {
        target = next;
      }
      currentLevel = level;
      start();
    },
    destroy() {
      cancelAnimationFrame(frame);
      window.clearTimeout(flashTimer);
    },
  };
}

export function ExperienceVine({ level, progress }: ExperienceVineProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const controllerRef = useRef<VineController | null>(null);
  const prefix = `vine${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const id = (name: string) => `${prefix}-${name}`;

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return undefined;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const controller = mountVine(svg, prefix, reduceMotion);
    controllerRef.current = controller;
    return () => {
      controller.destroy();
      controllerRef.current = null;
    };
  }, [prefix]);

  useEffect(() => {
    controllerRef.current?.setProgress(progress, level);
  }, [level, progress]);

  return (
    <svg aria-hidden="true" className="experience-vine" ref={svgRef} viewBox="0 14 520 42">
      <defs>
        <linearGradient data-part="bark" gradientUnits="userSpaceOnUse" id={id("bark")} x1="0" x2="100" y1="0" y2="0">
          <stop offset="0" stopColor="#2a1d12" />
          <stop offset=".6" stopColor="#3a2a1c" />
          <stop offset="1" stopColor="#8a6a34" />
        </linearGradient>
        <linearGradient id={id("leaf-a")}><stop offset="0" stopColor="#6e7a3c" /><stop offset="1" stopColor="#c9bb72" /></linearGradient>
        <linearGradient id={id("leaf-b")}><stop offset="0" stopColor="#7d8446" /><stop offset="1" stopColor="#d6c27a" /></linearGradient>
        <radialGradient cx=".5" cy="1" id={id("petal")} r="1"><stop offset="0" stopColor="#fff8e0" /><stop offset="1" stopColor="#ecd9a4" /></radialGradient>
        <filter height="260%" id={id("glow")} width="160%" x="-30%" y="-80%">
          <feGaussianBlur result="blur" stdDeviation="2.4" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter height="200%" id={id("soft")} width="200%" x="-50%" y="-50%"><feGaussianBlur stdDeviation="2" /></filter>
        <filter height="400%" id={id("wide")} width="140%" x="-20%" y="-150%"><feGaussianBlur stdDeviation="6" /></filter>
        <filter height="340%" id={id("rough")} width="104%" x="-2%" y="-120%">
          <feTurbulence baseFrequency=".05" numOctaves={2} result="noise" seed={4} type="fractalNoise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale={1.5} />
        </filter>
        <clipPath id={id("clip")}><rect data-part="clip" height="70" width="0" x="0" y="0" /></clipPath>
      </defs>
      <g filter={`url(#${id("rough")})`}>
        <path data-part="dead" fill="none" opacity=".75" stroke="#6b5636" strokeDasharray="3 4" strokeLinecap="round" strokeWidth="1.1" />
        <path data-part="dead2" fill="none" opacity=".25" stroke="#6b5636" strokeWidth=".5" transform="translate(0 1.5)" />
      </g>
      <g className="experience-vine__pulse">
        <path data-part="halo2" fill="none" filter={`url(#${id("wide")})`} opacity="0" stroke="#e8a030" strokeLinecap="round" strokeWidth="10" />
        <path data-part="halo" fill="none" filter={`url(#${id("glow")})`} opacity="0" stroke="#f6c14a" strokeLinecap="round" strokeWidth="4" />
        <g data-part="leafglow" filter={`url(#${id("soft")})`} opacity="0" />
      </g>
      <g filter={`url(#${id("rough")})`}>
        <g data-part="tendrils" fill="none" stroke="#3a2a1c" strokeLinecap="round" strokeWidth=".8" />
        <g data-part="leaves" />
        <g data-part="blooms" />
        <g clipPath={`url(#${id("clip")})`}>
          <path data-part="stem" fill={`url(#${id("bark")})`} />
          <path data-part="ticks" fill="none" opacity=".55" stroke="#ecdcb6" strokeWidth=".5" />
        </g>
      </g>
      <g data-part="beads" />
      <path data-part="vine" fill="none" stroke="none" />
      <path data-part="hl" fill="none" opacity=".5" stroke="#f6d98a" strokeLinecap="round" strokeWidth=".6" transform="translate(0 -.6)" />
      <g data-part="nodes" />
      <g data-part="sparks" />
      <g data-part="tip" opacity="0">
        <circle fill="#f6c14a" filter={`url(#${id("soft")})`} opacity=".5" r="9" />
        <path className="experience-vine__spark" d="M0 -9L1.5 -1.5L9 0L1.5 1.5L0 9L-1.5 1.5L-9 0L-1.5 -1.5Z" fill="#f9d25e" filter={`url(#${id("glow")})`} stroke="#3a2a1c" strokeWidth=".5" />
      </g>
      <rect className="experience-vine__flash" data-part="flash" fill="#ffd978" filter={`url(#${id("wide")})`} height="12" pointerEvents="none" rx="6" width="492" x="14" y="29" />
    </svg>
  );
}
