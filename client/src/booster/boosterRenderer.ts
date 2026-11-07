import { createCardMesh, createCardSlices, createFoilMesh, createFoilPiece, createFoilWalls, foilSurface, multiply, perspective, transform, type BoosterMesh } from "./boosterGeometry";
import { PACK_HEIGHT, PACK_WIDTH, prepareBoosterCut, type BoosterCut, type CutPoint } from "./boosterCut";
import { getBoosterMotion } from "./boosterMotion";
import { BOOSTER_PAPER_CURL_DEPTH, BOOSTER_PAPER_RIPPLE_DEPTH, getBoosterFragmentPose, getBoosterFragmentShape, type BoosterFragmentShape } from "./boosterFragments";
import { createCardMaterialSurface, type CardMaterialSurface } from "../cards/cardMaterialShader";
import { CARD_BACK_MATERIAL_ID } from "../cards/cardBackModel";
import type { BoosterCardTextures } from "./boosterCardTexture";

export type BoosterPhase = "sealed" | "tearing" | "opening" | "revealing" | "revealed";
export interface BoosterRenderer {
  open: () => { ok: boolean; message?: string };
  cut: (points: readonly CutPoint[]) => { ok: boolean; message?: string };
  pointFromClient: (x: number, y: number) => CutPoint;
  setMode: (mode: "cut" | "rotate") => void;
  reset: () => void;
  rotate: (radians: number, pitch?: number) => void;
  dispose: () => void;
}

const VERTEX = `
precision mediump float;
attribute vec3 aPosition;
attribute vec3 aNormal;
attribute vec2 aUv;
uniform mat4 uModel;
uniform mat4 uViewProjection;
uniform float uFoil;
uniform float uBend;
uniform vec2 uCutCenter;
uniform vec2 uCutNormal;
uniform float uFoldScale;
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vPosition;
void main() {
  vec3 p = aPosition;
  vec3 normal = aNormal;
  if (uFoil > .5) {
    float scale = max(.08, uFoldScale);
    float fold = clamp(dot(p.xy - uCutCenter, uCutNormal) / scale, -1., 1.);
    float wave = p.y * 9. + p.x * 17.;
    float slope = uBend * .5 * ${BOOSTER_PAPER_CURL_DEPTH.toFixed(3)} * 3.14159265 * sin(fold * 3.14159265) / scale;
    vec2 gradient = uCutNormal * slope + abs(uBend) * cos(wave) * ${BOOSTER_PAPER_RIPPLE_DEPTH.toFixed(3)} * vec2(17., 9.);
    p.z += uBend * .5 * ${BOOSTER_PAPER_CURL_DEPTH.toFixed(3)} * (1. - cos(fold * 3.14159265));
    p.z += abs(uBend) * sin(wave) * ${BOOSTER_PAPER_RIPPLE_DEPTH.toFixed(3)};
    normal = normalize(vec3(normal.xy - gradient * normal.z, normal.z));
  }
  vec4 world = uModel * vec4(p, 1.);
  vPosition = world.xyz;
  vNormal = normalize(mat3(uModel) * normal);
  vUv = aUv;
  gl_Position = uViewProjection * world;
}`;

const FRAGMENT = `
precision mediump float;
uniform sampler2D uTexture;
uniform float uBack;
uniform float uFoil;
uniform float uEdge;
uniform float uMaterial;
uniform float uSlice;
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vPosition;
void main() {
  vec4 tex = texture2D(uTexture, vUv);
  // Pack walls and card layers follow the painted silhouette; nothing is drawn where the art is transparent.
  if (tex.a < (uFoil > .5 ? .5 : .15) && (uEdge < .5 || uFoil > .5 || uSlice > .5)) discard;
  if (uSlice > .5) {
    // Inner paper of the card: warm parchment fibre, darker towards the middle of its thickness.
    gl_FragColor = vec4(vec3(.46, .33, .19) * (.88 + .12 * sin(vUv.x * 90. + vUv.y * 40.)), 1.);
    return;
  }
  if (uMaterial > .5) {
    // The shared shader outputs premultiplied colour; the physical card remains opaque.
    gl_FragColor = vec4(clamp(tex.rgb / max(tex.a, .001), 0., 1.), 1.);
    return;
  }
  vec3 normal = normalize(vNormal);
  vec3 light = normalize(vec3(-2.8, 3.5, 5.));
  vec3 eye = normalize(vec3(0., 0., 9.) - vPosition);
  float diffuse = max(dot(normal, light), 0.);
  float gold = smoothstep(.05, .3, tex.r - tex.b);
  vec3 color = uEdge > .5 ? vec3(.39, .27, .13) + vec3(.05) * sin(vUv.y * 35.) : tex.rgb;
  if (uBack > .5) {
    color *= vec3(.35, .55, .51);
    float seam = 1. - smoothstep(.008, .025, abs(vUv.x - .5));
    color += vec3(.15, .12, .065) * seam;
  }
  float specular = pow(max(dot(reflect(-light, normal), eye), 0.), mix(28., 70., gold));
  float rim = pow(1. - abs(dot(normal, eye)), 3.);
  vec3 foil = color * (.8 + diffuse * .35) + vec3(1., .83, .49) * specular * (.05 + gold * .07) + vec3(.06, .04, .02) * rim;
  if (uFoil > .5 && !gl_FrontFacing) foil = vec3(.32, .22, .12) * (.8 + abs(dot(normal, light)) * .3);
  color = mix(color * (.9 + diffuse * .15), foil, uFoil);
  // Paper is an opaque cutout. Its PNG alpha must never turn it into translucent glass.
  gl_FragColor = vec4(color, 1.);
}`;

