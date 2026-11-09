import "./AvatarImage.css";
import { useState } from "react";
import { getDefaultAvatarUrl, resolvePlayerAvatarUrl } from "./avatarCatalog";

interface AvatarImageProps {
  alt: string;
  name: string;
  photoUrl: string | null;
  /** Stable key for the default portrait; the player id where known, otherwise the name. */
  seed?: string;
}

function getBotAvatarIndex(photoUrl: string | null) {
  const match = photoUrl?.match(/^bot-avatar:(\d{2})$/);
  const index = match ? Number(match[1]) : 0;
  return Number.isInteger(index) && index >= 1 && index <= 40 ? index : null;
}

export function AvatarImage({ alt, name, photoUrl, seed }: AvatarImageProps) {
  const index = getBotAvatarIndex(photoUrl);
  if (index !== null) {
    const isExtended = index > 10;
    const tile = index - (isExtended ? 11 : 1);
    const column = tile % 5;
    const row = Math.floor(tile / 5);
    return (
      <span
        aria-label={alt || name}
        className={`bot-avatar-sprite${isExtended ? " bot-avatar-sprite--extended" : ""}`}
        role={alt ? "img" : undefined}
        style={{ backgroundPosition: `${column * 25}% ${row * (isExtended ? 20 : 100)}%` }}
      />
    );
  }
  return <PlayerPortrait alt={alt} seed={seed ?? name} source={resolvePlayerAvatarUrl(photoUrl, seed ?? name)} />;
}

function PlayerPortrait({ alt, seed, source }: { alt: string; seed: string; source: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  const fallback = getDefaultAvatarUrl(seed);
  return <img alt={alt} decoding="async" onError={() => setFailed(source)} src={failed === source ? fallback : source} />;
}
