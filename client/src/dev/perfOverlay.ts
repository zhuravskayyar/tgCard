// Development-only FPS readout (`?fps=1`): real frames per second of the page, the slowest second seen,
// and how many times per second card shaders repaint. `window.__cardastikaPerf` exposes the numbers.

interface PerfSample { fps: number; paints: number; minFps: number; cards: number }

export function startPerfOverlay() {
  const box = document.createElement("div");
  box.setAttribute("aria-hidden", "true");
  box.style.cssText = "position:fixed;z-index:99999;left:6px;bottom:84px;padding:4px 7px;border-radius:4px;"
    + "background:rgb(20 12 4 / 82%);color:#ffe9b8;font:700 12px/1.25 monospace;pointer-events:none;white-space:pre";
  document.body.append(box);

  let frames = 0;
  let paints = 0;
  let minFps = Infinity;
  let windowStart = performance.now();
  const sample: PerfSample = { fps: 0, paints: 0, minFps: 0, cards: 0 };
  (window as unknown as { __cardastikaPerf: PerfSample }).__cardastikaPerf = sample;

  const drawImage = CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage = function patched(this: CanvasRenderingContext2D, ...args: unknown[]) {
    if (this.canvas.classList?.contains("card-material-shader")) paints += 1;
    return (drawImage as (...a: unknown[]) => void).apply(this, args);
  } as typeof drawImage;

  const tick = (now: number) => {
    frames += 1;
    const elapsed = now - windowStart;
    if (elapsed >= 1000) {
      sample.fps = Math.round((frames * 1000) / elapsed);
      sample.paints = Math.round((paints * 1000) / elapsed);
      // The first second includes page start-up; it would hide the steady state.
      if (now > 3000) minFps = Math.min(minFps, sample.fps);
      sample.minFps = Number.isFinite(minFps) ? minFps : sample.fps;
      sample.cards = document.querySelectorAll("canvas.card-material-shader").length;
      box.textContent = `FPS ${sample.fps}  min ${sample.minFps}\ncards ${sample.cards}  paints ${sample.paints}/s`;
      frames = 0;
      paints = 0;
      windowStart = now;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
