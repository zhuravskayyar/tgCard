type ShaderMaterial = {
  bump: number;
  brush: number;
  f0: readonly [number, number, number];
  gain: number;
  metal: number;
  softness: readonly [number, number];
};

interface ShaderUniforms {
  bump: WebGLUniformLocation | null;
  brush: WebGLUniformLocation | null;
  f0: WebGLUniformLocation | null;
  gain: WebGLUniformLocation | null;
  metallic: WebGLUniformLocation | null;
  destruction: WebGLUniformLocation | null;
  softness: WebGLUniformLocation | null;
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
  gl: WebGLRenderingContext;
  uniforms: ShaderUniforms;
}

interface CardShaderInstance {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  textureCanvas: HTMLCanvasElement;
  textureContext: CanvasRenderingContext2D;
  failed: boolean;
  destruction: { from: number; startedAt: number; duration: number; to: number; resolve: () => void } | null;
  destructionProgress: number;
  idleMotion: IdleTiltMotion;
  material: ShaderMaterial;
  onReady: (ready: boolean) => void;
  pointerActive: boolean;
  pointerTarget: { x: number; y: number };
  reducedMotion: boolean;
  texture: WebGLTexture;
  tilt: { x: number; y: number };
  visible: boolean;
}

interface MountCardMaterialShaderOptions {
  artworkSource?: string | null;
  canvas: HTMLCanvasElement;
  materialId: string;
  onReady: (ready: boolean) => void;
  svgMarkup: string;
}

const SHADER_WIDTH = 360;
const SHADER_HEIGHT = 468;
const TARGET_FRAME_MS = 1000 / 30;
const ART_DATA_URL_CACHE_LIMIT = 12;

