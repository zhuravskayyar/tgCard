import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { DuelSearchResponse } from "@cardastika/shared";
import { BattleSwordIcon } from "../components/BattleSwordIcon";

export type DuelSearchExperiencePhase = "loading" | "searching" | "preview" | "no-opponent" | "error" | "cancelled";

// Optional artwork slots from duel-search.html. The SVG versions below remain
// active until a corresponding PNG is added here.
const DUEL_SEARCH_SPRITES = {
  dialOuter: null as string | null,
  dialMid: null as string | null,
  dialInner: null as string | null,
  cardSun: null as string | null,
  cardMoon: null as string | null,
  sword: null as string | null,
  spark: null as string | null,
  impact: null as string | null,
  impactFrames: 8,
  medalFrame: null as string | null,
  seal: null as string | null,
  panelBg: null as string | null,
};

const SEARCH_HINTS = [
  "Підбираємо гідного суперника",
  "Зважуємо силу колод",
  "Читаємо руни на циферблаті",
  "Розширюємо коло пошуку",
];

function formatSearchTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return String(minutes).padStart(2, "0") + ":" + String(seconds % 60).padStart(2, "0");
}

function strengthCategory(powerDifferencePct: number) {
  if (powerDifferencePct <= -20) return { label: "СУПЕРНИК ЗНАЧНО СЛАБШИЙ", tone: "weaker" };
  if (powerDifferencePct < -8) return { label: "СУПЕРНИК СЛАБШИЙ", tone: "weaker" };
  if (powerDifferencePct <= 8) return { label: "ГІДНИЙ СУПЕРНИК", tone: "worthy" };
  if (powerDifferencePct < 20) return { label: "СУПЕРНИК СИЛЬНІШИЙ", tone: "stronger" };
  return { label: "НЕБЕЗПЕЧНИЙ СУПЕРНИК", tone: "stronger" };
}

function estimatePlayerPower(opponentPower: number, powerDifferencePct: number) {
  const ratio = 1 + powerDifferencePct / 100;
  return ratio > 0 ? Math.max(0, Math.round(opponentPower / ratio)) : opponentPower;
}

function DuelOpponentPortrait({ name, photoUrl }: { name: string; photoUrl: string | null }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [photoUrl]);
  if (photoUrl && !failed) {
    return <img alt="" onError={() => setFailed(true)} src={photoUrl} />;
  }
  return <span>{name.slice(0, 2).toUpperCase()}</span>;
}