interface GpuMesh { attributes: WebGLBuffer[]; index: WebGLBuffer; count: number }

export function mountBoosterRenderer(canvas: HTMLCanvasElement, wrapper: HTMLCanvasElement, card: BoosterCardTextures, cardReverse: HTMLCanvasElement, onPhase: (phase: BoosterPhase) => void, onError: (message: string) => void): BoosterRenderer {
  const gl = canvas.getContext("webgl", { alpha: true, antialias: true, premultipliedAlpha: false });
  if (!gl) throw new Error("Цей браузер не підтримує 3D. Відкрий сторінку в Chrome або Telegram.");
  const shaders: WebGLShader[] = [];
  const meshes = new Set<GpuMesh>();
  const textures: WebGLTexture[] = [];
  let cardSurface: CardMaterialSurface | null = null;
  let cardBackSurface: CardMaterialSurface | null = null;
  const program = gl.createProgram();
  if (!program) throw new Error("Не вдалося створити 3D-сцену.");
  function compile(type: number, source: string) {
    const shader = gl!.createShader(type);
    if (!shader) throw new Error("Не вдалося створити 3D-матеріал.");
    shaders.push(shader);
    gl!.shaderSource(shader, source);
    gl!.compileShader(shader);
    if (!gl!.getShaderParameter(shader, gl!.COMPILE_STATUS)) throw new Error(gl!.getShaderInfoLog(shader) || "Помилка 3D-матеріалу.");
    gl!.attachShader(program!, shader);
  }
  function uploadMesh(mesh: BoosterMesh) {
    const attributes = [mesh.positions, mesh.normals, mesh.uvs].map((data) => {
      const buffer = gl!.createBuffer();
      if (!buffer) throw new Error("Недостатньо пам’яті для 3D-моделі.");
      gl!.bindBuffer(gl!.ARRAY_BUFFER, buffer);
      gl!.bufferData(gl!.ARRAY_BUFFER, data, gl!.STATIC_DRAW);
      return buffer;
    });
    const index = gl!.createBuffer();
    if (!index) throw new Error("Недостатньо пам’яті для 3D-моделі.");
    gl!.bindBuffer(gl!.ELEMENT_ARRAY_BUFFER, index);
    gl!.bufferData(gl!.ELEMENT_ARRAY_BUFFER, mesh.indices, gl!.STATIC_DRAW);
    const result = { attributes, index, count: mesh.indices.length };
    meshes.add(result);
    return result;
  }
  function uploadTexture(source: TexImageSource) {
    const texture = gl!.createTexture();
    if (!texture) throw new Error("Не вдалося створити текстуру.");
    textures.push(texture);
    gl!.bindTexture(gl!.TEXTURE_2D, texture);
    gl!.pixelStorei(gl!.UNPACK_FLIP_Y_WEBGL, true);
    gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA, gl!.RGBA, gl!.UNSIGNED_BYTE, source);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.LINEAR);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.LINEAR);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE);
    return texture;
  }
  function deleteMesh(mesh: GpuMesh) {
    mesh.attributes.forEach((buffer) => gl!.deleteBuffer(buffer));
    gl!.deleteBuffer(mesh.index);
    meshes.delete(mesh);
  }
  function freeGpu() {
    cardSurface?.dispose();
    cardBackSurface?.dispose();
    meshes.forEach(deleteMesh);
    textures.forEach((texture) => gl!.deleteTexture(texture));
    shaders.forEach((shader) => gl!.deleteShader(shader));
    gl!.deleteProgram(program);
  }
  let bodyFront: GpuMesh, bodyBack: GpuMesh, bodyWalls: GpuMesh, cardFront: GpuMesh, cardBack: GpuMesh, cardSlices: GpuMesh;
  let foilTexture: WebGLTexture, cardTexture: WebGLTexture, reverseTexture: WebGLTexture;
  try {
    compile(gl.VERTEX_SHADER, VERTEX);
    compile(gl.FRAGMENT_SHADER, FRAGMENT);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || "Не вдалося підготувати 3D-сцену.");
    [bodyFront, bodyBack] = [uploadMesh(createFoilMesh(false)), uploadMesh(createFoilMesh(true))];
    bodyWalls = uploadMesh(createFoilWalls([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }]));
    [cardFront, cardBack] = [uploadMesh(createCardMesh(false)), uploadMesh(createCardMesh(true))];
    cardSlices = uploadMesh(createCardSlices());
    foilTexture = uploadTexture(wrapper);
    cardBackSurface = createCardMaterialSurface(gl, cardReverse, CARD_BACK_MATERIAL_ID);
    reverseTexture = cardBackSurface.texture;
    cardSurface = createCardMaterialSurface(gl, card.plate, card.materialId, card.art);
    cardTexture = cardSurface.texture;
  } catch (error) {
    freeGpu();
    throw error;
  }
  const locations = ["aPosition", "aNormal", "aUv"].map((name) => gl.getAttribLocation(program, name));
  const uniform = Object.fromEntries(["Model", "ViewProjection", "Bend", "CutCenter", "CutNormal", "FoldScale", "Foil", "Edge", "Material", "Texture", "Back", "Slice"].map((name) => [name, gl.getUniformLocation(program, `u${name}`)]));
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let frame = 0, disposed = false, startedAt: number | null = null, phase: BoosterPhase = "sealed", yaw = 0;
  let mode: "cut" | "rotate" = "cut";
  let cut: BoosterCut | null = null;
  let pieces: GpuMesh[][] = [];
  let fragmentShapes: BoosterFragmentShape[] = [];
  let materialPaint = { x: NaN, y: NaN, at: -Infinity };
  let cardYaw = 0, cardPitch = 0, targetYaw = 0, targetPitch = 0, openingCount = 0;
  let pausedAt: number | null = null;
  function setPhase(next: BoosterPhase) {
    if (next !== phase) { phase = next; onPhase(next); }
  }
  function draw(mesh: GpuMesh, texture: WebGLTexture, model: Float32Array, foil: boolean, back = false, bend = 0, edge = false, material = false, slice = false) {
    mesh.attributes.forEach((buffer, index) => {
      gl!.bindBuffer(gl!.ARRAY_BUFFER, buffer);
      gl!.enableVertexAttribArray(locations[index]);
      gl!.vertexAttribPointer(locations[index], index === 2 ? 2 : 3, gl!.FLOAT, false, 0, 0);
    });
    gl!.bindBuffer(gl!.ELEMENT_ARRAY_BUFFER, mesh.index);
    gl!.bindTexture(gl!.TEXTURE_2D, texture);
    gl!.uniformMatrix4fv(uniform.Model, false, model);
    gl!.uniform1f(uniform.Foil, foil ? 1 : 0);
    gl!.uniform1f(uniform.Back, back ? 1 : 0);
    gl!.uniform1f(uniform.Edge, edge ? 1 : 0);
    gl!.uniform1f(uniform.Material, material ? 1 : 0);
    gl!.uniform1f(uniform.Slice, slice ? 1 : 0);
    gl!.uniform1f(uniform.Bend, bend);
    gl!.drawElements(gl!.TRIANGLES, mesh.count, gl!.UNSIGNED_SHORT, 0);
  }
  function render(now: number) {
    if (disposed || document.hidden) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.round(rect.width * dpr), height = Math.round(rect.height * dpr);
    if (!width || !height) return;
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    gl!.viewport(0, 0, width, height);
    gl!.clearColor(0, 0, 0, 0);
    gl!.clear(gl!.COLOR_BUFFER_BIT | gl!.DEPTH_BUFFER_BIT);
    gl!.enable(gl!.DEPTH_TEST);
    gl!.depthMask(true);
    gl!.enable(gl!.CULL_FACE);
    gl!.disable(gl!.BLEND);
    gl!.useProgram(program);
    gl!.uniform1i(uniform.Texture, 0);
    // Keep the whole object in view on narrow and wide canvases.
    const aspect = width / height;
    const elapsed = startedAt === null ? 0 : motion.matches || phase === "revealed" ? 4000 : now - startedAt;
    const movement = getBoosterMotion(elapsed);
    const { tear, drop, rise, settle, flip, phase: animationPhase } = movement;
    const distance = Math.max(7.5, 4.4 / aspect) + rise * 1.5 * (1 - settle);
    gl!.uniformMatrix4fv(uniform.ViewProjection, false, multiply(perspective(aspect), transform(0, -rise * .65 * (1 - settle), -distance)));
    if (startedAt !== null) setPhase(animationPhase);
    const idle = startedAt === null && mode === "rotate" && !motion.matches;
    const rotation = startedAt === null && mode === "rotate" ? yaw + (idle ? Math.sin(now * .00045) * .035 : 0) : 0;
    const float = idle ? Math.sin(now * .0011) * .04 : 0;
    gl!.uniform2f(uniform.CutCenter, cut ? (cut.center.x - .5) * PACK_WIDTH : 0, cut ? (cut.center.y - .5) * PACK_HEIGHT : 0);
    gl!.uniform2f(uniform.CutNormal, cut?.normal.x ?? 0, cut?.normal.y ?? 1);
    gl!.uniform1f(uniform.FoldScale, 1);
    gl!.disable(gl!.CULL_FACE);
    if (startedAt === null) {
      const bodyModel = transform(0, -.1 + float, 0, 0, rotation);
      draw(bodyFront, foilTexture, bodyModel, true);
      draw(bodyBack, foilTexture, bodyModel, true, true);
      draw(bodyWalls, foilTexture, bodyModel, true, false, 0, true);
    } else if (drop < 1 && cut) {
      // Remove fragments only after they have physically fallen beyond the camera's vertical extent.
      pieces.forEach(([front, back, walls], index) => {
        const shape = fragmentShapes[index];
        const { matrix: pieceModel } = getBoosterFragmentPose(shape, movement, distance);
        gl!.uniform2f(uniform.CutCenter, shape.hinge.x, shape.hinge.y);
        gl!.uniform1f(uniform.FoldScale, shape.foldScale);
        draw(front, foilTexture, pieceModel, true, false, tear);
        draw(back, foilTexture, pieceModel, true, true, tear);
        draw(walls, foilTexture, pieceModel, true, false, tear, true);
      });
    }
    gl!.enable(gl!.CULL_FACE);
    let livingMaterial = false;
    if (startedAt !== null) {
      cardYaw += (targetYaw - cardYaw) * (motion.matches ? 1 : .18);
      cardPitch += (targetPitch - cardPitch) * (motion.matches ? 1 : .18);
      const cardY = -.22 + rise * 2.15 - settle * 1.93;
      const cardModel = transform(Math.sin(rise * Math.PI) * .16 * (1 - settle), cardY, -.04 + rise * .48, cardPitch * settle - Math.sin(rise * Math.PI) * .24, Math.PI * (1 - flip) + Math.sin(flip * Math.PI) * .22 + cardYaw * settle, Math.sin(rise * Math.PI) * -.1, 1 + settle * .28);
      const tiltX = cardModel[8] / (1 + settle * .28) * 1.3, tiltY = cardModel[9] / (1 + settle * .28) * 1.3;
      livingMaterial = Boolean(cardSurface?.animated && !motion.matches && cardModel[10] > 0);
      const changedTilt = !Number.isFinite(materialPaint.x) || Math.abs(tiltX - materialPaint.x) + Math.abs(tiltY - materialPaint.y) > .002;
      if (cardSurface && (changedTilt || livingMaterial && now - materialPaint.at >= 33)) {
        // Material time starts with the opening, so star steel's hologram assembles as the card comes out of the pack.
        cardSurface.render(tiltX, tiltY, motion.matches ? 0 : ((now - (startedAt ?? 0)) / 1000) % 3600);
        materialPaint = { x: tiltX, y: tiltY, at: now };
        // The material pass owns a separate framebuffer, but shares this WebGL context.
        gl!.viewport(0, 0, width, height); gl!.useProgram(program);
        gl!.enable(gl!.DEPTH_TEST); gl!.depthMask(true); gl!.enable(gl!.CULL_FACE); gl!.disable(gl!.BLEND);
      }
      draw(cardFront, cardTexture, cardModel, false, false, 0, false, true);
      draw(cardBack, reverseTexture, cardModel, false);
      // The layers sit a hair behind the faces in depth, so the faces always win and only the edge shows from the side.
      gl!.enable(gl!.POLYGON_OFFSET_FILL);
      gl!.polygonOffset(2, 6);
      draw(cardSlices, cardTexture, cardModel, false, false, 0, false, false, true);
      gl!.disable(gl!.POLYGON_OFFSET_FILL);
    }
    const movingCard = Math.abs(targetYaw - cardYaw) + Math.abs(targetPitch - cardPitch) > .001;
    if (!motion.matches && (idle || startedAt !== null && phase !== "revealed" || movingCard || livingMaterial)) frame = window.requestAnimationFrame(render);
  }
  function redraw() {
    window.cancelAnimationFrame(frame);
    frame = window.requestAnimationFrame(render);
  }
  function handleVisibility() {
    if (document.hidden) { pausedAt = performance.now(); window.cancelAnimationFrame(frame); }
    else {
      if (startedAt !== null && pausedAt !== null) startedAt += performance.now() - pausedAt;
      pausedAt = null;
      redraw();
    }
  }
  function handleContextLost(event: Event) {
    event.preventDefault();
    window.cancelAnimationFrame(frame);
    onError("3D-сцену призупинено браузером. Натисни «Спробувати ще раз».");
  }
  const observer = new ResizeObserver(redraw);
  observer.observe(canvas);
  motion.addEventListener("change", redraw);
  document.addEventListener("visibilitychange", handleVisibility);
  canvas.addEventListener("webglcontextlost", handleContextLost);
  redraw();
  function clearCut() { pieces.flat().forEach(deleteMesh); pieces = []; fragmentShapes = []; cut = null; }
  function startCut(points: readonly CutPoint[]) {
    if (phase !== "sealed" || startedAt !== null) return { ok: false };
    const result = prepareBoosterCut(points);
    if (!result.ok) return result;
    const uploaded: GpuMesh[] = [];
    try {
      const geometry = result.cut.pieces.map((polygon) => [createFoilPiece(false, polygon), createFoilPiece(true, polygon), createFoilWalls(polygon)]);
      clearCut();
      pieces = geometry.map((pair) => pair.map((mesh) => { const gpu = uploadMesh(mesh); uploaded.push(gpu); return gpu; }));
      fragmentShapes = result.cut.pieces.map((polygon, index) => getBoosterFragmentShape(polygon, result.cut, index));
      cut = result.cut;
    } catch (reason) {
      uploaded.forEach(deleteMesh);
      pieces = [];
      return { ok: false, message: reason instanceof Error ? reason.message : "Спробуй інший розріз." };
    }
    startedAt = performance.now();
    setPhase("tearing");
    redraw();
    return { ok: true };
  }
  return {
    open() {
      const direction = openingCount++ % 2 === 0 ? 1 : -1;
      return startCut([{ x: -.05, y: direction === 1 ? .83 : .65 }, { x: .5, y: .74 }, { x: 1.05, y: direction === 1 ? .65 : .83 }]);
    },
    cut: startCut,
    pointFromClient(x, y) {
      const rect = canvas.getBoundingClientRect(), aspect = rect.width / rect.height;
      const distance = Math.max(7.5, 4.4 / aspect), f = 1 / Math.tan(34 * Math.PI / 360);
      const nx = (x - rect.left) / rect.width * 2 - 1, ny = 1 - (y - rect.top) / rect.height * 2;
      let point = { x: .5, y: .5 }, z = .12;
      for (let i = 0; i < 3; i++) {
        point = { x: .5 + nx * aspect * (distance - z) / f / PACK_WIDTH, y: .5 + (ny * (distance - z) / f + .1) / PACK_HEIGHT };
        z = point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1 ? foilSurface(point.x, point.y)[2] : .01;
      }
      return point;
    },
    setMode(next) { if (mode === next) return; mode = next; yaw = 0; redraw(); },
    reset() { startedAt = null; yaw = 0; targetYaw = cardYaw = targetPitch = cardPitch = 0; clearCut(); setPhase("sealed"); redraw(); },
    rotate(radians, pitch = 0) {
      if (phase === "sealed") yaw += radians;
      else if (phase === "revealed") { targetYaw += radians; targetPitch = Math.max(-1.15, Math.min(1.15, targetPitch + pitch)); }
      else return;
      redraw();
    },
    dispose() {
      disposed = true;
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      motion.removeEventListener("change", redraw);
      document.removeEventListener("visibilitychange", handleVisibility);
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      freeGpu();
    },
  };
}
