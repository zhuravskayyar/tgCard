import type { LariskaEmotion } from "@cardastika/shared";

export const LARISKA_ASSETS = {
  neutral: "/assets/mascot/lariska/neutral.png",
  happy: "/assets/mascot/lariska/happy.png",
  angry: "/assets/mascot/lariska/angry.png",
  sad: "/assets/mascot/lariska/sad.png",
  surprised: "/assets/mascot/lariska/surprised.png",
  sly: "/assets/mascot/lariska/sly.png",
} as const satisfies Record<LariskaEmotion, string>;

interface LariskaProps {
  alt?: string;
  className?: string;
  emotion: LariskaEmotion;
}

export function Lariska({ alt = "", className, emotion }: LariskaProps) {
  return (
    <span
      className={className ? `lariska-image ${className}` : "lariska-image"}
      data-emotion={emotion}
      key={emotion}
    >
      <img alt={alt} draggable="false" src={LARISKA_ASSETS[emotion]} />
    </span>
  );
}
