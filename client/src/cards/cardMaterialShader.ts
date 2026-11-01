import { loadCardTexture, saveCardTexture } from "./cardTextureCache";

type ShaderMaterial = {
  bump: number;
  brush: number;
  f0: readonly [number, number, number];
  fx: number;
  gain: number;
  kind: number;
  metal: number;
  rough: number;
};

interface ShaderUniforms {
  animTime: WebGLUniformLocation | null;
  bump: WebGLUniformLocation | null;
  brush: WebGLUniformLocation | null;
  f0: WebGLUniformLocation | null;
  fx: WebGLUniformLocation | null;
  gain: WebGLUniformLocation | null;
  kind: WebGLUniformLocation | null;
  metallic: WebGLUniformLocation | null;
  destruction: WebGLUniformLocation | null;
  rough: WebGLUniformLocation | null;
  texture: WebGLUniformLocation | null;
  texelSize: WebGLUniformLocation | null;
  tilt: WebGLUniformLocation | null;
}

interface CardTilt {
  x: number;
  y: number;
}

interface IdleTiltMotion {
  from: CardTilt;
  to: CardTilt;
  startedAt: number;
  duration: number;
  nextAt: number;
}

interface SharedRenderer {
  canvas: HTMLCanvasElement;
  emptyArtTexture: WebGLTexture;
  gl: WebGLRenderingContext;
  uniforms: ShaderUniforms;
}

interface CardShaderInstance {
  animated: boolean;
  artTexture: WebGLTexture | null;
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  textureCanvas: HTMLCanvasElement;
  textureContext: CanvasRenderingContext2D;
  failed: boolean;
  destruction: { from: number; startedAt: number; duration: number; to: number; resolve: () => void } | null;
  destructionProgress: number;
  idleMotion: IdleTiltMotion;
  painted: { destruction: number; x: number; y: number; at: number };
  material: ShaderMaterial;
  onReady: (ready: boolean) => void;
  pointerActive: boolean;
  pointerTarget: { x: number; y: number };
  reducedMotion: boolean;
  texture: WebGLTexture;
  tilt: { x: number; y: number };
  visible: boolean;
}

interface CardArtLayer {
  artworkSource: string;
  markup: string;
  textureKey?: string;
}

interface MountCardMaterialShaderOptions {
  artLayer?: CardArtLayer | null;
  artworkSource?: string | null;
  canvas: HTMLCanvasElement;
  initialTilt?: CardTilt;
  materialId: string;
  onReady: (ready: boolean) => void;
  svgMarkup: string;
  textureKey?: string;
}

const SHADER_WIDTH = 360;
const SHADER_HEIGHT = 468;
// Slightly under 33.3ms so a 60Hz display lands on every second frame instead of drifting to every third.
const TARGET_FRAME_MS = 1000 / 30 - 2;
// Below this change in tilt a repaint is invisible, so a resting card costs nothing.
const TILT_REPAINT_EPSILON = 0.002;
// Past this much main-thread time the remaining cards wait for the next tick, oldest paint first.
const PAINT_BUDGET_MS = 5;
const SCROLL_SETTLE_MS = 140;
const ART_DATA_URL_CACHE_LIMIT = 12;
// Cards this far outside the scroll viewport prepare ahead, so scrolling reaches finished cards.
const PREPARE_MARGIN = "800px 0px";
// The living galaxy repaints without any tilt, so small cards in lists run it slower than a card seen up close.
const LIVING_FRAME_MS = 100;
const LIVING_CLOSEUP_FRAME_MS = 33;
const LIVING_CLOSEUP_WIDTH = 150;
const MASK_SIZE = 256;

const MATERIALS: Readonly<Record<string, ShaderMaterial>> = {
  paper: { metal: 0, rough: 0.91, f0: [0.045, 0.036, 0.025], bump: 1.05, gain: 0.19, brush: 0, kind: 0, fx: 0 },
  wood: { metal: 0, rough: 0.64, f0: [0.05, 0.045, 0.04], bump: 1.35, gain: 1.15, brush: 0, kind: 1, fx: 0.35 },
  silver: { metal: 1, rough: 0.075, f0: [0.9, 0.94, 0.97], bump: 0.8, gain: 1.25, brush: 0, kind: 2, fx: 0 },
  gold: { metal: 1, rough: 0.06, f0: [1, 0.76, 0.33], bump: 0.85, gain: 1.25, brush: 0, kind: 3, fx: 0 },
  enamel: { metal: 0.4, rough: 0.1, f0: [0.16, 0.06, 0.06], bump: 0.9, gain: 0.9, brush: 0, kind: 4, fx: 1 },
  astronite: { metal: 1, rough: 0.26, f0: [0.27, 0.36, 0.49], bump: 1.22, gain: 0.5, brush: 0.09, kind: 5, fx: 1 },
};

const VERTEX_SHADER = `
attribute vec2 position;
varying vec2 uv;
void main() {
  uv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}`;

