import { SOUND_CUES, UI_SOUND_CUES, soundCueUrl, type SoundCue } from "./cues";

const ENABLED_KEY = "cardastika:sound-effects";
const MASTER_GAIN = 0.8;
// The same cue retriggered faster than this is one sound to the ear; skip it instead of stacking.
const REPEAT_GUARD_MS = 70;
const MAX_VOICES = 4;

type Listener = () => void;

let context: AudioContext | null = null;
let master: GainNode | null = null;
const buffers = new Map<SoundCue, Promise<AudioBuffer | null>>();
const lastPlayed = new Map<SoundCue, number>();
const voices = new Set<AudioBufferSourceNode>();
const listeners = new Set<Listener>();

function readEnabled() {
  try { return window.localStorage.getItem(ENABLED_KEY) !== "off"; } catch { return true; }
}

let enabled = typeof window === "undefined" ? false : readEnabled();

export function isSoundEnabled() { return enabled; }

export function subscribeSoundSetting(listener: Listener) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function setSoundEnabled(next: boolean) {
  enabled = next;
  try { window.localStorage.setItem(ENABLED_KEY, next ? "on" : "off"); } catch { /* private mode: keep the in-memory choice */ }
  if (!next) stopAll();
  listeners.forEach((listener) => listener());
}

function audioContext() {
  if (context) return context;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  context = new Ctor({ latencyHint: "interactive" });
  master = context.createGain();
  master.gain.value = MASTER_GAIN;
  master.connect(context.destination);
  return context;
}

function load(cue: SoundCue) {
  const cached = buffers.get(cue);
  if (cached) return cached;
  const ctx = audioContext();
  if (!ctx) return Promise.resolve(null);
  const request = fetch(soundCueUrl(cue))
    .then((response) => response.ok ? response.arrayBuffer() : Promise.reject(new Error(String(response.status))))
    .then((data) => ctx.decodeAudioData(data))
    .catch(() => { buffers.delete(cue); return null; });
  buffers.set(cue, request);
  return request;
}

/** Warm the cache for a screen (battle, shop) so the first strike is not late. */
export function preloadSounds(cues: readonly SoundCue[]) {
  if (!enabled || !context) return;
  cues.forEach((cue) => void load(cue));
}

function stopAll() {
  voices.forEach((voice) => { try { voice.stop(); } catch { /* already ended */ } });
  voices.clear();
}

/**
 * Fire-and-forget: never throws, never queues. A cue that is not decoded yet plays only if it
 * arrives quickly, so a slow network never produces a late, out-of-sync sound.
 */
export function playSound(cue: SoundCue, { gain = 1 }: { gain?: number } = {}) {
  if (!enabled || document.hidden) return;
  const ctx = audioContext();
  if (!ctx || !master) return;
  const now = performance.now();
  if (now - (lastPlayed.get(cue) ?? -Infinity) < REPEAT_GUARD_MS) return;
  lastPlayed.set(cue, now);
  if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);
  void load(cue).then((buffer) => {
    if (!buffer || !enabled || document.hidden || !master || performance.now() - now > 250) return;
    if (voices.size >= MAX_VOICES) return;
    const { gain: cueGain, vary } = SOUND_CUES[cue];
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = 1 + (Math.random() * 2 - 1) * vary;
    const level = ctx.createGain();
    level.gain.value = cueGain * gain;
    source.connect(level).connect(master);
    voices.add(source);
    source.onended = () => { voices.delete(source); level.disconnect(); };
    source.start();
  });
}

const SOUND_ATTRIBUTE = "data-sound";

/**
 * One shared tap sound for every button. A button (or an ancestor) may name its own cue with
 * data-sound="ui-back", or data-sound="none" when the action plays a specific sound itself,
 * so a single tap never triggers two sounds.
 */
function handleClick(event: MouseEvent) {
  const target = event.target instanceof Element ? event.target.closest("button, [role='button'], a[href]") : null;
  if (!target || target.matches(":disabled, [aria-disabled='true']")) return;
  const named = target.closest(`[${SOUND_ATTRIBUTE}]`)?.getAttribute(SOUND_ATTRIBUTE);
  if (named === "none") return;
  playSound(named && named in SOUND_CUES ? named as SoundCue : "ui-tap");
}

// Browsers (and the Telegram WebView) only allow audio after a user gesture.
function unlock() {
  const ctx = audioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);
  if (enabled) UI_SOUND_CUES.forEach((cue) => void load(cue));
}

function handleVisibility() {
  if (!context) return;
  if (document.hidden) {
    stopAll();
    void context.suspend().catch(() => undefined);
  } else void context.resume().catch(() => undefined);
}

let installed = false;

export function installSoundEffects() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("pointerdown", unlock, { capture: true, passive: true });
  document.addEventListener("click", handleClick);
  document.addEventListener("visibilitychange", handleVisibility);
}
