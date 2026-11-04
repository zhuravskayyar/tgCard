import { useEffect, useRef, useState, type CSSProperties } from "react";

const TROPHY_ART = "/assets/ui/home/sprites/mode-tournament.webp";
const FULL_CROP = { left: 0, top: 0, right: 1, bottom: 1 };
const TROPHY_CUPS = [
  { centerX: 0.24, centerY: 0.66, height: 72, phase: 0, crop: FULL_CROP, color: [0.62, 0.72, 0.77] as const, filter: "grayscale(0.85) sepia(0.12) saturate(1.35) brightness(1.35)" },
  { centerX: 0.76, centerY: 0.66, height: 72, phase: 2.1, crop: FULL_CROP, color: [0.67, 0.34, 0.13] as const, filter: "sepia(1) saturate(2.25) hue-rotate(340deg) brightness(0.82)" },
  { centerX: 0.5, centerY: 0.51, height: 112, phase: 4.2, crop: FULL_CROP, color: [1.0, 0.68, 0.04] as const, filter: "sepia(1) saturate(2.8) hue-rotate(350deg) brightness(1.12)" },
] as const;

const TROPHY_SPARKS = Array.from({ length: 9 }, (_, index) => ({
  "--spark-x": `${12 + (index * 17) % 76}%`,
  "--spark-y": `${42 + (index * 11) % 45}%`,
  "--spark-delay": `${index * -0.8}s`,
  "--spark-duration": `${4 + (index % 3)}s`,
} as CSSProperties));

const VERTEX_SHADER = `
attribute vec2 a_position;
uniform vec2 u_center;
uniform vec2 u_halfSize;
varying vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position * u_halfSize + u_center, 0.0, 1.0);
}`;

const FRAGMENT_SHADER = `
precision mediump float;
uniform sampler2D u_texture;
uniform vec3 u_metal;
uniform vec4 u_crop;
uniform float u_time;
varying vec2 v_uv;
void main() {
  vec2 uv = mix(u_crop.xy, u_crop.zw, v_uv);
  vec4 source = texture2D(u_texture, uv);
  float light = dot(source.rgb, vec3(0.299, 0.587, 0.114));
  float shade = pow(clamp(light, 0.0, 1.0), 0.82);
  vec3 metal = u_metal * (0.13 + shade * 1.24);
  metal = mix(vec3(shade * 0.48), metal, 0.94);
  float glintTravel = (sin(u_time * 0.16) + 1.0) * 0.8 - 0.3;
  float glintLine = 1.0 - smoothstep(0.0, 0.055, abs(v_uv.x + v_uv.y * 0.32 - glintTravel));
  float glint = glintLine * smoothstep(0.28, 0.82, light) * source.a * 0.22;
  metal = mix(metal, vec3(1.0, 0.91, 0.68), glint);
  gl_FragColor = vec4(metal * source.a, source.a);
}`;

function compileShader(gl: WebGLRenderingContext, kind: number, source: string) {
  const shader = gl.createShader(kind);
  if (!shader) throw new Error("Cup shader is unavailable");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) ?? "Cup shader failed";
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