const FRAGMENT_SHADER = `
precision __PRECISION__ float;
varying vec2 uv;
uniform sampler2D cardTexture;
uniform sampler2D maskTexture;
uniform sampler2D artTexture;
uniform vec2 texelSize;
uniform vec2 tilt;
uniform float metallic;
uniform float destruction;
uniform float bump;
uniform float gain;
uniform float brush;
uniform float rough;
uniform float kind;
uniform float fx;
uniform float animTime;
uniform vec3 f0;

float luminance(vec3 color) { return dot(color, vec3(0.2126, 0.7152, 0.0722)); }
float sat(float value) { return clamp(value, 0.0, 1.0); }
float heightAt(vec2 point) {
  vec4 texel = texture2D(cardTexture, point);
  return 0.5 + (luminance(texel.rgb) - 0.5) * 0.57 * texel.a - 0.07 * texel.a;
}
float hash2(vec2 point) { return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453123); }
float noise2(vec2 point) {
  vec2 cell = floor(point);
  vec2 local = fract(point);
  local = local * local * (3.0 - 2.0 * local);
  return mix(mix(hash2(cell), hash2(cell + vec2(1.0, 0.0)), local.x), mix(hash2(cell + vec2(0.0, 1.0)), hash2(cell + vec2(1.0, 1.0)), local.x), local.y);
}
float hash(float value) { return fract(sin(value * 12.9898) * 43758.5453); }
float valueNoise(vec2 point) {
  vec2 cell = floor(point);
  vec2 local = fract(point);
  local = local * local * (3.0 - 2.0 * local);
  return mix(
    mix(hash(cell.x + cell.y * 57.0), hash(cell.x + 1.0 + cell.y * 57.0), local.x),
    mix(hash(cell.x + (cell.y + 1.0) * 57.0), hash(cell.x + 1.0 + (cell.y + 1.0) * 57.0), local.x),
    local.y
  );
}
float rect(vec2 point, vec2 center, vec2 extent, vec2 soft) {
  vec2 distance = (abs(point - center) - extent) / soft;
  return (1.0 - smoothstep(-1.0, 1.0, distance.x)) * (1.0 - smoothstep(-1.0, 1.0, distance.y));
}
vec3 environment(vec3 reflected, float roughness) {
  vec2 point = reflected.xy / max(0.5, 1.0 + reflected.z * 0.13);
  float soft = 0.012 + roughness * roughness * 0.29;
  vec3 color = mix(vec3(0.016, 0.027, 0.044), vec3(0.24, 0.32, 0.43), sat((point.y + 0.72) * 0.72));
  color += vec3(1.0, 0.94, 0.83) * 3.1 * rect(point, vec2(-0.46, 0.48), vec2(0.26, 0.2), vec2(soft));
  color += vec3(0.74, 0.84, 1.0) * 2.2 * rect(point, vec2(0.53, 0.06), vec2(0.058, 0.56), vec2(soft * 0.72, soft));
  color += vec3(1.0) * 1.05 * rect(point, vec2(0.04, -0.56), vec2(0.22, 0.06), vec2(soft));
  color *= 1.0 - 0.72 * rect(point, vec2(0.15, 0.35), vec2(0.074, 0.49), vec2(0.018 + soft));
  return color;
}

void main() {
  vec4 texel = texture2D(cardTexture, uv);
  if (texel.a < 0.003) {
    gl_FragColor = vec4(0.0);
    return;
  }
  vec4 mask = texture2D(maskTexture, uv);
  vec2 cardPoint = vec2(uv.x * 240.0, (1.0 - uv.y) * 312.0);
  // Slopes are per texel, so they are normalised to the relief the materials were tuned at.
  float slopeScale = 1.0 / (texelSize.x * 720.0);
  float slopeX = (heightAt(uv + vec2(texelSize.x, 0.0)) - heightAt(uv - vec2(texelSize.x, 0.0))) * slopeScale;
  float slopeY = (heightAt(uv + vec2(0.0, texelSize.y)) - heightAt(uv - vec2(0.0, texelSize.y))) * slopeScale;
  float artAlpha = 0.0;
  float backShade = 1.0;
  if (kind > 4.5) {
    // The art sits deeper than the frame: it shifts with the tilt, is clipped by the window and shades the galaxy.
    float window = rect(cardPoint, vec2(120.0, 175.5), vec2(101.0, 116.0), vec2(1.5)) * smoothstep(24.5, 26.0, distance(cardPoint, vec2(197.0, 263.0)));
    vec2 artPoint = uv + tilt * 0.024;
    vec4 art = texture2D(artTexture, artPoint);
    backShade = 1.0 - 0.6 * texture2D(artTexture, artPoint + tilt * 0.016 + vec2(-0.007, 0.008)).a * window;
    artAlpha = art.a * window;
    slopeX += (luminance(texture2D(artTexture, artPoint + vec2(texelSize.x, 0.0)).rgb) - luminance(texture2D(artTexture, artPoint - vec2(texelSize.x, 0.0)).rgb)) * artAlpha * slopeScale * 0.55;
    slopeY += (luminance(texture2D(artTexture, artPoint + vec2(0.0, texelSize.y)).rgb) - luminance(texture2D(artTexture, artPoint - vec2(0.0, texelSize.y)).rgb)) * artAlpha * slopeScale * 0.55;
    texel.rgb = mix(texel.rgb * mix(1.0, backShade, window), art.rgb, artAlpha);
  }
  vec2 platePoint = (uv - 0.5) * vec2(1.0, 1.3);
  float micro = noise2(uv / texelSize * 0.8);
  float detail = 0.0;
  float grain = 0.0;
  if (kind < 0.5) { detail = (mask.r - 0.5) * 0.18 + sin(uv.y / texelSize.y * 1.5 + mask.r * 12.0) * 0.007; grain = 0.15 * micro; }
  else if (kind < 1.5) { grain = 0.1 * micro; }
  else if (kind < 2.5) { detail = (micro - 0.5) * 0.003; grain = 0.004 * micro; }
  else if (kind < 3.5) { detail = (micro - 0.5) * 0.002; grain = 0.003 * micro; }
  else if (kind < 4.5) { detail = (micro - 0.5) * 0.006; grain = 0.005 * micro; }
  else { detail = (mask.r - 0.5) * 0.044; grain = 0.13 * micro; }
  vec3 normal = vec3(-slopeX * bump * 2.8 + detail * 0.09 - platePoint.x * 0.14, -slopeY * bump * 2.8 + detail * 0.09 - platePoint.y * 0.12, 1.0);
  if (brush > 0.1) normal.x += (noise2(vec2(uv.y / texelSize.y * 0.7, 4.0)) - 0.5) * 0.035 * brush;
  normal = normalize(normal);
  vec3 viewDirection = normalize(vec3(tilt.x * 0.56 - platePoint.x * 0.1, tilt.y * 0.56 - platePoint.y * 0.1, 1.75));
  vec3 reflected = reflect(-viewDirection, normal);
  float facing = sat(dot(normal, viewDirection));
  vec3 fresnel = f0 + (1.0 - f0) * pow(1.0 - facing, 5.0);
  vec3 reflection = environment(reflected, rough) * fresnel * gain;
  float engraving = smoothstep(0.075, 0.62, luminance(texel.rgb));
  float reflectMask = mix(0.26, 0.94, engraving);
  float diffuse = sat(dot(normal, normalize(vec3(-0.35, 0.42, 0.85))));
  vec3 color = texel.rgb * (0.72 + 0.23 * diffuse) * (1.0 - 0.18 * metallic);
  float highlight = pow(sat(dot(reflected, normalize(vec3(-0.35, 0.58, 0.7)))), mix(4.0, 100.0, (1.0 - rough) * (1.0 - rough))) * 0.17;
  reflection += fresnel * highlight;
  // Sharp studio bands and a bright floor are what make the polish read as a mirror.
  if (kind > 1.5 && kind < 3.5) {
    float polish = smoothstep(0.3, 0.06, rough);
    color *= mix(0.92, 0.72, polish);
    float axis = reflected.x * 0.78 + reflected.y * 0.62;
    float bands = smoothstep(0.07, 0.015, abs(axis - 0.16)) * 1.05 + smoothstep(0.03, 0.006, abs(axis + 0.2)) * 0.8 + smoothstep(0.016, 0.004, abs(axis - 0.36)) * 0.6;
    color += f0 * (0.2 + 0.14 * reflected.y + bands) * polish * reflectMask;
  }
  color += reflection * reflectMask * (0.5 + 0.5 * metallic);
  color *= 1.0 - grain * 0.045;
  if (kind < 0.5) {
    color = texel.rgb * (1.03 + 0.1 * (diffuse - 0.8)) * (1.0 - grain * 0.1) * (1.0 + (mask.r - 0.5) * 0.12);
    color += vec3(1.0, 0.88, 0.66) * pow(sat(dot(reflected, normalize(vec3(-0.3, 0.45, 0.84)))), 9.0) * 0.07;
  }
  // Effects stay away from the power tray and medallion and are muted over the artwork.
  float medallion = smoothstep(22.0, 34.0, distance(cardPoint, vec2(197.0, 263.0)));
  float tray = 1.0 - rect(cardPoint, vec2(120.0, 36.0), vec2(106.0, 21.0), vec2(2.0));
  float zone = mix(0.32, 1.0, 1.0 - artAlpha) * medallion * tray;
  if (kind > 0.5 && kind < 1.5) {
    float lacquer = pow(sat(dot(reflected, normalize(vec3(-0.3, 0.5, 0.81)))), 26.0);
    color += vec3(1.0, 0.8, 0.56) * lacquer * 0.2 * fx * reflectMask;
  }
  if (kind > 3.5 && kind < 4.5) {
    // Two layers: a sharp clear glaze over the ruby glass, and gold partitions that flash on their own axis.
    float goldness = smoothstep(0.14, 0.3, texel.g);
    color *= mix(vec3(0.6, 0.42, 0.44), vec3(1.0), goldness);
    float axis = reflected.x * 0.78 + reflected.y * 0.62;
    float glaze = smoothstep(0.06, 0.012, abs(axis - 0.14)) + smoothstep(0.022, 0.005, abs(axis + 0.22)) * 0.7;
    float flash = smoothstep(0.14, 0.02, abs(reflected.x * 0.3 - reflected.y * 0.95 - 0.05));
    color += vec3(0.6, 0.03, 0.05) * pow(facing, 3.0) * 0.3 * (1.0 - goldness) * fx;
    color += vec3(1.0, 0.9, 0.86) * glaze * 0.55 * (1.0 - goldness) * medallion * tray * fx;
    color += vec3(1.0, 0.76, 0.33) * (0.22 + flash * 0.85) * goldness * medallion * tray * fx;
  }
  if (kind > 4.5) {
    float etched = step(0.2, luminance(texel.rgb));
    float glint = 0.72 + 0.28 * sin(uv.y * 15.0 + tilt.x * 6.0 + tilt.y * 3.0);
    color += vec3(1.0, 0.62, 0.19) * mask.b * etched * 0.95 * glint * fx * tray * (1.0 - artAlpha) * smoothstep(0.15, 0.35, uv.y) * (1.0 - smoothstep(0.82, 0.94, uv.y));
    // Deeper layers shift further than the surface: nebula, far stars, mid stars, near stars.
    float dark = (1.0 - smoothstep(0.2, 0.6, luminance(texel.rgb))) * (1.0 - artAlpha) * backShade;
    float nearStars = texture2D(maskTexture, uv * vec2(1.6, 2.08) + tilt * 0.05 + fract(vec2(animTime * 0.004, animTime * 0.0016))).a * (0.72 + 0.28 * sin(animTime * 1.7 + uv.x * 83.0 + uv.y * 61.0));
    float midStars = texture2D(maskTexture, uv * vec2(2.4, 3.12) + tilt * 0.2 + 0.21 + fract(vec2(animTime * 0.0075, -animTime * 0.003))).a * (0.7 + 0.3 * sin(animTime * 2.3 + uv.x * 57.0 - uv.y * 91.0));
    float farStars = texture2D(maskTexture, uv * vec2(3.5, 4.55) + tilt * 0.5 + 0.37 + fract(vec2(-animTime * 0.011, animTime * 0.005))).a;
    vec2 nebulaPoint = uv * vec2(3.0, 3.9) + tilt * 0.28;
    float swirl = noise2(nebulaPoint * 0.8 + vec2(animTime * 0.05, -animTime * 0.035));
    float nebula = noise2(nebulaPoint + swirl * 1.4 + vec2(animTime * 0.03, animTime * 0.02)) * noise2(uv * vec2(5.7, 7.4) - tilt * 0.42 + 3.1 - swirl + vec2(-animTime * 0.04, animTime * 0.026));
    color += (vec3(0.08, 0.15, 0.36) * nebula * 0.7 + vec3(0.18, 0.06, 0.28) * nebula * nebula * 0.9) * dark * zone * fx;
    color += (vec3(1.0, 0.93, 0.78) * nearStars * 1.5 + vec3(0.85, 0.9, 1.0) * midStars * 1.1 + vec3(0.55, 0.72, 1.0) * farStars * 0.8) * dark * zone * fx;
  }
  if (kind > 0.5) color = color / (1.0 + color * 0.23);
  color = pow(max(color, vec3(0.0)), vec3(0.94));
  vec4 surface = vec4(clamp(color, 0.0, 1.0) * texel.a, texel.a);
  if (destruction < 0.001) {
    gl_FragColor = surface;
    return;
  }
  float noise = valueNoise(uv * 7.0) * 0.55 + valueNoise(uv * 19.0) * 0.3 + valueNoise(uv * 47.0) * 0.15;
  float edge = noise * 0.6 + length((uv - vec2(0.35, 0.4)) * vec2(1.0, 1.3)) * 0.44;
  float relative = edge - (destruction * 1.25 - 0.12);
  float crack = smoothstep(0.022, 0.0, abs(valueNoise(uv * 11.0 + valueNoise(uv * 34.0) * 0.9) - 0.5))
    * smoothstep(0.0, 0.2, destruction) * (1.0 - smoothstep(0.55, 0.85, destruction));
  vec3 hot = mix(vec3(1.0, 0.25, 0.02), vec3(1.0, 0.88, 0.55), smoothstep(0.05, 0.0, relative));
  vec3 destroyedColor = surface.rgb * (1.0 - 0.85 * smoothstep(0.1, 0.0, relative));
  destroyedColor = mix(destroyedColor, vec3(0.05, 0.02, 0.01), crack * 0.7 * surface.a)
    + vec3(1.0, 0.4, 0.08) * crack * 0.9 * surface.a;
  destroyedColor += hot * smoothstep(0.12, 0.0, relative) * step(0.0, relative) * 1.8 * surface.a;
  float alpha = surface.a * smoothstep(0.0, 0.012, relative);
  vec2 gridPoint = uv * vec2(40.0, 52.0) - vec2(0.0, destruction * 16.0);
  vec2 localCell = fract(gridPoint);
  vec2 cell = floor(gridPoint);
  float h1 = hash(cell.x * 7.0 + cell.y * 13.7);
  float h2 = hash(cell.x * 3.3 + cell.y * 5.9);
  float h3 = hash(cell.x * 9.7 + cell.y * 2.3);
  float sparks = step(0.84, h1) * smoothstep(0.22, 0.0, length(localCell - vec2(h2, h3)))
    * smoothstep(-0.32, -0.02, relative) * step(relative, 0.0) * (1.0 - smoothstep(0.85, 1.0, destruction))
    * (0.6 + 0.4 * sin(destruction * 50.0 + h1 * 40.0));
  gl_FragColor = vec4(min(destroyedColor * alpha, vec3(alpha)) + vec3(1.0, 0.55, 0.15) * sparks * 1.4, max(alpha, sparks));
}`;

