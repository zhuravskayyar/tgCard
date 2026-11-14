import { useEffect, useRef, useState } from "react";
import type { CardElement } from "@cardastika/shared";
import "../styles/element-aura.css";

/**
 * A boss engraving drawn through an elemental shader: the art itself is the texture, so the effect
 * lives in the ink lines and on the silhouette. The background stays transparent, there is no box.
 * Without WebGL, an unsupported element or reduced motion the plain image is shown instead.
 */

const FRAME_MS = 1000 / 30;
/** Room around the art for sparks that leave the silhouette, as a share of the canvas side. */
const PAD = 0.1;

const VERTEX = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const FRAGMENT = `
precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_art;
uniform float u_time;
uniform float u_kind;
uniform float u_pad;
uniform vec2 u_texel;
uniform float u_sig;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
  return v;
}

vec4 art(vec2 uv) {
  vec2 a = (uv - u_pad) / (1.0 - 2.0 * u_pad);
  if (a.x < 0.0 || a.y < 0.0 || a.x > 1.0 || a.y > 1.0) return vec4(0.0);
  return texture2D(u_art, vec2(a.x, 1.0 - a.y));
}

// Sparks from a grid that drifts upward; each lives only where the figure is just below it.
float motes(vec2 uv, float t, vec2 drift, float rarity) {
  vec2 g = uv * vec2(14.0, 10.0);
  g -= t * drift;
  vec2 id = floor(g);
  vec2 f = fract(g);
  float r = hash(id);
  vec2 c = vec2(0.25 + 0.5 * hash(id + 3.1), 0.25 + 0.5 * hash(id + 7.7));
  float d = length((f - c) * vec2(1.0, 0.75));
  float flicker = 0.5 + 0.5 * sin(t * (7.0 + r * 8.0) + r * 31.0);
  return step(rarity, r) * smoothstep(0.09, 0.0, d) * flicker;
}

float sparks(vec2 uv, float t) { return motes(uv, t, vec2(0.0, 0.9), 0.7); }

// Shared finish: tint bands in the ink, a flickering rim on the silhouette, particles near the figure.
vec4 finish(vec2 p, vec2 uv, float t, vec3 band1, vec3 band2, float bandMask, float bandHot, vec3 rimColor, float rimStrength, float particles, vec3 particleColor, float fillBias) {
  vec4 tex = art(p);
  float a = tex.a;
  vec3 rgb = a > 0.0 ? tex.rgb / a : vec3(0.0);
  float ink = 1.0 - dot(rgb, vec3(0.299, 0.587, 0.114));
  // fillBias 0 tints the ink lines; 1 lets the colour show through the light fills instead.
  float tint = bandMask * mix(smoothstep(0.25, 0.75, ink), 1.0 - ink * 0.6, fillBias);
  rgb = mix(rgb, mix(band1, band2, bandHot), tint * 0.85);
  float ring = art(p + vec2(u_texel.x * 2.0, 0.0)).a + art(p - vec2(u_texel.x * 2.0, 0.0)).a
    + art(p + vec2(0.0, u_texel.y * 2.0)).a + art(p - vec2(0.0, u_texel.y * 2.0)).a;
  float edge = clamp(a - ring * 0.25, 0.0, 1.0) + clamp(ring * 0.25 - a, 0.0, 1.0) * 0.6;
  float rimA = edge * rimStrength;
  vec3 col = rgb * a;
  col = mix(col, rimColor * rimA, rimA * (1.0 - a * 0.4));
  float outA = max(a, rimA);
  float s = particles * (1.0 - a);
  col += particleColor * s;
  outA = max(outA, s);
  return vec4(col, outA);
}

// Water: the picture rocks on slow waves, cool bands roll through the ink, bubbles rise.
vec4 water(vec2 uv, float t) {
  float wave = sin(uv.y * 18.0 - t * 2.2) * 0.006 + (fbm(vec2(uv.x * 3.0, uv.y * 4.0 + t * 0.6)) - 0.5) * 0.01;
  vec2 p = uv + vec2(wave, sin(uv.x * 10.0 + t * 1.4) * 0.003);
  float band = fbm(vec2(uv.x * 3.2 - t * 0.25, uv.y * 3.0 + t * 0.45));
  float caustic = smoothstep(0.5, 0.75, band);
  float near = art(uv - vec2(0.0, 0.07)).a + art(uv - vec2(0.0, 0.14)).a;
  float bubbles = motes(uv, t, vec2(0.08 * sin(t), 0.5), 0.74) * clamp(near, 0.0, 1.0);
  float shimmer = 0.55 + 0.45 * fbm(vec2(uv.x * 8.0 + t * 1.2, uv.y * 6.0));
  return finish(p, uv, t, vec3(0.13, 0.27, 0.36), vec3(0.42, 0.62, 0.68), caustic, smoothstep(0.62, 0.85, band),
    vec3(0.45, 0.66, 0.74), shimmer * 0.75, bubbles, vec3(0.78, 0.9, 0.93), 0.35);
}

// Air: the figure sways in gusts, pale streaks blow sideways through the ink, motes drift across.
vec4 air(vec2 uv, float t) {
  float gust = 0.5 + 0.5 * sin(t * 0.9) * sin(t * 0.37 + 1.3);
  float sway = (fbm(vec2(uv.y * 3.0 - t * 0.8, t * 0.2)) - 0.5) * 0.02 * (0.2 + uv.y) * (0.6 + gust);
  vec2 p = uv + vec2(sway, 0.0);
  float streak = fbm(vec2(uv.x * 1.6 - t * 0.9, uv.y * 7.0));
  float near = art(uv - vec2(0.05, 0.0)).a + art(uv - vec2(0.1, 0.03)).a;
  float drift = motes(uv, t, vec2(0.75, 0.12), 0.76) * clamp(near, 0.0, 1.0);
  float flutter = 0.5 + 0.5 * fbm(vec2(uv.x * 6.0 - t * 2.0, uv.y * 5.0));
  return finish(p, uv, t, vec3(0.42, 0.47, 0.5), vec3(0.8, 0.84, 0.82), smoothstep(0.52, 0.78, streak), smoothstep(0.65, 0.9, streak),
    vec3(0.74, 0.79, 0.78), flutter * 0.7, drift, vec3(0.9, 0.92, 0.88), 0.0);
}

// Earth: a heavy slow breath and a faint tremor, mossy-ochre veins pulse in the ink, grit falls away.
vec4 earth(vec2 uv, float t) {
  float breath = sin(t * 1.1) * 0.012;
  float tremor = step(0.92, fract(t * 0.23)) * sin(t * 60.0) * 0.0025;
  vec2 c = uv - vec2(0.5, 0.15);
  vec2 p = vec2(0.5, 0.15) + c * (1.0 - breath) + vec2(tremor, 0.0);
  float vein = fbm(vec2(uv.x * 5.0, uv.y * 5.0) + vec2(0.0, t * 0.08));
  float pulse = 0.5 + 0.5 * sin(t * 1.1 - uv.y * 3.0);
  float above = art(uv + vec2(0.0, 0.06)).a + art(uv + vec2(0.0, 0.12)).a;
  float grit = motes(uv, t, vec2(0.0, -0.45), 0.7) * clamp(above, 0.0, 1.0);
  return finish(p, uv, t, vec3(0.55, 0.47, 0.2), vec3(0.86, 0.62, 0.22), smoothstep(0.46, 0.64, vein) * (0.4 + 0.6 * pulse), smoothstep(0.58, 0.78, vein),
    vec3(0.62, 0.5, 0.18), 0.6 + 0.3 * pulse, grit, vec3(0.5, 0.38, 0.18), 1.0);
}

vec4 fire(vec2 uv, float t) {
  // Heat haze: the image shivers sideways, more towards the top.
  float haze = fbm(vec2(uv.x * 5.0, uv.y * 3.5 - t * 1.6)) - 0.5;
  vec2 p = uv + vec2(haze * 0.014 * (0.3 + uv.y), haze * 0.004);
  vec4 tex = art(p);
  float a = tex.a;
  vec3 rgb = a > 0.0 ? tex.rgb / a : vec3(0.0);
  float ink = 1.0 - dot(rgb, vec3(0.299, 0.587, 0.114));

  // Burning bands crawl up through the ink.
  float band = fbm(vec2(uv.x * 4.0 + 1.7, uv.y * 2.6 - t * 0.7));
  float burn = smoothstep(0.52, 0.78, band) * smoothstep(0.25, 0.75, ink);
  vec3 ember = mix(vec3(0.55, 0.14, 0.03), vec3(0.95, 0.52, 0.12), smoothstep(0.62, 0.9, band));
  rgb = mix(rgb, ember, burn * 0.85);

  // Glowing rim where the silhouette meets the parchment.
  float ring = 0.0;
  ring += art(p + vec2(u_texel.x * 2.0, 0.0)).a;
  ring += art(p - vec2(u_texel.x * 2.0, 0.0)).a;
  ring += art(p + vec2(0.0, u_texel.y * 2.0)).a;
  ring += art(p - vec2(0.0, u_texel.y * 2.0)).a;
  float edge = clamp(a - ring * 0.25, 0.0, 1.0) + clamp(ring * 0.25 - a, 0.0, 1.0) * 0.6;
  float flick = 0.6 + 0.4 * fbm(vec2(uv.y * 9.0 - t * 2.5, uv.x * 3.0));
  vec3 rim = vec3(0.93, 0.48, 0.12);
  float rimA = edge * flick * 0.9;

  vec3 col = rgb * a;
  float outA = a;
  col = mix(col, rim * rimA, rimA * (1.0 - a * 0.4));
  outA = max(outA, rimA);

  // Sparks rise only above the figure (the art just below the spark is opaque).
  float below = art(uv - vec2(0.0, 0.06)).a + art(uv - vec2(0.0, 0.12)).a;
  float s = sparks(uv, t) * clamp(below, 0.0, 1.0) * (1.0 - a);
  vec3 sparkCol = vec3(0.98, 0.72, 0.3);
  col += sparkCol * s;
  outA = max(outA, s);
  return vec4(col, outA);
}

// ---- Signature looks: one per boss, laid over the element effect. ----
float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

vec4 signature(vec4 c, vec2 uv, float t) {
  if (u_sig < 0.5 || (c.a <= 0.0 && u_sig < 9.5)) return c;
  if (u_sig > 9.5) {
    // Guardian dragon: embers breathe inside the light scales, a hot rim pulses, sparks rise around it.
    vec4 g = art(uv);
    vec3 base = c.a > 0.0 ? c.rgb / c.a : vec3(0.0);
    float lit = lum(base);
    float breath = 0.5 + 0.5 * sin(t * 1.3);
    float heat = fbm(vec2(uv.x * 5.0, uv.y * 4.0 - t * 0.55));
    float glow = smoothstep(0.38, 0.72, heat) * smoothstep(0.3, 0.8, lit) * (0.4 + 0.6 * breath);
    vec3 molten = mix(vec3(0.85, 0.32, 0.05), vec3(1.0, 0.72, 0.28), heat);
    base = mix(base, molten, glow * 0.85 * g.a);
    float ring = 0.0;
    float halo = 0.0;
    for (int i = 0; i < 8; i++) {
      float ang = float(i) * 0.7854;
      vec2 dir = vec2(cos(ang), sin(ang));
      ring += art(uv + dir * u_texel * 7.0).a;
      halo += art(uv + dir * u_texel * 22.0).a;
    }
    float edge = clamp(ring / 8.0 - g.a, 0.0, 1.0);
    float flickR = 0.7 + 0.3 * fbm(vec2(uv.y * 9.0 - t * 2.4, uv.x * 4.0));
    float rimA = edge * (0.6 + 0.4 * breath) * flickR;
    // A soft warm aura further out, breathing with the dragon.
    float auraA = clamp(halo / 8.0 - g.a, 0.0, 1.0) * (0.18 + 0.22 * breath);
    float near = art(uv - vec2(0.0, 0.06)).a + art(uv - vec2(0.0, 0.13)).a + art(uv - vec2(0.05, 0.09)).a;
    float embers = (motes(uv + 1.3, t, vec2(0.06, 0.55), 0.45) + motes(uv * 1.7 + 4.1, t * 1.3, vec2(-0.05, 0.75), 0.55)) * clamp(near, 0.0, 1.0) * (1.0 - g.a);
    vec4 outC = vec4(clamp(base, 0.0, 1.0) * c.a, c.a);
    vec3 flame = vec3(1.0, 0.55, 0.12);
    outC.rgb += vec3(0.95, 0.5, 0.1) * auraA * (1.0 - g.a);
    outC.a = max(outC.a, auraA * (1.0 - g.a));
    outC.rgb = mix(outC.rgb, flame, rimA * (1.0 - g.a));
    outC.rgb += vec3(1.0, 0.68, 0.25) * embers * 1.5;
    outC.a = max(outC.a, max(rimA * 0.95, min(1.0, embers)));
    return outC;
  }
  vec4 src = art(uv);
  float a = src.a;
  vec3 rgb = c.rgb / c.a;
  float light = lum(rgb);
  float onArt = a;

  if (u_sig < 1.5) {
    // Silver Scaler: scales turn to silver, a metal glint sweeps across them.
    vec3 silver = vec3(light) * vec3(0.84, 0.89, 0.95);
    rgb = mix(rgb, silver, 0.75 * onArt);
    float d = fract(uv.x * 0.8 + uv.y * 0.55 - t * 0.22);
    float sheen = exp(-pow((d - 0.5) * 11.0, 2.0)) + 0.35 * exp(-pow((d - 0.42) * 22.0, 2.0));
    float glint = step(0.985, hash(floor(uv * 60.0) + floor(t * 3.0))) * light;
    rgb += vec3(0.42, 0.46, 0.52) * sheen * (0.35 + light) * onArt + vec3(0.6) * glint * onArt;
  } else if (u_sig < 2.5) {
    // Tar Serpent: glossy pitch drips crawl down the body.
    float drip = fbm(vec2(uv.x * 9.0, uv.y * 1.6 + t * 0.35));
    float tar = smoothstep(0.56, 0.7, drip) * onArt;
    rgb = mix(rgb, vec3(0.1, 0.07, 0.04), tar * 0.7);
    float gloss = smoothstep(0.69, 0.74, drip) * onArt;
    rgb += vec3(0.55, 0.42, 0.28) * gloss * 0.6;
  } else if (u_sig < 3.5) {
    // Serpent from the Pass: frost rime and twinkling ice crystals.
    rgb = mix(rgb, vec3(light) * vec3(0.86, 0.93, 1.0), 0.55 * onArt);
    vec2 cell = floor(uv * 48.0);
    float tw = step(0.965, hash(cell)) * (0.5 + 0.5 * sin(t * 4.0 + hash(cell + 2.0) * 30.0));
    rgb += vec3(0.75, 0.88, 1.0) * tw * light * onArt;
  } else if (u_sig < 4.5) {
    // Grey Leviathan: grey of the deep, a dark tide rolls up the body.
    rgb = mix(rgb, vec3(light) * vec3(0.78, 0.84, 0.88), 0.6 * onArt);
    float tide = smoothstep(0.0, 0.35, sin(uv.y * 4.0 - t * 0.7) * 0.5 + 0.5 - 0.3);
    rgb = mix(rgb, rgb * vec3(0.55, 0.62, 0.7), (1.0 - tide) * 0.5 * onArt);
  } else if (u_sig < 5.5) {
    // Black Serpent: charcoal body, smoke curling up from the silhouette.
    rgb = mix(rgb, vec3(light * 0.45) * vec3(1.0, 0.95, 0.9), 0.6 * onArt);
    float near = art(uv - vec2(0.0, 0.05)).a + art(uv - vec2(0.0, 0.1)).a * 0.7;
    float smoke = smoothstep(0.45, 0.75, fbm(vec2(uv.x * 4.0, uv.y * 3.0 - t * 0.6))) * clamp(near, 0.0, 1.0) * (1.0 - a);
    vec4 outC = vec4(rgb * c.a, c.a);
    outC.rgb += vec3(0.22, 0.2, 0.19) * smoke * 0.55;
    outC.a = max(outC.a, smoke * 0.55);
    return outC;
  } else if (u_sig < 6.5) {
    // Feathered Serpent: a muted pearly shimmer travels over the feathers.
    float h = uv.x * 2.0 + uv.y * 1.5 - t * 0.3;
    vec3 pearl = 0.5 + 0.5 * cos(6.2831 * (h + vec3(0.0, 0.33, 0.67)));
    pearl = mix(vec3(0.85, 0.8, 0.7), pearl, 0.16);
    rgb = mix(rgb, rgb * pearl * 1.12, 0.5 * light * onArt);
  } else if (u_sig < 7.5) {
    // Blind Runner: crystal veins glow through the dark parts, pulsing slowly.
    float crack = abs(noise(uv * 14.0 + vec2(0.0, t * 0.05)) - 0.5);
    float vein = smoothstep(0.11, 0.0, crack) * (0.45 + 0.55 * (1.0 - light)) * onArt;
    float pulse = 0.55 + 0.45 * sin(t * 1.6 + uv.y * 5.0);
    vec3 crystal = vec3(0.5, 0.3, 0.68);
    rgb = mix(rgb, rgb * mix(vec3(1.0), crystal * 1.5, 0.35), (0.25 + 0.15 * pulse) * onArt);
    rgb = mix(rgb, crystal, vein * pulse * 0.85);
  } else if (u_sig < 8.5) {
    // Sea Serpent: sea-green body flecked with drifting foam.
    rgb = mix(rgb, vec3(light) * vec3(0.72, 0.9, 0.84), 0.55 * onArt);
    float foam = smoothstep(0.62, 0.72, fbm(vec2(uv.x * 10.0 + t * 0.4, uv.y * 10.0 - t * 0.2))) * light;
    rgb = mix(rgb, vec3(0.95, 0.98, 0.95), foam * 0.7 * onArt);
  } else {
    // Sorceresses: a coloured spell-light in their element along a thick silhouette, glimmers around them.
    vec3 spell = u_kind < 0.5 ? vec3(0.72, 0.36, 0.08)
      : u_kind < 1.5 ? vec3(0.1, 0.42, 0.48)
      : u_kind < 2.5 ? vec3(0.28, 0.38, 0.6)
      : vec3(0.3, 0.42, 0.14);
    float ring = 0.0;
    for (int i = 0; i < 8; i++) {
      float ang = float(i) * 0.7854;
      vec2 o = vec2(cos(ang), sin(ang)) * u_texel * 5.0;
      ring += art(uv + o).a;
    }
    ring /= 8.0;
    float edge = clamp(ring - a, 0.0, 1.0);
    float pulse = 0.5 + 0.5 * sin(t * 1.4);
    float flow = 0.6 + 0.4 * fbm(vec2(uv.x * 6.0 + t * 0.6, uv.y * 6.0 - t * 0.9));
    float g = edge * (0.55 + 0.4 * pulse) * flow;
    // The spell also seeps faintly into the light fills of the figure.
    rgb = mix(rgb, rgb * mix(vec3(1.0), spell * 1.6, 0.35), (0.25 + 0.2 * pulse) * light * onArt);
    vec4 outC = vec4(clamp(rgb, 0.0, 1.0) * c.a, c.a);
    float near = art(uv - vec2(0.0, 0.07)).a + art(uv + vec2(0.0, 0.07)).a + art(uv - vec2(0.07, 0.0)).a;
    float glimmer = motes(uv + 3.7, t, vec2(0.12, 0.3), 0.72) * clamp(near, 0.0, 1.0) * (1.0 - a);
    outC.rgb = mix(outC.rgb, spell, g * (1.0 - a));
    outC.rgb += spell * glimmer * 1.2;
    outC.a = max(outC.a, max(g * 0.9, glimmer));
    return outC;
  }
  return vec4(clamp(rgb, 0.0, 1.0) * c.a, c.a);
}

void main() {
  vec4 color = vec4(0.0);
  if (u_kind < 0.5) color = fire(v_uv, u_time);
  else if (u_kind < 1.5) color = water(v_uv, u_time);
  else if (u_kind < 2.5) color = air(v_uv, u_time);
  else color = earth(v_uv, u_time);
  gl_FragColor = signature(color, v_uv, u_time);
}`;