/** Recolors the reference cup art in one WebGL pass while preserving its shading and alpha. */
export function TournamentTrophy() {
  const fallbackCanvasRef = useRef<HTMLCanvasElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [shaderReady, setShaderReady] = useState(false);

  useEffect(() => {
    const canvas = fallbackCanvasRef.current;
    if (!canvas) return;
    const image = new Image();
    let disposed = false;
    const draw = () => {
      if (disposed || !image.complete || !image.naturalWidth || !image.naturalHeight) return;
      const bounds = canvas.getBoundingClientRect();
      if (bounds.width < 1 || bounds.height < 1) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.round(bounds.width * ratio));
      const height = Math.max(1, Math.round(bounds.height * ratio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      const context = canvas.getContext("2d");
      if (!context) return;
      context.clearRect(0, 0, width, height);
      context.save();
      context.scale((bounds.width / 306) * ratio, (bounds.width / 306) * ratio);
      for (const cup of TROPHY_CUPS) {
        const sourceX = image.naturalWidth * cup.crop.left;
        const sourceY = image.naturalHeight * cup.crop.top;
        const sourceWidth = image.naturalWidth * (cup.crop.right - cup.crop.left);
        const sourceHeight = image.naturalHeight * (cup.crop.bottom - cup.crop.top);
        const sourceAspect = sourceWidth / sourceHeight;
        const cupWidth = cup.height * sourceAspect;
        context.save();
        context.filter = cup.filter;
        context.drawImage(
          image,
          sourceX,
          sourceY,
          sourceWidth,
          sourceHeight,
          cup.centerX * 306 - cupWidth / 2,
          cup.centerY * 164 - cup.height / 2,
          cupWidth,
          cup.height,
        );
        context.restore();
      }
      context.restore();
    };
    image.onload = draw;
    image.src = TROPHY_ART;
    const resizeObserver = new ResizeObserver(draw);
    resizeObserver.observe(canvas);
    return () => {
      disposed = true;
      resizeObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const image = new Image();
    let disposed = false;
    let resizeObserver: ResizeObserver | null = null;
    let gl: WebGLRenderingContext | null = null;
    let program: WebGLProgram | null = null;
    let texture: WebGLTexture | null = null;
    let buffer: WebGLBuffer | null = null;
    let intersectionObserver: IntersectionObserver | null = null;
    let frameId: number | null = null;
    let lastTime = 0;
    let lastDrawAt = 0;
    let inView = true;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    const draw = (timeSeconds = lastTime) => {
      if (disposed || !gl || !program || !texture || !buffer) return;
      lastTime = timeSeconds;
      const bounds = canvas.getBoundingClientRect();
      if (bounds.width < 1 || bounds.height < 1) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.round(bounds.width * ratio));
      const height = Math.max(1, Math.round(bounds.height * ratio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      gl.viewport(0, 0, width, height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      const position = gl.getAttribLocation(program, "a_position");
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(gl.getUniformLocation(program, "u_texture"), 0);
      gl.uniform1f(gl.getUniformLocation(program, "u_time"), timeSeconds);
      const scale = bounds.width / 306;

      const drawCup = (cup: typeof TROPHY_CUPS[number]) => {
        const sourceAspect = (image.naturalWidth * (cup.crop.right - cup.crop.left)) / (image.naturalHeight * (cup.crop.bottom - cup.crop.top));
        const cupWidth = cup.height * sourceAspect;
        const bob = reducedMotion.matches ? 0 : Math.sin(timeSeconds * 0.9 + cup.phase) * 3;
        gl!.uniform4f(gl!.getUniformLocation(program!, "u_crop"), cup.crop.left, cup.crop.top, cup.crop.right, cup.crop.bottom);
        gl!.uniform2f(gl!.getUniformLocation(program!, "u_center"), cup.centerX * 2 - 1, 1 - (cup.centerY + bob / 164) * 2);
        gl!.uniform2f(gl!.getUniformLocation(program!, "u_halfSize"), (cupWidth * scale) / bounds.width, (cup.height * scale) / bounds.height);
        gl!.uniform3f(gl!.getUniformLocation(program!, "u_metal"), cup.color[0], cup.color[1], cup.color[2]);
        gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);
      };

      // Every cup keeps the complete wreath and its source proportions, with room to move.
      for (const cup of TROPHY_CUPS) drawCup(cup);
      setShaderReady(true);
    };

    function animate(timestamp: number) {
      frameId = null;
      if (timestamp - lastDrawAt >= 1000 / 30) {
        lastDrawAt = timestamp;
        draw(timestamp / 1000);
      }
      scheduleAnimation();
    }
    function scheduleAnimation() {
      if (disposed || reducedMotion.matches || document.hidden || !inView || frameId !== null) return;
      frameId = window.requestAnimationFrame(animate);
    }
    const stopAnimation = () => {
      if (frameId !== null) window.cancelAnimationFrame(frameId);
      frameId = null;
    };
    const handleVisibility = () => document.hidden ? stopAnimation() : scheduleAnimation();
    const handleMotionPreference = () => {
      if (reducedMotion.matches) {
        stopAnimation();
        draw(lastTime);
      } else scheduleAnimation();
    };

    image.onload = () => {
      if (disposed) return;
      try {
        gl = canvas.getContext("webgl", { alpha: true, antialias: true, premultipliedAlpha: true });
        if (!gl) return;
        const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
        const fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
        program = gl.createProgram();
        if (!program) throw new Error("Cup shader program is unavailable");
        gl.attachShader(program, vertex);
        gl.attachShader(program, fragment);
        gl.linkProgram(program);
        gl.deleteShader(vertex);
        gl.deleteShader(fragment);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error("Cup shader program failed");

        buffer = gl.createBuffer();
        texture = gl.createTexture();
        if (!buffer || !texture) throw new Error("Cup shader resources are unavailable");
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
        resizeObserver = new ResizeObserver(() => draw(lastTime));
        resizeObserver.observe(canvas);
        draw();
        intersectionObserver = new IntersectionObserver(entries => {
          inView = Boolean(entries[0]?.isIntersecting);
          if (inView) scheduleAnimation();
          else stopAnimation();
        });
        intersectionObserver.observe(canvas);
        document.addEventListener("visibilitychange", handleVisibility);
        reducedMotion.addEventListener("change", handleMotionPreference);
        scheduleAnimation();
      } catch {
        // Keep the original image visible when WebGL is unavailable on the device.
      }
    };
    image.src = TROPHY_ART;

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      intersectionObserver?.disconnect();
      stopAnimation();
      document.removeEventListener("visibilitychange", handleVisibility);
      reducedMotion.removeEventListener("change", handleMotionPreference);
      if (gl) {
        if (texture) gl.deleteTexture(texture);
        if (buffer) gl.deleteBuffer(buffer);
        if (program) gl.deleteProgram(program);
      }
    };
  }, []);

  return <span aria-label="Срібний, золотий і бронзовий турнірні кубки" className={`tournament-cups${shaderReady ? " tournament-cups--shader-ready" : ""}`} role="img">
    <canvas aria-hidden="true" className="tournament-cups__fallback" ref={fallbackCanvasRef} />
    <canvas aria-hidden="true" className="tournament-cups__canvas" ref={canvasRef} />
    {TROPHY_SPARKS.map((style, index) => <span aria-hidden="true" className="tournament-cups__spark" key={index} style={style} />)}
  </span>;
}