const artworkDataUrlCache = new Map<string, Promise<string>>();
const instances = new Set<CardShaderInstance>();
const canvasInstances = new WeakMap<HTMLCanvasElement, CardShaderInstance>();
let sharedRenderer: SharedRenderer | null = null;
let rendererAttempted = false;
let animationFrame = 0;
let lastFrameAt = 0;

function compileShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Card shader could not be created");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) ?? "Card shader compilation failed";
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

// One small mask replaces per-frame noise and Voronoi: R phase, B veins, A stars (G stays free).
function buildMaterialMask() {
  const size = MASK_SIZE;
  const data = new Uint8Array(size * size * 4);
  const random = (x: number, y: number) => {
    const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return value - Math.floor(value);
  };
  const smooth = (x: number, y: number) => {
    const cellX = Math.floor(x);
    const cellY = Math.floor(y);
    let a = x - cellX;
    let b = y - cellY;
    a = a * a * (3 - 2 * a);
    b = b * b * (3 - 2 * b);
    const top = random(cellX, cellY) + (random(cellX + 1, cellY) - random(cellX, cellY)) * a;
    const bottom = random(cellX, cellY + 1) + (random(cellX + 1, cellY + 1) - random(cellX, cellY + 1)) * a;
    return top + (bottom - top) * b;
  };
  const layered = (x: number, y: number) => smooth(x, y) * 0.56 + smooth(x * 2.07, y * 2.07) * 0.28 + smooth(x * 4.09, y * 4.09) * 0.16;
  const edgeDistance = (x: number, y: number) => {
    const cellX = Math.floor(x);
    const cellY = Math.floor(y);
    let nearest = 9;
    let second = 9;
    for (let b = -1; b <= 1; b += 1) {
      for (let a = -1; a <= 1; a += 1) {
        const dx = a + random(cellX + a, cellY + b) - (x - cellX);
        const dy = b + random(cellX + a + 21.7, cellY + b + 21.7) - (y - cellY);
        const distance = dx * dx + dy * dy;
        if (distance < nearest) { second = nearest; nearest = distance; }
        else if (distance < second) second = distance;
      }
    }
    return Math.sqrt(second) - Math.sqrt(nearest);
  };
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const v = y / size;
      const offset = (y * size + x) * 4;
      data[offset] = layered(u * 6 + layered(u * 4 + 1.3, v * 5.2) * 1.4, v * 7.8 + layered(u * 4 + 7.1, v * 5.2 + 3.1) * 1.4) * 255;
      const veinX = u * 11;
      const veinY = v * 14;
      const line = edgeDistance(veinX + layered(veinX * 0.39, veinY * 0.39) * 0.9, veinY + layered(veinX * 0.39 + 5.7, veinY * 0.39 + 5.7) * 0.9);
      const edge = Math.max(0, Math.min(1, (line - 0.014) / 0.06));
      data[offset + 2] = (1 - edge * edge * (3 - 2 * edge)) * (0.35 + 0.65 * smooth(veinX * 0.57, veinY * 0.57)) * 255;
    }
  }
  for (let star = 0; star < 170; star += 1) {
    const starX = Math.round(random(star, 1.7) * size);
    const starY = Math.round(random(star, 8.3) * size);
    const radius = 0.55 + random(star, 3.1) ** 3 * 1.1;
    const light = 0.4 + 0.6 * random(star, 5.9);
    const reach = Math.ceil(radius * 3);
    for (let b = -reach; b <= reach; b += 1) {
      for (let a = -reach; a <= reach; a += 1) {
        const offset = (((starY + b + size) % size) * size + ((starX + a + size) % size)) * 4 + 3;
        data[offset] = Math.min(255, data[offset] + 255 * light * Math.exp(-(a * a + b * b) / (radius * radius)));
      }
    }
  }
  return data;
}

