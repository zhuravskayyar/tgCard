/* Cardastika — living World Tree background for wide screens.
   One fixed canvas over the painted desktop art (desktop-world-v1.webp, drawn with
   background-size: cover, centred). Every effect is anchored to a place in the painting:
   embers over the burning ruins, spray at the waterfalls, mist in the valley, light from
   the World Tree, wisps rising along its trunk and leaves falling from the branches.
   Skipped on narrow screens, with reduced motion, and paused while the tab is hidden. */
(function () {
  "use strict";
  if (window.__cardastikaWorldAmbient) return;
  window.__cardastikaWorldAmbient = true;

  var ART_W = 1422;
  var ART_H = 687;
  var MIN_WIDTH = 700;
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)");
  if (reduceMotion && reduceMotion.matches) return;

  var canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.className = "world-ambient";
  Object.assign(canvas.style, {
    position: "fixed",
    inset: "0",
    width: "100%",
    height: "100%",
    zIndex: "0",
    pointerEvents: "none",
  });
  var ctx = canvas.getContext("2d");
  if (!ctx) return;

  var W = 0, H = 0, dpr = 1, scale = 1, offX = 0, offY = 0, active = false;
  var mouseX = 0, mouseY = 0, parX = 0, parY = 0;

  function rand(min, max) { return min + Math.random() * (max - min); }
  // Painting coordinates (0..1) to screen pixels, matching background-size: cover.
  function px(nx) { return offX + nx * ART_W * scale; }
  function py(ny) { return offY + ny * ART_H * scale; }

  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    scale = Math.max(W / ART_W, H / ART_H);
    offX = (W - ART_W * scale) / 2;
    offY = (H - ART_H * scale) / 2;
    var shouldRun = W >= MIN_WIDTH;
    if (shouldRun !== active) {
      active = shouldRun;
      canvas.style.display = active ? "block" : "none";
      if (active) start();
    }
  }

  /* ---------- Particles ---------- */

  // Embers: rise from the burning ruins, curl, flicker and cool down.
  function ember(initial) {
    return {
      x: rand(0.0, 0.24), y: initial ? rand(0.35, 0.92) : rand(0.62, 0.92),
      vy: rand(0.018, 0.045), swayA: rand(0.004, 0.012), swayF: rand(0.8, 2.2), phase: rand(0, 6.28),
      life: initial ? rand(0, 1) : 0, span: rand(3.5, 7), size: rand(1.1, 2.6), depth: rand(0.4, 1),
      hot: Math.random() < 0.3,
    };
  }
  // Leaves: fall from the branches top right (and some top left), tumbling in 3D.
  var LEAF_COLORS = ["#c9772b", "#b4532a", "#d9a441", "#8f9a3a", "#a8462a", "#e0b552"];
  function leaf(initial) {
    var fromRight = Math.random() < 0.72;
    return {
      x: fromRight ? rand(0.68, 1.02) : rand(0.0, 0.3), y: initial ? rand(-0.05, 1) : rand(-0.12, 0.08),
      vx: fromRight ? rand(-0.035, -0.012) : rand(0.004, 0.02), vy: rand(0.025, 0.05),
      rot: rand(0, 6.28), spin: rand(-1.6, 1.6), flip: rand(0, 6.28), flipF: rand(1.2, 3),
      swayA: rand(0.01, 0.03), swayF: rand(0.5, 1.2), phase: rand(0, 6.28),
      size: rand(7, 13), depth: rand(0.5, 1.15), color: LEAF_COLORS[(Math.random() * LEAF_COLORS.length) | 0],
    };
  }
  // Wisps: the World Tree's life force, golden motes rising slowly along the trunk.
  function wisp(initial) {
    return {
      x: rand(0.43, 0.57), y: initial ? rand(0.18, 0.62) : rand(0.5, 0.62),
      vy: rand(0.006, 0.014), swayA: rand(0.01, 0.025), swayF: rand(0.25, 0.6), phase: rand(0, 6.28),
      life: initial ? rand(0, 1) : 0, span: rand(9, 16), size: rand(1.4, 3), depth: rand(0.6, 1),
    };
  }
  // Spray: fine droplets thrown up where the waterfalls hit the pool.
  function spray(initial) {
    return {
      x: rand(0.84, 0.99), y: rand(0.8, 0.9), vx: rand(-0.014, 0.004), vy: rand(-0.03, -0.014),
      life: initial ? rand(0, 1) : 0, span: rand(2.5, 4.5), size: rand(14, 26),
    };
  }
  // Glints: sunlight catching the river.
  function glint() {
    return { x: rand(0.5, 0.66), y: rand(0.635, 0.7), life: 0, span: rand(0.8, 1.8), size: rand(2, 5), wait: rand(0, 4) };
  }
  // Mist banks drifting through the valley.
  function mistBank(i) {
    return { x: rand(0.1, 0.9), y: 0.56 + i * 0.06 + rand(-0.02, 0.02), rx: rand(0.18, 0.3), ry: rand(0.035, 0.06), v: rand(0.004, 0.009) * (i % 2 ? -1 : 1), a: rand(0.1, 0.18) };
  }

  var embers = [], leaves = [], wisps = [], sprays = [], glints = [], mists = [];
  function populate() {
    var i;
    embers = []; leaves = []; wisps = []; sprays = []; glints = []; mists = [];
    for (i = 0; i < 60; i++) embers.push(ember(true));
    for (i = 0; i < 16; i++) leaves.push(leaf(true));
    for (i = 0; i < 26; i++) wisps.push(wisp(true));
    for (i = 0; i < 22; i++) sprays.push(spray(true));
    for (i = 0; i < 7; i++) glints.push(glint());
    for (i = 0; i < 4; i++) mists.push(mistBank(i));
  }

  /* ---------- Drawing ---------- */

  function softDot(x, y, r, inner, outer, alpha) {
    var g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, inner);
    g.addColorStop(0.35, outer);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.globalAlpha = alpha;
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  function drawLight(t) {
    // Breathing halo behind the canopy and slow god rays fanning down from it.
    var cx = px(0.485), cy = py(0.24), s = scale;
    var breathe = 0.5 + 0.5 * Math.sin(t * 0.35);
    ctx.globalCompositeOperation = "lighter";
    softDot(cx, cy, 260 * s, "rgba(255,236,190,0.55)", "rgba(255,214,140,0.16)", 0.32 + 0.14 * breathe);
    for (var i = 0; i < 6; i++) {
      var base = -0.62 + i * 0.25 + Math.sin(t * 0.09 + i * 1.7) * 0.05;
      var spread = 0.055 + 0.02 * Math.sin(t * 0.13 + i);
      var len = (520 + i * 40) * s;
      var a = 0.09 + 0.07 * (0.5 + 0.5 * Math.sin(t * 0.21 + i * 2.1));
      var g = ctx.createLinearGradient(cx, cy, cx + Math.sin(base) * len, cy + Math.cos(base) * len);
      g.addColorStop(0, "rgba(255,232,180," + a + ")");
      g.addColorStop(1, "rgba(255,232,180,0)");
      ctx.globalAlpha = 1;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.sin(base - spread) * len, cy + Math.cos(base - spread) * len);
      ctx.lineTo(cx + Math.sin(base + spread) * len, cy + Math.cos(base + spread) * len);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawMist(dt) {
    ctx.globalCompositeOperation = "source-over";
    for (var i = 0; i < mists.length; i++) {
      var m = mists[i];
      m.x += m.v * dt;
      if (m.x > 1.25) m.x = -0.25;
      if (m.x < -0.25) m.x = 1.25;
      var x = px(m.x) + parX * 6, y = py(m.y) + parY * 4, rx = m.rx * ART_W * scale, ry = m.ry * ART_H * scale * 2.2;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(1, ry / rx);
      var g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
      g.addColorStop(0, "rgba(246,238,222," + m.a + ")");
      g.addColorStop(1, "rgba(246,238,222,0)");
      ctx.globalAlpha = 1;
      ctx.fillStyle = g;
      ctx.fillRect(-rx, -rx, rx * 2, rx * 2);
      ctx.restore();
    }
  }

  function drawWisps(t, dt) {
    ctx.globalCompositeOperation = "lighter";
    for (var i = 0; i < wisps.length; i++) {
      var w = wisps[i];
      w.life += dt / w.span;
      w.y -= w.vy * dt;
      if (w.life >= 1 || w.y < 0.08) { wisps[i] = wisp(false); continue; }
      var fade = Math.sin(Math.PI * w.life);
      var x = px(w.x + Math.sin(t * w.swayF + w.phase) * w.swayA) + parX * 10 * w.depth;
      var y = py(w.y) + parY * 6 * w.depth;
      var r = w.size * 5 * scale * 1.6;
      softDot(x, y, r, "rgba(255,250,215,0.95)", "rgba(240,210,120,0.35)", 0.75 * fade);
    }
  }

  function drawEmbers(t, dt) {
    ctx.globalCompositeOperation = "lighter";
    for (var i = 0; i < embers.length; i++) {
      var e = embers[i];
      e.life += dt / e.span;
      e.y -= e.vy * dt * (1 + e.life);
      if (e.life >= 1 || e.y < 0.05) { embers[i] = ember(false); continue; }
      var flicker = 0.65 + 0.35 * Math.sin(t * 14 + e.phase * 5);
      var heat = 1 - e.life;
      var x = px(e.x + Math.sin(t * e.swayF + e.phase) * e.swayA * (1 + e.life * 2)) + parX * 14 * e.depth;
      var y = py(e.y) + parY * 8 * e.depth;
      var k = Math.max(scale, 0.8);
      var alpha = Math.min(1, heat * 1.5) * flicker * e.depth;
      softDot(x, y, e.size * 7 * k, "rgba(255,170,60,0.9)", "rgba(255,90,20,0.35)", alpha * 0.8);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = alpha;
      ctx.fillStyle = e.hot ? "#fff1b8" : "rgb(255," + Math.round(120 + heat * 90) + ",40)";
      ctx.beginPath();
      ctx.arc(x, y, e.size * 1.1 * k, 0, 6.283);
      ctx.fill();
      ctx.globalCompositeOperation = "lighter";
    }
  }

  function drawSpray(dt) {
    ctx.globalCompositeOperation = "lighter";
    for (var i = 0; i < sprays.length; i++) {
      var s = sprays[i];
      s.life += dt / s.span;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy *= 1 - 0.3 * dt;
      if (s.life >= 1) { sprays[i] = spray(false); continue; }
      var x = px(s.x) + parX * 12, y = py(s.y) + parY * 7;
      var grow = 0.6 + s.life * 0.9;
      ctx.globalCompositeOperation = "source-over";
      softDot(x, y, s.size * grow * Math.max(scale, 0.7), "rgba(255,255,255,0.7)", "rgba(235,246,250,0.35)", 0.45 * Math.sin(Math.PI * s.life));
    }
  }

  function drawGlints(dt) {
    ctx.globalCompositeOperation = "lighter";
    for (var i = 0; i < glints.length; i++) {
      var g = glints[i];
      if (g.wait > 0) { g.wait -= dt; continue; }
      g.life += dt / g.span;
      if (g.life >= 1) { glints[i] = glint(); continue; }
      var a = Math.sin(Math.PI * g.life);
      var x = px(g.x) + parX * 5, y = py(g.y) + parY * 3, r = g.size * scale * 1.4;
      ctx.globalAlpha = 0.55 * a;
      ctx.strokeStyle = "rgba(255,250,230,1)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x - r * 2.2, y); ctx.lineTo(x + r * 2.2, y);
      ctx.moveTo(x, y - r); ctx.lineTo(x, y + r);
      ctx.stroke();
      softDot(x, y, r * 2.4, "rgba(255,255,240,0.9)", "rgba(255,240,200,0.25)", 0.5 * a);
    }
  }

  function drawLeaves(t, dt) {
    ctx.globalCompositeOperation = "source-over";
    for (var i = 0; i < leaves.length; i++) {
      var l = leaves[i];
      l.x += (l.vx + Math.sin(t * l.swayF + l.phase) * l.swayA) * dt * l.depth;
      l.y += l.vy * dt * l.depth;
      l.rot += l.spin * dt;
      l.flip += l.flipF * dt;
      if (l.y > 1.08 || l.x < -0.08 || l.x > 1.08) { leaves[i] = leaf(false); continue; }
      var x = px(l.x) + parX * 22 * l.depth, y = py(l.y) + parY * 14 * l.depth;
      var size = l.size * Math.max(scale, 0.75) * l.depth;
      var turn = Math.cos(l.flip);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(l.rot);
      ctx.scale(Math.max(0.12, Math.abs(turn)), 1);
      ctx.globalAlpha = 0.9 * Math.min(1, l.depth + 0.15);
      ctx.fillStyle = l.color;
      ctx.beginPath();
      ctx.moveTo(0, -size);
      ctx.quadraticCurveTo(size * 0.75, -size * 0.2, 0, size);
      ctx.quadraticCurveTo(-size * 0.75, -size * 0.2, 0, -size);
      ctx.fill();
      // Midrib, darker on the back side of the leaf.
      ctx.globalAlpha *= turn < 0 ? 0.5 : 0.35;
      ctx.strokeStyle = "#3a1d0b";
      ctx.lineWidth = Math.max(0.6, size * 0.08);
      ctx.beginPath();
      ctx.moveTo(0, -size * 0.85);
      ctx.lineTo(0, size * 1.15);
      ctx.stroke();
      ctx.restore();
    }
  }

  /* ---------- Loop ---------- */

  var last = 0, raf = 0, running = false;
  function frame(now) {
    raf = 0;
    if (!active || document.hidden) { running = false; return; }
    var t = now / 1000;
    var dt = Math.min(0.05, last ? t - last : 0.016);
    last = t;
    parX += (mouseX - parX) * Math.min(1, dt * 2);
    parY += (mouseY - parY) * Math.min(1, dt * 2);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, W, H);
    drawLight(t);
    drawMist(dt);
    drawGlints(dt);
    drawWisps(t, dt);
    drawSpray(dt);
    drawEmbers(t, dt);
    drawLeaves(t, dt);
    raf = requestAnimationFrame(frame);
  }
  function start() {
    if (running || !active || document.hidden) return;
    running = true;
    last = 0;
    raf = requestAnimationFrame(frame);
  }

  function mount() {
    document.body.insertBefore(canvas, document.body.firstChild);
    populate();
    resize();
    start();
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", start);
    window.addEventListener("pointermove", function (event) {
      mouseX = (event.clientX / W - 0.5) * -2;
      mouseY = (event.clientY / H - 0.5) * -2;
    }, { passive: true });
    if (reduceMotion && reduceMotion.addEventListener) {
      reduceMotion.addEventListener("change", function () { if (reduceMotion.matches) { active = false; canvas.remove(); } });
    }
  }

  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);
})();
