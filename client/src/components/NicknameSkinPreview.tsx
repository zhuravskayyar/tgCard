import { useMemo, type CSSProperties } from "react";
import { NICKNAME_SKINS, type NicknameSkinId } from "@cardastika/shared";

interface NicknameSkinPreviewProps {
  className?: string;
  compact?: boolean;
  nickname: string;
  skinId?: NicknameSkinId | null;
}

interface ParticleStyle extends CSSProperties {
  "--delay": string;
  "--drift": string;
  "--duration": string;
  "--opacity": number;
  "--size": string;
  "--x": string;
  "--y": string;
}

function particleStyle(index: number): ParticleStyle {
  const wave = (seed: number) => (Math.sin(seed * 17.31) + 1) / 2;
  const random = (min: number, max: number, seed: number) => min + wave(seed) * (max - min);
  return {
    "--delay": `${-random(0, 6, index + 1).toFixed(2)}s`,
    "--drift": `${random(-22, 22, index + 5).toFixed(1)}px`,
    "--duration": `${random(2.8, 6, index + 9).toFixed(2)}s`,
    "--opacity": Number(random(0.3, 0.9, index + 13).toFixed(2)),
    "--size": `${random(1.3, 4, index + 17).toFixed(2)}px`,
    "--x": `${random(8, 92, index + 21).toFixed(1)}%`,
    "--y": `${random(50, 96, index + 25).toFixed(1)}%`,
  };
}

/** Floating motes per style: cinnabar dust, gold-leaf flakes, cold rune sparks. */
const PARTICLE_COUNT: Record<"cinnabar" | "gilded" | "runic", number> = { cinnabar: 10, gilded: 16, runic: 12 };

export function NicknameSkinPreview({ className, compact = false, nickname, skinId }: NicknameSkinPreviewProps) {
  const definition = skinId ? NICKNAME_SKINS[skinId] : null;
  const particles = useMemo(() => {
    if (!definition) return [];
    const count = PARTICLE_COUNT[definition.effect];
    return Array.from({ length: compact ? Math.max(5, Math.floor(count / 2)) : count }, (_, index) => index);
  }, [compact, definition]);

  return (
    <span className={`nickname-skin ${definition?.className ?? "nickname-skin--standard"}${compact ? " nickname-skin--compact" : ""}${className ? ` ${className}` : ""}`}>
      {particles.length ? (
        <span className="particles" aria-hidden="true">
          {particles.map((index) => (
            <i className={index % 3 === 0 ? "particle particle--flake" : "particle"} key={index} style={particleStyle(index)} />
          ))}
        </span>
      ) : null}
      <span className="nickname" data-text={nickname}>{nickname}</span>
    </span>
  );
}