const KIND: Partial<Record<CardElement, number>> = { fire: 0, water: 1, air: 2, earth: 3 };

/** Each raid boss has its own look on top of the element. */
const SIGNATURE: Readonly<Record<string, number>> = {
  silver_dragon: 1,
  fire_dragon: 2,
  north_dragon: 3,
  ancient_leviathan: 4,
  black_dragon: 5,
  feathered_dragon: 6,
  underground_dragon: 7,
  sea_dragon: 8,
  sorceress_air: 9,
  sorceress_earth: 9,
  sorceress_fire: 9,
  sorceress_water: 9,
  guardian_dragon: 10,
};

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn("Element art shader failed", gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Art ${src} failed to load`));
    image.src = src;
  });
}

export function ElementArt({ alt, cardId, element, onError, src }: { alt: string; cardId?: string; element: CardElement; onError?: () => void; src: string }) {
  const signature = cardId ? SIGNATURE[cardId] ?? 0 : 0;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [active, setActive] = useState(false);
  const kind = KIND[element];
  const shaded = kind !== undefined && !prefersReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !shaded || kind === undefined) return;
    let disposed = false;
    let frame = 0;
    let cleanup = () => {};

    void loadImage(src).then((image) => {
      if (disposed) return;
      const gl = canvas.getContext("webgl", { alpha: true, antialias: false, premultipliedAlpha: true, powerPreference: "low-power" });
      if (!gl || gl.isContextLost()) return;
      const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX);
      const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
      const program = gl.createProgram();
      if (!vertex || !fragment || !program) return;
      gl.attachShader(program, vertex);
      gl.attachShader(program, fragment);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
      gl.useProgram(program);

      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const position = gl.getAttribLocation(program, "a_position");
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

      const timeLocation = gl.getUniformLocation(program, "u_time");
      gl.uniform1f(gl.getUniformLocation(program, "u_kind"), kind);
      gl.uniform1f(gl.getUniformLocation(program, "u_pad"), PAD);
      gl.uniform1f(gl.getUniformLocation(program, "u_sig"), signature);
      gl.uniform1i(gl.getUniformLocation(program, "u_art"), 0);
      const texelLocation = gl.getUniformLocation(program, "u_texel");
      gl.clearColor(0, 0, 0, 0);

      let last = 0;
      let visible = true;
      const started = performance.now();
      const resize = () => {
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
        const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
          gl.viewport(0, 0, width, height);
          gl.uniform2f(texelLocation, 1 / width, 1 / height);
        }
      };
      const draw = (now: number) => {
        frame = requestAnimationFrame(draw);
        if (!visible || document.hidden || now - last < FRAME_MS) return;
        last = now;
        resize();
        gl.uniform1f(timeLocation, (now - started) / 1000);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      };
      const observer = new IntersectionObserver(([entry]) => { visible = Boolean(entry?.isIntersecting); });
      observer.observe(canvas);
      frame = requestAnimationFrame(draw);
      setActive(true);
      cleanup = () => {
        observer.disconnect();
        gl.deleteTexture(texture);
        gl.deleteBuffer(buffer);
        gl.deleteProgram(program);
        gl.deleteShader(vertex);
        gl.deleteShader(fragment);
      };
    }).catch(() => onError?.());

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      cleanup();
      setActive(false);
    };
  }, [kind, shaded, signature, src]);

  return <>
    {shaded ? <canvas aria-hidden="true" className={`element-art element-art--${element}${active ? " is-active" : ""}`} ref={canvasRef} /> : null}
    <img alt={alt} className={active ? "element-art__fallback is-hidden" : "element-art__fallback"} onError={onError} src={src} />
  </>;
}