const MATERIALS: Readonly<Record<string, ShaderMaterial>> = {
  paper: { metal: 0, bump: 1.5, f0: [0.05, 0.05, 0.05], gain: 0.3, softness: [0.5, 0.5], brush: 0 },
  copper: { metal: 1, bump: 1.1, f0: [0.96, 0.56, 0.44], gain: 1, softness: [0.16, 0.16], brush: 0 },
  bronze: { metal: 1, bump: 1, f0: [0.82, 0.66, 0.4], gain: 0.9, softness: [0.24, 0.24], brush: 0 },
  silver: { metal: 1, bump: 0.8, f0: [0.92, 0.94, 0.96], gain: 1, softness: [0.55, 0.09], brush: 1 },
  gold: { metal: 1, bump: 1, f0: [1, 0.78, 0.34], gain: 1.1, softness: [0.1, 0.1], brush: 0 },
  platinum: { metal: 1, bump: 0.55, f0: [0.9, 0.93, 0.96], gain: 1.4, softness: [0.018, 0.018], brush: 0 },
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
uniform vec2 texelSize;
uniform vec2 tilt;
uniform vec2 softness;
uniform float metallic;
uniform float destruction;
uniform float bump;
uniform float gain;
uniform float brush;
uniform vec3 f0;

float luminance(vec3 color) { return dot(color, vec3(0.299, 0.587, 0.114)); }
float heightAt(vec2 point) {
  vec4 texel = texture2D(cardTexture, point);
  return luminance(texel.rgb) * texel.a + texel.a * 0.15;
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
float boxMask(vec2 point, vec2 center, vec2 halfSize, vec2 softnessSize) {
  vec2 distance = abs(point - center) - halfSize;
  return (1.0 - smoothstep(-softnessSize.x, softnessSize.x, distance.x))
    * (1.0 - smoothstep(-softnessSize.y, softnessSize.y, distance.y));
}
vec3 environment(vec3 reflected, vec2 windowSoftness) {
  vec2 softnessValue = windowSoftness + 0.012;
  vec2 point = reflected.xy;
  vec3 color = mix(vec3(0.02, 0.024, 0.03), vec3(0.22, 0.27, 0.33), smoothstep(-0.7, 0.8, point.y));
  color += vec3(0.9, 0.95, 1.0) * exp(-pow((point.y - 0.1) / (0.04 + windowSoftness.y), 2.0)) * 0.7;
  color += vec3(1.0, 0.97, 0.92) * 2.4 * boxMask(point, vec2(-0.42, 0.5), vec2(0.26, 0.18), softnessValue);
  color += vec3(0.82, 0.92, 1.0) * 1.8 * boxMask(point, vec2(0.48, 0.05), vec2(0.045, 0.7), softnessValue);
  color += vec3(1.0) * 2.6 * boxMask(point, vec2(0.12, -0.32), vec2(0.06, 0.05), softnessValue);
  color *= 1.0 - 0.92 * boxMask(point, vec2(0.02, 0.28), vec2(0.1, 0.22), softnessValue);
  return color;
}

void main() {
  vec4 texel = texture2D(cardTexture, uv);
  if (texel.a < 0.003) {
    gl_FragColor = vec4(0.0);
    return;
  }
  float sampleScale = 1.6;
  float slopeX = heightAt(uv + vec2(texelSize.x * sampleScale, 0.0))
    - heightAt(uv - vec2(texelSize.x * sampleScale, 0.0));
  float slopeY = heightAt(uv + vec2(0.0, texelSize.y * sampleScale))
    - heightAt(uv - vec2(0.0, texelSize.y * sampleScale));
  vec2 platePoint = (uv - 0.5) * vec2(1.0, 1.3);
  vec3 normal = normalize(vec3(-slopeX * bump * 1.6 - platePoint.x * 0.18,
    -slopeY * bump * 1.6 - platePoint.y * 0.18, 1.0));
  normal.y += (hash(floor(uv.y * 720.0)) - 0.5) * 0.07 * brush;
  normal = normalize(normal);
  vec3 viewDirection = normalize(vec3(tilt * 1.3, 1.5) - vec3(platePoint, 0.0));
  vec3 reflected = reflect(-viewDirection, normal);
  float facing = max(dot(normal, viewDirection), 0.0);
  vec3 fresnel = f0 + (1.0 - f0) * pow(1.0 - facing, 5.0);
  float reflectivity = smoothstep(0.04, 0.45, luminance(texel.rgb));
  vec3 specular = environment(reflected, softness) * fresnel * gain * reflectivity;
  specular = specular / (1.0 + specular * 0.45);
  float diffuse = max(dot(normal, normalize(vec3(-0.4, 0.55, 0.75))), 0.0);
  vec3 color = texel.rgb * (0.5 + 0.5 * diffuse) * mix(1.0, 0.62, metallic)
    + specular * mix(0.35, 1.0, metallic);
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
      softness: gl.getUniformLocation(program, "softness"),
      metallic: gl.getUniformLocation(program, "metallic"),
      destruction: gl.getUniformLocation(program, "destruction"),
      bump: gl.getUniformLocation(program, "bump"),
      gain: gl.getUniformLocation(program, "gain"),
      brush: gl.getUniformLocation(program, "brush"),
      f0: gl.getUniformLocation(program, "f0"),
    };
    gl.uniform1i(uniforms.texture, 0);
    return { canvas, gl, uniforms };
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

function randomBetween(minimum: number, maximum: number) {
  return minimum + Math.random() * (maximum - minimum);
}

function drawInstance(instance: CardShaderInstance, time: number) {
  const renderer = sharedRenderer;
  if (!renderer || instance.failed) return;
  const { gl, uniforms, canvas: output } = renderer;
  const material = instance.material;
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

  gl.viewport(0, 0, SHADER_WIDTH, SHADER_HEIGHT);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, instance.texture);
  gl.uniform2f(uniforms.texelSize, 1 / SHADER_WIDTH, 1 / SHADER_HEIGHT);
  gl.uniform2f(uniforms.tilt, instance.tilt.x, instance.tilt.y);
  gl.uniform1f(uniforms.destruction, instance.destructionProgress);
  gl.uniform2f(uniforms.softness, material.softness[0], material.softness[1]);
  gl.uniform1f(uniforms.metallic, material.metal);
  gl.uniform1f(uniforms.bump, material.bump);
  gl.uniform1f(uniforms.gain, material.gain);
  gl.uniform1f(uniforms.brush, material.brush);
  gl.uniform3f(uniforms.f0, material.f0[0], material.f0[1], material.f0[2]);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  instance.context.clearRect(0, 0, instance.canvas.width, instance.canvas.height);
  instance.context.drawImage(output, 0, 0, instance.canvas.width, instance.canvas.height);
  instance.onReady(true);
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
    for (const instance of instances) {
      if (instance.visible && !instance.failed) drawInstance(instance, time);
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

export function mountCardMaterialShader({ artworkSource, canvas, materialId, onReady, svgMarkup }: MountCardMaterialShaderOptions) {
  let disposed = false;
  let visible = !("IntersectionObserver" in window);
  let creating = false;
  let failed = false;
  let instance: CardShaderInstance | null = null;
  const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const material = MATERIALS[materialId] ?? MATERIALS.silver;
  const cardRoot = canvas.closest<HTMLElement>(".deck-card, .duel-card, .card-detail-card, .shop-reveal__card, .limited-card-reveal__card, .campaign-boss-reward-card, .collection-card-visual, .collection-card-tile__plate, .player-profile-card-plate, .workshop-card__art, .battle-pass-card-thumbnail") ?? canvas.parentElement;
  const context = canvas.getContext("2d");
  if (!context) return () => undefined;

  canvas.width = SHADER_WIDTH;
  canvas.height = SHADER_HEIGHT;
  context.imageSmoothingEnabled = true;
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
    if (creating || failed || disposed) return;
    creating = true;
    void (async () => {
      const image = await makeSvgImage(svgMarkup, artworkSource);
      if (disposed) return;
      const renderer = getSharedRenderer();
      if (!renderer) throw new Error("WebGL is unavailable");
      const textureCanvas = document.createElement("canvas");
      textureCanvas.width = SHADER_WIDTH;
      textureCanvas.height = SHADER_HEIGHT;
      const textureContext = textureCanvas.getContext("2d");
      if (!textureContext) throw new Error("Card texture canvas is unavailable");
      textureContext.drawImage(image, 0, 0, SHADER_WIDTH, SHADER_HEIGHT);
      const texture = createTexture(renderer.gl, textureCanvas);
      if (!texture) throw new Error("Card texture could not be created");
      const outputContext = canvas.getContext("2d");
      if (!outputContext) {
        renderer.gl.deleteTexture(texture);
        throw new Error("Card output canvas is unavailable");
      }
      instance = {
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
        material,
        onReady,
        pointerActive: false,
        pointerTarget: { x: 0, y: 0 },
        reducedMotion: reducedMotionQuery.matches,
        texture,
        tilt: { x: 0, y: 0 },
        visible,
      };
      instances.add(instance);
      canvasInstances.set(canvas, instance);
      drawInstance(instance, performance.now());
      requestAnimationFrameIfNeeded();
    })().catch(fail).finally(() => { creating = false; });
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

export async function updateCardMaterialShaderPower(canvas: HTMLCanvasElement, svgMarkup: string, artworkSource?: string | null) {
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