function DuelSearchParticles({ searching, burstKey }: { searching: boolean; burstKey: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const searchingRef = useRef(searching);
  const particlesRef = useRef<Array<{ x: number; y: number; vx: number; vy: number; life: number; decay: number; radius: number; pull: boolean }>>([]);
  const sparkRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    searchingRef.current = searching;
  }, [searching]);

  useEffect(() => {
    if (!DUEL_SEARCH_SPRITES.spark) return;
    const spark = new Image();
    spark.onload = () => { sparkRef.current = spark; };
    spark.src = DUEL_SEARCH_SPRITES.spark;
    return () => { sparkRef.current = null; };
  }, []);

  useEffect(() => {
    if (burstKey === 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const canvas = canvasRef.current;
    const rect = canvas?.getBoundingClientRect();
    if (!rect) return;
    const particles = particlesRef.current;
    for (let index = 0; index < 64; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 5;
      particles.push({
        x: rect.width / 2,
        y: rect.height / 2,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        decay: 0.018 + Math.random() * 0.025,
        radius: 1 + Math.random() * 2.5,
        pull: false,
      });
    }
  }, [burstKey]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context || !searching || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let width = 0;
    let height = 0;
    let frame = 0;
    const particles = particlesRef.current;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const spawnOrbit = () => {
      const angle = Math.random() * Math.PI * 2;
      const radius = width * 0.36;
      particles.push({
        x: width / 2 + Math.cos(angle) * radius,
        y: height / 2 + Math.sin(angle) * radius,
        vx: -Math.sin(angle) * 1.1,
        vy: Math.cos(angle) * 1.1,
        life: 1,
        decay: 0.012 + Math.random() * 0.015,
        radius: 0.8 + Math.random() * 1.8,
        pull: true,
      });
      if (Math.random() < 0.5) {
        particles.push({
          x: width / 2 + (Math.random() - 0.5) * width * 0.5,
          y: height * 0.72,
          vx: (Math.random() - 0.5) * 0.4,
          vy: -0.4 - Math.random() * 0.8,
          life: 1,
          decay: 0.008,
          radius: 0.6 + Math.random() * 1.4,
          pull: false,
        });
      }
    };
    const draw = () => {
      context.clearRect(0, 0, width, height);
      if (searchingRef.current && Math.random() < 0.28 && particles.length < 160) spawnOrbit();
      context.globalCompositeOperation = "lighter";
      for (let index = particles.length - 1; index >= 0; index -= 1) {
        const particle = particles[index]!;
        if (particle.pull) {
          particle.vx += (width / 2 - particle.x) * 0.0009;
          particle.vy += (height / 2 - particle.y) * 0.0009;
        }
        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.vx *= 0.985;
        particle.vy *= 0.985;
        particle.life -= particle.decay;
        if (particle.life <= 0) {
          particles.splice(index, 1);
          continue;
        }
        const radius = particle.radius * (1 + (1 - particle.life));
        const spark = sparkRef.current;
        if (spark) {
          const size = radius * 8;
          context.globalAlpha = particle.life;
          context.drawImage(spark, particle.x - size / 2, particle.y - size / 2, size, size);
          continue;
        }
        const glow = context.createRadialGradient(particle.x, particle.y, 0, particle.x, particle.y, radius * 4);
        glow.addColorStop(0, "rgba(255,240,200," + particle.life + ")");
        glow.addColorStop(0.35, "rgba(255,165,60," + particle.life * 0.7 + ")");
        glow.addColorStop(1, "rgba(255,120,30,0)");
        context.globalAlpha = 1;
        context.fillStyle = glow;
        context.beginPath();
        context.arc(particle.x, particle.y, radius * 4, 0, Math.PI * 2);
        context.fill();
      }
      context.globalAlpha = 1;
      context.globalCompositeOperation = "source-over";
      frame = window.requestAnimationFrame(draw);
    };

    frame = window.requestAnimationFrame(draw);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      particles.length = 0;
    };
  }, [searching]);

  return <canvas aria-hidden="true" className="duel-search-particles" ref={canvasRef} />;
}

function DuelSearchSword({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 200 200">
      <g transform="rotate(45 100 100)">
        {DUEL_SEARCH_SPRITES.sword
          ? <image href={DUEL_SEARCH_SPRITES.sword} x="75" y="22" width="50" height="180" preserveAspectRatio="xMidYMid meet" />
          : <use href="#duel-search-sword" x="0" y="22" />}
      </g>
      <g transform="rotate(-45 100 100)">
        {DUEL_SEARCH_SPRITES.sword
          ? <image href={DUEL_SEARCH_SPRITES.sword} x="75" y="22" width="50" height="180" preserveAspectRatio="xMidYMid meet" />
          : <use href="#duel-search-sword" x="0" y="22" />}
      </g>
      <circle cx="100" cy="100" r="28" fill="url(#duel-search-glow)" />
      <path d="M100 82 L103 97 L118 100 L103 103 L100 118 L97 103 L82 100 L97 97 Z" fill="#fff6dc" />
    </svg>
  );
}

function DuelSearchCard({ moon }: { moon: boolean }) {
  const sprite = moon ? DUEL_SEARCH_SPRITES.cardMoon : DUEL_SEARCH_SPRITES.cardSun;
  return (
    <div className={"duel-search-card" + (moon ? " duel-search-card--moon" : " duel-search-card--sun")}>
      <div className="duel-search-card__float">
        {sprite ? <img alt="" draggable="false" src={sprite} /> : (
          <svg aria-hidden="true" viewBox="0 0 100 140">
            <defs>
              <linearGradient id={moon ? "duel-card-moon-bg" : "duel-card-sun-bg"} x1="0" x2="1" y1="0" y2="1">
                <stop offset="0" stopColor="#3b2716" />
                <stop offset="1" stopColor="#140c06" />
              </linearGradient>
            </defs>
            <rect x="1" y="1" width="98" height="138" rx="7" fill={"url(#" + (moon ? "duel-card-moon-bg" : "duel-card-sun-bg") + ")"} stroke="#b3864a" strokeWidth="2" />
            <rect x="7" y="7" width="86" height="126" rx="4" fill="none" stroke="#8a6230" />
            <path d="M7 20 Q14 14 20 7 M93 20 Q86 14 80 7 M7 120 Q14 126 20 133 M93 120 Q86 126 80 133" fill="none" stroke="#c89a55" />
            {moon ? (
              <g transform="translate(50 70)">
                <circle r="27" fill="none" stroke="#c89a55" strokeDasharray="1 4" />
                <circle r="22" fill="none" stroke="#e2b569" strokeWidth="1.4" />
                <path d="M6 -17 A18 18 0 1 0 6 17 A13 13 0 1 1 6 -17 Z" fill="#e2b569" />
                <circle cx="11" cy="-6" r="1.5" fill="#f3d08a" />
                <circle cx="14" cy="5" r="1" fill="#f3d08a" />
              </g>
            ) : (
              <g className="duel-search-sun" transform="translate(50 70)" fill="none" stroke="#e2b569">
                <circle r="15" strokeWidth="1.6" />
                <circle r="10" strokeWidth=".8" />
                {Array.from({ length: 16 }, (_, index) => (
                  <path d="M0 -18 L0 -32 L0 -18" key={index} transform={"rotate(" + index * 22.5 + ")"} strokeWidth="1.6" />
                ))}
              </g>
            )}
          </svg>
        )}
      </div>
    </div>
  );
}