function createSharedRenderer(): SharedRenderer | null {
  const canvas = document.createElement("canvas");
  canvas.width = SHADER_WIDTH;
  canvas.height = SHADER_HEIGHT;
  const gl = canvas.getContext("webgl", {
    alpha: true,
    antialias: false,
    premultipliedAlpha: true,
    preserveDrawingBuffer: true,
  });
  if (!gl) return null;

  try {
    const precision = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT)?.precision ? "highp" : "mediump";
    const vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER.replace("__PRECISION__", precision));
    const program = gl.createProgram();
    if (!program) throw new Error("Card shader program could not be created");
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error("Card shader program could not be linked");
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    if (!buffer) throw new Error("Card shader geometry could not be created");
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "position");
    if (position < 0) throw new Error("Card shader geometry is unavailable");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    const uniforms: ShaderUniforms = {
      texture: gl.getUniformLocation(program, "cardTexture"),
      texelSize: gl.getUniformLocation(program, "texelSize"),
      tilt: gl.getUniformLocation(program, "tilt"),
      rough: gl.getUniformLocation(program, "rough"),
      kind: gl.getUniformLocation(program, "kind"),
      fx: gl.getUniformLocation(program, "fx"),
      animTime: gl.getUniformLocation(program, "animTime"),
      metallic: gl.getUniformLocation(program, "metallic"),
      destruction: gl.getUniformLocation(program, "destruction"),
      bump: gl.getUniformLocation(program, "bump"),
      gain: gl.getUniformLocation(program, "gain"),
      brush: gl.getUniformLocation(program, "brush"),
      f0: gl.getUniformLocation(program, "f0"),
    };
    gl.uniform1i(uniforms.texture, 0);
    gl.uniform1i(gl.getUniformLocation(program, "maskTexture"), 1);
    gl.uniform1i(gl.getUniformLocation(program, "artTexture"), 2);

    const maskTexture = gl.createTexture();
    const emptyArtTexture = gl.createTexture();
    if (!maskTexture || !emptyArtTexture) throw new Error("Card material textures could not be created");
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, maskTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, MASK_SIZE, MASK_SIZE, 0, gl.RGBA, gl.UNSIGNED_BYTE, buildMaterialMask());
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, emptyArtTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    gl.activeTexture(gl.TEXTURE0);
    return { canvas, emptyArtTexture, gl, uniforms };
  } catch {
    return null;
  }
}

