import { useEffect, useRef, useState } from "react";

const PALETTES = [
  { css: "#d28c4b", shadow: [0.22, 0.11, 0.045] as const, highlight: [1, 0.7, 0.34] as const },
  { css: "#b8c9db", shadow: [0.11, 0.17, 0.26] as const, highlight: [0.88, 0.94, 1] as const },
  { css: "#f5c545", shadow: [0.25, 0.17, 0.035] as const, highlight: [1, 0.84, 0.32] as const },
] as const;

const VERTEX_SHADER = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const FRAGMENT_SHADER = `
precision mediump float;
uniform sampler2D u_texture;
uniform vec3 u_shadow;
uniform vec3 u_highlight;
varying vec2 v_uv;
void main() {
  vec4 source = texture2D(u_texture, v_uv);
  float luminance = dot(source.rgb, vec3(0.299, 0.587, 0.114));
  float carvedShade = pow(clamp(luminance, 0.0, 1.0), 0.82);
  vec3 metal = mix(u_shadow, u_highlight, carvedShade);
  float edgeLight = 1.0 - smoothstep(0.0, 0.09, abs(v_uv.x - v_uv.y * 0.28 - 0.24));
  float glint = edgeLight * smoothstep(0.45, 0.88, luminance) * source.a * 0.16;
  metal = mix(metal, vec3(1.0, 0.96, 0.82), glint);
  gl_FragColor = vec4(metal * source.a, source.a);
}`;

function compileShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Achievement shader is unavailable");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    throw new Error("Achievement shader failed to compile");
  }
  return shader;
}

/** Applies the three reference-inspired metal palettes to one transparent master emblem. */
export function AchievementGlyph({ src, tier, label, compact = false }: { src: string; tier: number; label: string; compact?: boolean }) {
  const fallbackRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [shaderReady, setShaderReady] = useState(false);
  const palette = PALETTES[Math.min(Math.max(tier, 0), PALETTES.length - 1)]!;

  useEffect(() => {
    const canvas = canvasRef.current;
    const sourceImage = fallbackRef.current;
    if (!canvas || !sourceImage) return;

    let gl: WebGLRenderingContext | null = null;
    let program: WebGLProgram | null = null;
    let texture: WebGLTexture | null = null;
    let buffer: WebGLBuffer | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let disposed = false;

    const draw = () => {
      if (disposed || !gl || !program || !texture || !buffer) return;
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
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      const position = gl.getAttribLocation(program, "a_position");
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(gl.getUniformLocation(program, "u_texture"), 0);
      gl.uniform3f(gl.getUniformLocation(program, "u_shadow"), palette.shadow[0], palette.shadow[1], palette.shadow[2]);
      gl.uniform3f(gl.getUniformLocation(program, "u_highlight"), palette.highlight[0], palette.highlight[1], palette.highlight[2]);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      setShaderReady(true);
    };

    const initialize = () => {
      if (disposed || !sourceImage.complete || sourceImage.naturalWidth === 0) return;
      try {
        gl = canvas.getContext("webgl", { alpha: true, antialias: true, premultipliedAlpha: true });
        if (!gl) return;
        const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
        const fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
        program = gl.createProgram();
        if (!program) throw new Error("Achievement shader program is unavailable");
        gl.attachShader(program, vertex);
        gl.attachShader(program, fragment);
        gl.linkProgram(program);
        gl.deleteShader(vertex);
        gl.deleteShader(fragment);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error("Achievement shader program failed to link");

        buffer = gl.createBuffer();
        texture = gl.createTexture();
        if (!buffer || !texture) throw new Error("Achievement shader resources are unavailable");
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sourceImage);
        resizeObserver = new ResizeObserver(draw);
        resizeObserver.observe(canvas);
        draw();
      } catch {
        // The transparent master WebP remains visible when WebGL is unavailable.
      }
    };

    if (sourceImage.complete) initialize();
    else sourceImage.addEventListener("load", initialize, { once: true });
    return () => {
      disposed = true;
      sourceImage.removeEventListener("load", initialize);
      resizeObserver?.disconnect();
      if (gl) {
        if (texture) gl.deleteTexture(texture);
        if (buffer) gl.deleteBuffer(buffer);
        if (program) gl.deleteProgram(program);
      }
    };
  }, [palette.highlight, palette.shadow]);

  return <span aria-label={label} className={`records-glyph records-glyph--tier-${tier + 1}${compact ? " records-glyph--compact" : ""}${shaderReady ? " records-glyph--shader-ready" : ""}`} role="img">
    <img alt="" aria-hidden="true" className="records-glyph__fallback" loading="lazy" ref={fallbackRef} src={src} />
    <canvas aria-hidden="true" className="records-glyph__canvas" ref={canvasRef} />
  </span>;
}
