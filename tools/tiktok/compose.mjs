// Cuts the recorded clips into the approved 25 s TikTok edit with captions and game sound effects.
// Usage: node tools/tiktok/compose.mjs <localeDir> <output.mp4>
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const [dir, output] = process.argv.slice(2);
const AUDIO = new URL("../../client/public/assets/audio/", import.meta.url);
const sfx = (name) => decodeURIComponent(new URL(`${name}.mp3`, AUDIO).pathname).replace(/^\/([A-Za-z]:)/, "$1");
const meta = (clip) => {
  const { offset, marks } = JSON.parse(readFileSync(join(dir, `${clip}.json`), "utf8"));
  // Marks are wall-clock seconds from the clip start; the video begins at its first painted frame.
  return marks.map((mark) => ({ ...mark, at: mark.at - offset }));
};
const first = (clip, kind) => meta(clip).find((mark) => mark.kind === kind).at;
const all = (clip, kind) => meta(clip).filter((mark) => mark.kind === kind).map((mark) => mark.at);

const arenaHits = all("arena", "attack");
const duelVictory = first("duel", "victory");
const packOpen = first("pack", "open");
const segments = [
  { clip: "arena", start: Math.max(0, arenaHits[0] - 0.1), duration: 2.2, caption: "hook" },
  { clip: "collections", start: first("collections", "tap") + 1.4, duration: 2.8, caption: "collections" },
  { clip: "deck", start: first("deck", "tap") + 1.8, duration: 3.0, caption: "deck" },
  { clip: "duel", start: Math.max(0, duelVictory - 2.6), duration: 5.2, caption: "duel" },
  { clip: "arena", start: Math.max(0, (arenaHits[1] ?? arenaHits[0]) - 0.2), duration: 3.0, caption: "arena" },
  { clip: "guild", start: first("guild", "tap") + 1.1, duration: 3.0, caption: "guild" },
  { clip: "pack", start: packOpen - 0.15, duration: 3.0, caption: "pack" },
  { image: "outro.png", duration: 3.0, caption: "cta" },
];

// Sound cues: each clip's own marks that fall inside its cut, plus a page turn on every scene change.
const cues = [];
let cursor = 0;
for (const segment of segments) {
  const local = (at) => cursor + at - segment.start;
  const inside = (at) => at >= segment.start - 0.05 && at < segment.start + segment.duration - 0.2;
  if (cursor > 0) cues.push({ at: cursor, sound: "nav-page", volume: 0.7 });
  if (segment.clip === "arena" || segment.clip === "duel") {
    for (const at of all(segment.clip, "attack").filter(inside)) {
      cues.push({ at: local(at) + 0.05, sound: "battle-fly", volume: 0.9 }, { at: local(at) + 0.5, sound: "hit-strong", volume: 1 });
    }
  }
  if (segment.clip === "duel" && inside(duelVictory)) cues.push({ at: local(duelVictory) + 0.3, sound: "battle-victory", volume: 0.9 });
  if (segment.clip === "pack") cues.push({ at: local(packOpen) + 0.05, sound: "pack-tear", volume: 1 }, { at: local(packOpen) + 0.75, sound: "reveal-epic", volume: 1 });
  if (segment.image) cues.push({ at: cursor + 0.3, sound: "coins-reward", volume: 0.8 });
  cursor += segment.duration;
}
const total = cursor;

const inputs = [];
const filters = [];
segments.forEach((segment, index) => {
  if (segment.image) inputs.push("-loop", "1", "-t", String(segment.duration), "-i", join(dir, segment.image));
  else inputs.push("-ss", segment.start.toFixed(3), "-t", String(segment.duration), "-i", join(dir, `${segment.clip}.mp4`));
  inputs.push("-loop", "1", "-t", String(segment.duration), "-i", join(dir, `cap-${segment.caption}.png`));
  const video = index * 2;
  const caption = video + 1;
  const frames = Math.round(segment.duration * 30);
  let base = `[${video}:v]fps=30,scale=1080:1920,setsar=1,format=yuv420p`;
  if (segment.zoom) base += `,crop=iw/${segment.zoom}:ih/${segment.zoom}:(iw-iw/${segment.zoom})/2:(ih-ih/${segment.zoom})/2,scale=1080:1920`;
  // The closing screen drifts in slowly so the call to action is not a frozen frame.
  if (segment.image) base += `,zoompan=z='1+0.04*on/${frames}':x='iw/2-iw/zoom/2':y='0':d=${frames}:s=1080x1920:fps=30`;
  filters.push(`${base},trim=duration=${segment.duration},setpts=PTS-STARTPTS[b${index}]`);
  filters.push(`[${caption}:v]format=rgba,fade=in:st=0.08:d=0.18:alpha=1,trim=duration=${segment.duration},setpts=PTS-STARTPTS[c${index}]`);
  filters.push(`[b${index}][c${index}]overlay=0:0:format=auto,format=yuv420p,setsar=1[s${index}]`);
});
filters.push(`${segments.map((_, index) => `[s${index}]`).join("")}concat=n=${segments.length}:v=1:a=0[video]`);

const audioBase = segments.length * 2;
cues.forEach((cue, index) => {
  inputs.push("-i", sfx(cue.sound));
  const delay = Math.max(0, Math.round(cue.at * 1000));
  filters.push(`[${audioBase + index}:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=${cue.volume},adelay=${delay}|${delay}[a${index}]`);
});
filters.push(`${cues.map((_, index) => `[a${index}]`).join("")}amix=inputs=${cues.length}:normalize=0:duration=longest,apad,atrim=duration=${total},loudnorm=I=-14:TP=-1.5:LRA=11[audio]`);

execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...inputs, "-filter_complex", filters.join(";"), "-map", "[video]", "-map", "[audio]",
  "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-profile:v", "high", "-pix_fmt", "yuv420p", "-r", "30",
  "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", "-t", String(total), output], { stdio: "inherit" });
console.log(`${output}: ${total.toFixed(1)} s, ${cues.length} sound cues`);