function getSharedRenderer() {
  if (!rendererAttempted) {
    rendererAttempted = true;
    sharedRenderer = createSharedRenderer();
  }
  return sharedRenderer;
}

/** Compiles the shader ahead of time, so the first screen with cards does not pay for it. */
export function warmCardMaterialRenderer() {
  getSharedRenderer();
}

// Rasterizing a card blocks the main thread, so textures are prepared one at a time with a yield in between.
let texturePreparation: Promise<unknown> = Promise.resolve();

function queueTexturePreparation(task: () => Promise<void>) {
  const run = texturePreparation.then(async () => {
    await new Promise((resolve) => window.setTimeout(resolve));
    await task();
  });
  texturePreparation = run.catch(() => undefined);
  return run;
}

function readAsDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Card artwork could not be encoded"));
    reader.onerror = () => reject(new Error("Card artwork could not be encoded"));
    reader.readAsDataURL(blob);
  });
}

function getArtworkDataUrl(source: string) {
  const cached = artworkDataUrlCache.get(source);
  if (cached) {
    artworkDataUrlCache.delete(source);
    artworkDataUrlCache.set(source, cached);
    return cached;
  }

  const request = (async () => {
    const url = new URL(source, window.location.href);
    if (url.origin !== window.location.origin) throw new Error("Card artwork must be same-origin");
    const response = await fetch(url.href, { credentials: "same-origin", mode: "same-origin" });
    if (!response.ok) throw new Error(`Card artwork request failed with ${response.status}`);
    return readAsDataUrl(await response.blob());
  })();
  artworkDataUrlCache.set(source, request);
  if (artworkDataUrlCache.size > ART_DATA_URL_CACHE_LIMIT) {
    const oldestKey = artworkDataUrlCache.keys().next().value;
    if (oldestKey) artworkDataUrlCache.delete(oldestKey);
  }
  void request.catch(() => {
    if (artworkDataUrlCache.get(source) === request) artworkDataUrlCache.delete(source);
  });
  return request;
}

function escapeXmlAttribute(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;",
  })[character] ?? character);
}