function DuelSearchArena({ searching, locking, clashing, burstKey }: { searching: boolean; locking: boolean; clashing: boolean; burstKey: number }) {
  const ticks = Array.from({ length: 72 }, (_, index) => (
    <line
      key={index}
      stroke="#8a5a26"
      strokeWidth={index % 6 === 0 ? 2 : 1}
      transform={"rotate(" + index * 5 + " 150 150)"}
      x1="150"
      x2="150"
      y1="16"
      y2={index % 6 === 0 ? "28" : "23"}
    />
  ));
  return (
    <>
      <svg aria-hidden="true" className="duel-search-defs">
        <defs>
          <linearGradient id="duel-search-blade" x1="0" x2="1">
            <stop offset="0" stopColor="#8d8a85" />
            <stop offset=".45" stopColor="#f4f1ea" />
            <stop offset=".55" stopColor="#b9b4ab" />
            <stop offset="1" stopColor="#5d5852" />
          </linearGradient>
          <linearGradient id="duel-search-brass" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#f3d08a" />
            <stop offset=".5" stopColor="#a26b28" />
            <stop offset="1" stopColor="#4a2a0c" />
          </linearGradient>
          <radialGradient id="duel-search-glow">
            <stop offset="0" stopColor="#fff2c8" />
            <stop offset=".4" stopColor="#ffb24a" stopOpacity=".8" />
            <stop offset="1" stopColor="#ff8a20" stopOpacity="0" />
          </radialGradient>
          <path id="duel-search-rune-path" d="M150 150 m-122 0 a122 122 0 1 1 244 0 a122 122 0 1 1 -244 0" />
          <symbol id="duel-search-sword" viewBox="0 0 200 200">
            <path d="M100 6 L108 20 L107 138 L93 138 L92 20 Z" fill="url(#duel-search-blade)" stroke="#3a2a1a" />
            <path d="M100 14 L100 136" stroke="#fff" strokeOpacity=".55" />
            <path d="M70 138 Q100 130 130 138 L134 146 Q100 140 66 146 Z" fill="url(#duel-search-brass)" stroke="#2a1606" />
            <circle cx="66" cy="143" r="4" fill="url(#duel-search-brass)" />
            <circle cx="134" cy="143" r="4" fill="url(#duel-search-brass)" />
            <rect x="95" y="146" width="10" height="30" rx="2" fill="#4a2414" stroke="#1c0d06" />
            <path d="M95 152h10M95 158h10M95 164h10M95 170h10" stroke="#2a1208" strokeWidth="1.5" />
            <circle cx="100" cy="181" r="7" fill="url(#duel-search-brass)" stroke="#2a1606" />
          </symbol>
        </defs>
      </svg>
      <div className={"duel-search-arena" + (locking ? " is-locking" : "") + (clashing ? " is-clashing" : "") + (!searching && !locking ? " is-found" : "")}>
        <div className="duel-search-dial">
          <svg aria-hidden="true" viewBox="0 0 300 300">
            <defs>
              <radialGradient id="duel-search-sweep" cx="50%" cy="50%" r="50%">
                <stop offset="0" stopColor="#ffcf7a" stopOpacity="0" />
                <stop offset="1" stopColor="#ffb24a" stopOpacity=".55" />
              </radialGradient>
            </defs>
            <circle cx="150" cy="150" r="140" fill="rgba(255,236,190,.25)" stroke="#8a5a26" strokeWidth="1.2" />
            <g className="duel-search-ring duel-search-ring--outer">
              {DUEL_SEARCH_SPRITES.dialOuter ? <image href={DUEL_SEARCH_SPRITES.dialOuter} height="300" width="300" /> : (
                <>
                  <circle cx="150" cy="150" r="134" fill="none" stroke="#8a5a26" strokeWidth="2.5" />
                  <circle cx="150" cy="150" r="110" fill="none" stroke="#8a5a26" />
                  {ticks}
                  <text fill="#6b3f14" fontFamily="serif" fontSize="17" fontWeight="700" letterSpacing="9">
                    <textPath href="#duel-search-rune-path">ᚠ ᚢ ᚦ ᚨ ᚱ ᚲ ᚷ ᚹ ᚺ ᚾ ᛁ ᛃ ᛇ ᛈ ᛉ ᛊ ᛏ ᛒ ᛖ ᛗ ᛚ ᛜ ᛞ ᛟ</textPath>
                  </text>
                </>
              )}
            </g>
            <g className="duel-search-ring duel-search-ring--mid">
              {DUEL_SEARCH_SPRITES.dialMid ? <image href={DUEL_SEARCH_SPRITES.dialMid} height="300" width="300" /> : (
                <>
                  <circle cx="150" cy="150" r="86" fill="none" stroke="#9a6a2f" strokeDasharray="2 6" strokeWidth="1.5" />
                  <circle cx="150" cy="150" r="78" fill="none" stroke="#9a6a2f" />
                  <path d="M150 58 l5 12 h-10z M150 242 l5 -12 h-10z M58 150 l12 5 v-10z M242 150 l-12 5 v-10z" fill="#9a6a2f" />
                </>
              )}
            </g>
            <g className="duel-search-ring duel-search-ring--inner">
              {DUEL_SEARCH_SPRITES.dialInner ? <image href={DUEL_SEARCH_SPRITES.dialInner} height="300" width="300" /> : (
                <>
                  <circle cx="150" cy="150" r="54" fill="none" stroke="#c48a3c" strokeDasharray="14 8" strokeWidth="1.2" />
                  <path d="M150 100 L158 142 L200 150 L158 158 L150 200 L142 158 L100 150 L142 142 Z" fill="none" stroke="#b07a30" strokeWidth="1.4" />
                </>
              )}
            </g>
            <g className="duel-search-sweep">
              <path d="M150 150 L150 40 A110 110 0 0 1 228 72 Z" fill="url(#duel-search-sweep)" />
              <line x1="150" y1="150" x2="150" y2="40" stroke="#ffd58a" strokeWidth="1.5" />
              <circle cx="150" cy="40" r="3.5" fill="#fff0c0" />
            </g>
          </svg>
        </div>
        <div aria-hidden="true" className="duel-search-halo" />
        <DuelSearchCard moon={false} />
        <DuelSearchCard moon />
        <div className="duel-search-crossed-swords"><DuelSearchSword /></div>
        <DuelSearchParticles burstKey={burstKey} searching={searching} />
        <div className={"duel-search-flash" + (burstKey > 0 ? " is-active" : "")} key={"flash-" + burstKey} />
      {DUEL_SEARCH_SPRITES.impact ? (
        <div
          className={"duel-search-impact" + (burstKey > 0 ? " is-active" : "")}
          key={"impact-" + burstKey}
          style={{
            backgroundImage: "url(" + DUEL_SEARCH_SPRITES.impact + ")",
            ["--frames" as string]: String(DUEL_SEARCH_SPRITES.impactFrames),
          } as CSSProperties}
        />
      ) : null}
        <div className={"duel-search-shock" + (burstKey > 0 ? " is-active" : "")} key={"shock-" + burstKey} />
      </div>
    </>
  );
}

