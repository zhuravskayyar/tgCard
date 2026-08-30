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

export function NicknameSkinPreview({ className, compact = false, nickname, skinId }: NicknameSkinPreviewProps) {
  const definition = skinId ? NICKNAME_SKINS[skinId] : null;
  const particleCount = definition?.effect === "celestial" ? 17 : 14;
  const particles = useMemo(
    () => definition && definition.effect !== "glitch"
      ? Array.from({ length: compact ? Math.max(8, Math.floor(particleCount / 2)) : particleCount }, (_, index) => index)
      : [],
    [compact, definition, particleCount],
  );

  return (
    <span className={`nickname-skin ${definition?.className ?? "nickname-skin--standard"}${compact ? " nickname-skin--compact" : ""}${className ? ` ${className}` : ""}`}>
      {definition?.effect !== "glitch" ? (
        <span className="particles" aria-hidden="true">
          {particles.map((index) => (
            <i className={definition?.effect === "celestial" && index % 4 === 0 ? "particle star" : "particle"} key={index} style={particleStyle(index)} />
          ))}
        </span>
      ) : null}
      {definition?.effect === "blood" ? <span className="blood-ring" aria-hidden="true" /> : null}
      <span className="nickname" data-text={nickname}>{nickname}</span>
    </span>
  );
}