async function makeSvgImage(svgMarkup: string, artworkSource: string | null | undefined) {
  let markup = svgMarkup;
  if (artworkSource) {
    const artworkDataUrl = await getArtworkDataUrl(artworkSource);
    const sourceReference = `href="${escapeXmlAttribute(artworkSource)}"`;
    markup = markup.replaceAll(sourceReference, `href="${escapeXmlAttribute(artworkDataUrl)}"`);
    if (markup === svgMarkup) throw new Error("Card artwork was not found in its SVG");
  }
  markup = markup.replace("<svg ", `<svg width="${SHADER_WIDTH}" height="${SHADER_HEIGHT}" `);
  const objectUrl = URL.createObjectURL(new Blob([markup], { type: "image/svg+xml;charset=utf-8" }));
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.decoding = "async";
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Card SVG could not be rasterized"));
      image.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function createTexture(gl: WebGLRenderingContext, image: TexImageSource) {
  const texture = gl.createTexture();
  if (!texture) return null;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
  try {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  } catch {
    gl.deleteTexture(texture);
    return null;
  } finally {
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
  }
  if (gl.getError() !== gl.NO_ERROR) {
    gl.deleteTexture(texture);
    return null;
  }
  return texture;
}

async function prepareArtTexture(gl: WebGLRenderingContext, layer: CardArtLayer) {
  const cached = layer.textureKey ? await loadCardTexture(layer.textureKey) : null;
  const image = cached ?? await makeSvgImage(layer.markup, layer.artworkSource);
  const canvas = document.createElement("canvas");
  canvas.width = SHADER_WIDTH;
  canvas.height = SHADER_HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Card art canvas is unavailable");
  context.drawImage(image, 0, 0, SHADER_WIDTH, SHADER_HEIGHT);
  cached?.close();
  if (!cached && layer.textureKey) saveCardTexture(layer.textureKey, canvas);
  const texture = createTexture(gl, canvas);
  if (!texture) throw new Error("Card art texture could not be created");
  return texture;
}

function randomBetween(minimum: number, maximum: number) {
  return minimum + Math.random() * (maximum - minimum);
}

function advanceInstance(instance: CardShaderInstance, time: number) {
  let targetX = 0;
  let targetY = 0;
  if (!instance.reducedMotion) {
    if (instance.pointerActive) {
      targetX = instance.pointerTarget.x;
      targetY = instance.pointerTarget.y;
    } else {
      const motion = instance.idleMotion;
      if (time >= motion.nextAt) {
        motion.from = { ...instance.tilt };
        motion.to = { x: randomBetween(-0.62, 0.62), y: randomBetween(-0.4, 0.4) };
        motion.startedAt = time;
        motion.duration = randomBetween(950, 2300);
        motion.nextAt = time + motion.duration + randomBetween(650, 3200);
      }
      const progress = Math.max(0, Math.min(1, (time - motion.startedAt) / Math.max(1, motion.duration)));
      const eased = progress * progress * (3 - 2 * progress);
      targetX = motion.from.x + (motion.to.x - motion.from.x) * eased;
      targetY = motion.from.y + (motion.to.y - motion.from.y) * eased;
    }
  }
  instance.tilt.x += (targetX - instance.tilt.x) * 0.08;
  instance.tilt.y += (targetY - instance.tilt.y) * 0.08;

  if (instance.destruction) {
    const effect = instance.destruction;
    const progress = Math.min(1, (time - effect.startedAt) / effect.duration);
    const eased = progress * progress * (3 - 2 * progress);
    instance.destructionProgress = effect.from + (effect.to - effect.from) * eased;
    if (progress >= 1) {
      instance.destructionProgress = effect.to;
      instance.destruction = null;
      effect.resolve();
    }
  }
}

function paintInstance(instance: CardShaderInstance, time: number) {
  const renderer = sharedRenderer;
  if (!renderer || instance.failed) return;
  const { gl, uniforms, canvas: output } = renderer;
  const material = instance.material;

  gl.viewport(0, 0, SHADER_WIDTH, SHADER_HEIGHT);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, instance.artTexture ?? renderer.emptyArtTexture);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, instance.texture);
  gl.uniform2f(uniforms.texelSize, 1 / SHADER_WIDTH, 1 / SHADER_HEIGHT);
  gl.uniform2f(uniforms.tilt, instance.tilt.x, instance.tilt.y);
  gl.uniform1f(uniforms.destruction, instance.destructionProgress);
  gl.uniform1f(uniforms.rough, material.rough);
  gl.uniform1f(uniforms.kind, material.kind);
  gl.uniform1f(uniforms.fx, material.fx);
  gl.uniform1f(uniforms.animTime, instance.reducedMotion ? 0 : (performance.now() / 1000) % 3600);
  gl.uniform1f(uniforms.metallic, material.metal);
  gl.uniform1f(uniforms.bump, material.bump);
  gl.uniform1f(uniforms.gain, material.gain);
  gl.uniform1f(uniforms.brush, material.brush);
  gl.uniform3f(uniforms.f0, material.f0[0], material.f0[1], material.f0[2]);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  instance.context.clearRect(0, 0, instance.canvas.width, instance.canvas.height);
  instance.context.drawImage(output, 0, 0, instance.canvas.width, instance.canvas.height);
  instance.painted = { destruction: instance.destructionProgress, x: instance.tilt.x, y: instance.tilt.y, at: time };
  instance.onReady(true);
}

function drawInstance(instance: CardShaderInstance, time: number) {
  advanceInstance(instance, time);
  paintInstance(instance, time);
}

function needsPaint(instance: CardShaderInstance, time: number) {
  const { painted, tilt } = instance;
  if (instance.animated && !instance.reducedMotion) {
    const frame = instance.canvas.clientWidth >= LIVING_CLOSEUP_WIDTH ? LIVING_CLOSEUP_FRAME_MS : LIVING_FRAME_MS;
    if (time - painted.at >= frame) return true;
  }
  return painted.destruction !== instance.destructionProgress
    || Math.abs(painted.x - tilt.x) > TILT_REPAINT_EPSILON
    || Math.abs(painted.y - tilt.y) > TILT_REPAINT_EPSILON;
}

let lastScrollAt = -Infinity;
let scrollTracking = false;

function trackScrolling() {
  if (scrollTracking) return;
  scrollTracking = true;
  // Scroll does not bubble, so capture sees every scrolling screen; the shared listener lives as long as the page.
  window.addEventListener("scroll", () => { lastScrollAt = performance.now(); }, { capture: true, passive: true });
}

// Battle strikes hold the idle tilt so the shared main thread goes to the strike animation.
let animationHolds = 0;