function DuelSearchExperience({
  phase,
  search,
  message,
  onAttack,
  onSearchAgain,
  onCancel,
}: {
  phase: DuelSearchExperiencePhase;
  search?: DuelSearchResponse;
  message?: string;
  onAttack: (searchId: string) => void;
  onSearchAgain: () => void;
  onCancel: () => void;
}) {
  const opponent = search?.opponent;
  const category = opponent ? strengthCategory(opponent.powerDifferencePct) : null;
  const playerPower = opponent ? estimatePlayerPower(opponent.effectiveDeckPower, opponent.powerDifferencePct) : 0;
  const [seconds, setSeconds] = useState(0);
  const [hintIndex, setHintIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [locking, setLocking] = useState(false);
  const [clashing, setClashing] = useState(false);
  const [typedName, setTypedName] = useState("");
  const [visiblePlayerPower, setVisiblePlayerPower] = useState(0);
  const [visibleOpponentPower, setVisibleOpponentPower] = useState(0);
  const [burstKey, setBurstKey] = useState(0);
  const prefersReducedMotion = useRef(false);
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    prefersReducedMotion.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  useEffect(() => {
    if (!revealed || !opponent) {
      setTypedName("");
      setVisiblePlayerPower(0);
      setVisibleOpponentPower(0);
      return;
    }
    if (prefersReducedMotion.current) {
      setTypedName(opponent.name);
      setVisiblePlayerPower(playerPower);
      setVisibleOpponentPower(opponent.effectiveDeckPower);
      return;
    }
    let characterIndex = 0;
    const typeTimer = window.setInterval(() => {
      characterIndex += 1;
      setTypedName(opponent.name.slice(0, characterIndex));
      if (characterIndex >= opponent.name.length) window.clearInterval(typeTimer);
    }, 45);
    const startedAt = performance.now();
    let frame = 0;
    const count = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / 900);
      const eased = 1 - Math.pow(1 - progress, 3);
      setVisiblePlayerPower(Math.round(playerPower * eased));
      setVisibleOpponentPower(Math.round(opponent.effectiveDeckPower * eased));
      if (progress < 1) frame = window.requestAnimationFrame(count);
    };
    frame = window.requestAnimationFrame(count);
    return () => {
      window.clearInterval(typeTimer);
      window.cancelAnimationFrame(frame);
    };
  }, [opponent?.effectiveDeckPower, opponent?.name, playerPower, revealed]);

  useEffect(() => {
    if (phase !== "searching") {
      if (phase === "preview") {
        setRevealed(false);
        setLocking(true);
        setClashing(false);
        const lockTimer = window.setTimeout(() => {
          setClashing(true);
          setBurstKey((key) => key + 1);
          const panel = panelRef.current;
          if (panel && !prefersReducedMotion.current) {
            panel.animate(
              [{ transform: "translate(0, 0)" }, { transform: "translate(-4px, 2px)" }, { transform: "translate(3px, -2px)" }, { transform: "translate(-1px, 1px)" }, { transform: "none" }],
              { duration: 360 },
            );
          }
        }, prefersReducedMotion.current ? 0 : 820);
        const revealTimer = window.setTimeout(() => {
          setLocking(false);
          setClashing(false);
          setRevealed(true);
        }, prefersReducedMotion.current ? 0 : 1250);
        return () => {
          window.clearTimeout(lockTimer);
          window.clearTimeout(revealTimer);
        };
      }
      setLocking(false);
      setClashing(false);
      setRevealed(false);
      return;
    }
    setSeconds(0);
    setHintIndex(0);
    setLocking(false);
    setClashing(false);
    setRevealed(false);
    const clock = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    const hints = window.setInterval(() => setHintIndex((value) => (value + 1) % SEARCH_HINTS.length), 2600);
    return () => {
      window.clearInterval(clock);
      window.clearInterval(hints);
    };
  }, [phase]);

  const viewPhase = phase === "preview" ? "preview" : "search";
  const experienceClass = [
    "duel-search-experience",
    "duel-search-experience--" + viewPhase,
    locking ? "is-locking" : "",
    revealed ? "is-revealed" : "",
  ].filter(Boolean).join(" ");
  const spriteStyle: CSSProperties = DUEL_SEARCH_SPRITES.panelBg
    ? { backgroundImage: "linear-gradient(rgba(116, 78, 38, .14), rgba(116, 78, 38, .14)), url(" + DUEL_SEARCH_SPRITES.panelBg + ")" }
    : {};
  const displaySearch = phase === "loading" || phase === "searching" || phase === "preview";
  const errorState = phase === "error" || phase === "no-opponent" || phase === "cancelled";

  return (
    <section className={experienceClass} ref={panelRef} style={spriteStyle}>
      {displaySearch ? (
        <div aria-live="polite" className="duel-search-cell">
          <section aria-label="Пошук суперника" className="duel-search-view duel-search-view--search">
            <DuelSearchArena burstKey={burstKey} clashing={clashing} locking={locking} searching={phase === "searching" || locking} />
            <h2 className="duel-search-title">
              {phase === "loading" ? "Завантажуємо дуель…" : locking ? "Захоплюємо ціль…" : phase === "preview" ? "Суперника знайдено!" : "Пошук суперника…"}
            </h2>
            <div aria-hidden="true" className="duel-search-rule" />
            <p className={"duel-search-hint" + (locking ? " is-out" : "")}>
              {phase === "loading" ? "Перевіряємо активний бій" : locking ? "Суперника відчуто…" : SEARCH_HINTS[hintIndex]}
            </p>
            {phase === "searching" ? (
              <>
                <div className="duel-search-meta"><span>ЧАС <b>{formatSearchTime(seconds)}</b></span></div>
                <span aria-label="Пошук триває" className="duel-search-dots"><i /><i /><i /></span>
                <button className="duel-search-button duel-search-button--cancel" onClick={onCancel} type="button">СКАСУВАТИ ПОШУК</button>
              </>
            ) : null}
          </section>
          {phase === "preview" && search && opponent ? (
            <section aria-live="polite" className="duel-search-view duel-search-view--found">
              <div className="duel-search-eyebrow"><span>ЗНАЙДЕНО СУПЕРНИКА</span></div>
              <div className={"duel-search-medal" + (DUEL_SEARCH_SPRITES.medalFrame ? " has-sprite-frame" : "")}>
                <span aria-hidden="true" className="duel-search-medal__rays" />
                <span aria-hidden="true" className="duel-search-medal__runes">
                  <svg viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="48" fill="none" stroke="#8a5a26" strokeDasharray="1 2.5" strokeWidth=".6" />
                    <path d="M50 1 l3 5 h-6z M50 99 l3 -5 h-6z M1 50 l5 3 v-6z M99 50 l-5 3 v6z" fill="#8a5a26" />
                  </svg>
                </span>
                <span className="duel-search-medal__frame">
                  <span className="duel-search-medal__portrait">
                    <DuelOpponentPortrait name={opponent.name} photoUrl={opponent.photoUrl} />
                  </span>
                </span>
                {DUEL_SEARCH_SPRITES.medalFrame ? <img alt="" className="duel-search-medal__sprite-frame" src={DUEL_SEARCH_SPRITES.medalFrame} /> : null}
              </div>
              <h2 className="duel-search-opponent-name">{typedName}</h2>
              <p className="duel-search-level">◆ РІВЕНЬ {opponent.level} ◆</p>
              <p className={"duel-search-badge duel-search-badge--" + (category?.tone ?? "worthy")}>{category?.label}</p>
              <div className="duel-search-power">
                <div><strong>{visiblePlayerPower}</strong><span>ВИ</span></div>
                <span className="duel-search-power__seal">
                  {DUEL_SEARCH_SPRITES.seal ? <img alt="" src={DUEL_SEARCH_SPRITES.seal} /> : <BattleSwordIcon tone="gold" />}
                </span>
                <div><strong>{visibleOpponentPower}</strong><span>СУПЕРНИК</span></div>
              </div>
              <div className="duel-search-actions">
                <button className="duel-search-button duel-search-button--attack" disabled={!revealed} onClick={() => onAttack(search.searchId)} type="button">
                  <DuelSearchSword className="duel-search-button__swords" />
                  НАПАСТИ
                </button>
                <button className="duel-search-button duel-search-button--again" disabled={!revealed} onClick={onSearchAgain} type="button">⌕ ШУКАТИ ІНШОГО</button>
              </div>
            </section>
          ) : null}
        </div>
      ) : errorState ? (
        <div aria-live={phase === "error" ? "assertive" : "polite"} className="duel-search-message" role={phase === "error" ? "alert" : "status"}>
          <strong>
            {phase === "error" ? "Дуель недоступна" : phase === "no-opponent" ? "Суперника не знайдено" : "Пошук скасовано"}
          </strong>
          <span>{phase === "error" ? message : phase === "no-opponent" ? "Не вдалося підібрати суперника для цієї колоди." : "Суперника ще не шукали."}</span>
          <button className="duel-search-button duel-search-button--again" onClick={onSearchAgain} type="button">
            {phase === "error" ? "СПРОБУВАТИ ЩЕ" : "ПОЧАТИ ПОШУК"}
          </button>
        </div>
      ) : null}
    </section>
  );
}

export { DuelSearchExperience };