function hasAnimatedVisibleCards() {
  return animationHolds === 0 && !document.hidden && [...instances].some((instance) => instance.visible && !instance.reducedMotion && !instance.failed);
}

/** Pause the idle card motion until the returned release is called. */
export function holdCardMaterialAnimation() {
  animationHolds += 1;
  if (animationFrame) {
    cancelAnimationFrame(animationFrame);
    animationFrame = 0;
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    animationHolds -= 1;
    requestAnimationFrameIfNeeded();
  };
}

function renderFrame(time: number) {
  animationFrame = 0;
  if (!hasAnimatedVisibleCards()) return;
  if (time - lastFrameAt >= TARGET_FRAME_MS) {
    lastFrameAt = time;
    const scrolling = time - lastScrollAt < SCROLL_SETTLE_MS;
    const urgent: CardShaderInstance[] = [];
    const idle: CardShaderInstance[] = [];
    for (const instance of instances) {
      if (!instance.visible || instance.failed) continue;
      const destroying = instance.destruction !== null;
      advanceInstance(instance, time);
      if (destroying || instance.pointerActive) urgent.push(instance);
      else if (!scrolling && needsPaint(instance, time)) idle.push(instance);
    }
    for (const instance of urgent) {
      if (needsPaint(instance, time)) paintInstance(instance, time);
    }
    idle.sort((a, b) => a.painted.at - b.painted.at);
    const paintStartedAt = performance.now();
    for (const instance of idle) {
      paintInstance(instance, time);
      if (performance.now() - paintStartedAt > PAINT_BUDGET_MS) break;
    }
  }
  if (hasAnimatedVisibleCards()) animationFrame = requestAnimationFrame(renderFrame);
}

function requestAnimationFrameIfNeeded() {
  if (!animationFrame && hasAnimatedVisibleCards()) animationFrame = requestAnimationFrame(renderFrame);
}

function handleDocumentVisibility() {
  if (document.hidden && animationFrame) {
    cancelAnimationFrame(animationFrame);
    animationFrame = 0;
  } else {
    requestAnimationFrameIfNeeded();
  }
}

/** The live tilt, so a snapshot of this card can resume exactly where it stopped. */
export function getCardMaterialTilt(canvas: HTMLCanvasElement): CardTilt | null {
  const instance = canvasInstances.get(canvas);
  return instance ? { ...instance.tilt } : null;
}

export function mountCardMaterialShader({ artLayer, artworkSource, canvas, initialTilt, materialId, onReady, svgMarkup, textureKey }: MountCardMaterialShaderOptions) {
  let disposed = false;
  let visible = !("IntersectionObserver" in window);
  let creating = false;
  let failed = false;
  let instance: CardShaderInstance | null = null;
  const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const material = MATERIALS[materialId] ?? MATERIALS.silver;
  const animated = material.kind > 4.5;
  const cardRoot = canvas.closest<HTMLElement>(".deck-card, .duel-card, .card-detail-card, .shop-reveal__card, .limited-card-reveal__card, .campaign-boss-reward-card, .collection-card-visual, .collection-card-tile__plate, .player-profile-card-plate, .workshop-card__art, .battle-pass-card-thumbnail") ?? canvas.parentElement;
  const context = canvas.getContext("2d");
  if (!context) return () => undefined;

  // Assigning a size clears the canvas, which would erase a snapshot painted before this mount.
  if (canvas.width !== SHADER_WIDTH) canvas.width = SHADER_WIDTH;
  if (canvas.height !== SHADER_HEIGHT) canvas.height = SHADER_HEIGHT;
  context.imageSmoothingEnabled = true;
  trackScrolling();
  document.addEventListener("visibilitychange", handleDocumentVisibility);

  const fail = () => {
    failed = true;
    if (instance) {
      instance.destruction?.resolve();
      instance.destruction = null;
      instance.failed = true;
      instances.delete(instance);
      canvasInstances.delete(canvas);
      sharedRenderer?.gl.deleteTexture(instance.texture);
      if (instance.artTexture) sharedRenderer?.gl.deleteTexture(instance.artTexture);
      instance = null;
    }
    onReady(false);
    requestAnimationFrameIfNeeded();
  };

  const activate = () => {
    visible = true;
    if (instance) {
      instance.visible = true;
      if (instance.reducedMotion) drawInstance(instance, performance.now());
      else {
        drawInstance(instance, performance.now());
        requestAnimationFrameIfNeeded();
      }
      return;
    }
    prepare();
  };

  const prepare = () => {
    if (instance || creating || failed || disposed) return;
    creating = true;
    void queueTexturePreparation(async () => {
      if (disposed) return;
      const cachedTexture = textureKey ? await loadCardTexture(textureKey) : null;
      if (disposed) {
        cachedTexture?.close();
        return;
      }
      const image = cachedTexture ?? await makeSvgImage(svgMarkup, artworkSource);
      if (disposed) return;
      const renderer = getSharedRenderer();
      if (!renderer) throw new Error("WebGL is unavailable");
      const textureCanvas = document.createElement("canvas");
      textureCanvas.width = SHADER_WIDTH;
      textureCanvas.height = SHADER_HEIGHT;
      const textureContext = textureCanvas.getContext("2d");
      if (!textureContext) throw new Error("Card texture canvas is unavailable");
      textureContext.drawImage(image, 0, 0, SHADER_WIDTH, SHADER_HEIGHT);
      cachedTexture?.close();
      if (!cachedTexture && textureKey) saveCardTexture(textureKey, textureCanvas);
      const texture = createTexture(renderer.gl, textureCanvas);
      if (!texture) throw new Error("Card texture could not be created");
      const artTexture = artLayer ? await prepareArtTexture(renderer.gl, artLayer) : null;
      if (disposed) {
        renderer.gl.deleteTexture(texture);
        if (artTexture) renderer.gl.deleteTexture(artTexture);
        return;
      }
      const outputContext = canvas.getContext("2d");
      if (!outputContext) {
        renderer.gl.deleteTexture(texture);
        if (artTexture) renderer.gl.deleteTexture(artTexture);
        throw new Error("Card output canvas is unavailable");
      }
      instance = {
        animated,
        artTexture,
        canvas,
        context: outputContext,
        textureCanvas,
        textureContext,
        destruction: null,
        destructionProgress: 0,
        failed: false,
        idleMotion: {
          from: { x: 0, y: 0 },
          to: { x: 0, y: 0 },
          startedAt: performance.now(),
          duration: 0,
          nextAt: performance.now() + randomBetween(180, 2100),
        },
        painted: { destruction: 0, x: 0, y: 0, at: 0 },
        material,
        onReady,
        pointerActive: false,
        pointerTarget: { x: 0, y: 0 },
        reducedMotion: reducedMotionQuery.matches,
        texture,
        tilt: initialTilt ? { ...initialTilt } : { x: 0, y: 0 },
        visible,
      };
      instances.add(instance);
      canvasInstances.set(canvas, instance);
      drawInstance(instance, performance.now());
      requestAnimationFrameIfNeeded();
    }).catch(fail).finally(() => { creating = false; });
  };

  const deactivate = () => {
    visible = false;
    if (instance) instance.visible = false;
  };

  const observer = "IntersectionObserver" in window
    ? new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) activate();
      else deactivate();
    }, { threshold: 0.01 })
    : null;
  observer?.observe(canvas);
  const prepareObserver = "IntersectionObserver" in window
    ? new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) prepare();
    }, { root: canvas.closest(".app-content"), rootMargin: PREPARE_MARGIN, threshold: 0 })
    : null;
  prepareObserver?.observe(canvas);

  const handlePointerMove = (event: PointerEvent) => {
    if (!instance || event.pointerType === "touch" || !cardRoot) return;
    const bounds = cardRoot.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    instance.pointerActive = true;
    instance.pointerTarget.x = ((event.clientX - bounds.left) / bounds.width - 0.5) * 2;
    instance.pointerTarget.y = (0.5 - (event.clientY - bounds.top) / bounds.height) * 2;
    requestAnimationFrameIfNeeded();
  };
  const handlePointerLeave = () => {
    if (!instance) return;
    instance.pointerActive = false;
    const now = performance.now();
    instance.idleMotion = {
      from: { ...instance.tilt },
      to: { ...instance.tilt },
      startedAt: now,
      duration: 0,
      nextAt: now + randomBetween(250, 900),
    };
    requestAnimationFrameIfNeeded();
  };
  const handleMotionPreference = () => {
    if (!instance) return;
    instance.reducedMotion = reducedMotionQuery.matches;
    if (instance.reducedMotion) drawInstance(instance, performance.now());
    else requestAnimationFrameIfNeeded();
  };

  cardRoot?.addEventListener("pointermove", handlePointerMove);
  cardRoot?.addEventListener("pointerleave", handlePointerLeave);
  reducedMotionQuery.addEventListener("change", handleMotionPreference);
  if (visible) activate();

  return () => {
    disposed = true;
    observer?.disconnect();
    prepareObserver?.disconnect();
    document.removeEventListener("visibilitychange", handleDocumentVisibility);
    cardRoot?.removeEventListener("pointermove", handlePointerMove);
    cardRoot?.removeEventListener("pointerleave", handlePointerLeave);
    reducedMotionQuery.removeEventListener("change", handleMotionPreference);
    if (instance) {
      instance.destruction?.resolve();
      instance.destruction = null;
      instances.delete(instance);
      canvasInstances.delete(canvas);
      sharedRenderer?.gl.deleteTexture(instance.texture);
      if (instance.artTexture) sharedRenderer?.gl.deleteTexture(instance.artTexture);
      instance = null;
    }
    onReady(false);
    if (animationFrame && !hasAnimatedVisibleCards()) {
      cancelAnimationFrame(animationFrame);
      animationFrame = 0;
    }
  };
}

const powerTextureRevisions = new WeakMap<HTMLCanvasElement, number>();

export async function updateCardMaterialShaderPower(canvas: HTMLCanvasElement, svgMarkup: string, artworkSource?: string | null, textureKey?: string) {
  const instance = canvasInstances.get(canvas);
  const renderer = sharedRenderer;
  if (!instance || !renderer || instance.failed) return false;

  const revision = (powerTextureRevisions.get(canvas) ?? 0) + 1;
  powerTextureRevisions.set(canvas, revision);
  const image = await makeSvgImage(svgMarkup, artworkSource);
  if (canvasInstances.get(canvas) !== instance || powerTextureRevisions.get(canvas) !== revision) return false;

  // The stand repaints only the engraved power tray in its WebGL texture.
  const scale = SHADER_WIDTH / 240;
  const x = 56 * scale;
  const y = 17 * scale;
  const width = 170 * scale;
  const height = 38 * scale;
  instance.textureContext.clearRect(x, y, width, height);
  instance.textureContext.drawImage(image, x, y, width, height, x, y, width, height);
  if (textureKey) saveCardTexture(textureKey, instance.textureCanvas);

  const gl = renderer.gl;
  gl.bindTexture(gl.TEXTURE_2D, instance.texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, instance.textureCanvas);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
  drawInstance(instance, performance.now());
  requestAnimationFrameIfNeeded();
  return true;
}

export function playCardMaterialDestruction(target: HTMLElement, duration = 2300) {
  const canvas = target.querySelector<HTMLCanvasElement>(".card-material-shader--ready");
  const instance = canvas ? canvasInstances.get(canvas) : null;
  if (!instance || instance.failed || instance.reducedMotion || !instance.visible) return null;

  instance.destruction?.resolve();
  instance.destruction = {
    from: instance.destructionProgress,
    startedAt: performance.now(),
    duration,
    to: 1,
    resolve: () => undefined,
  };
  const effect = instance.destruction;
  const promise = new Promise<void>((resolve) => { effect.resolve = resolve; });
  drawInstance(instance, performance.now());
  requestAnimationFrameIfNeeded();
  return promise;
}
