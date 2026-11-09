/** Cardastika's own player portraits (docs/default-avatars-sprites.md), 320x320 webp. */
export const DEFAULT_AVATAR_COUNT = 20;

export function getAvatarUrl(index: number) {
  return `/assets/ui/avatars/avatar-${String(index).padStart(2, "0")}.webp`;
}

/** The same seed always gets the same portrait. */
export function getDefaultAvatarUrl(seed: string) {
  let hash = 2166136261;
  for (const character of seed) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return getAvatarUrl(((hash >>> 0) % DEFAULT_AVATAR_COUNT) + 1);
}

/**
 * A chosen portrait is stored as "avatar:NN"; a Telegram photo is kept as it is.
 * Players never show card art: without a photo they get a portrait from the catalogue.
 */
export function resolvePlayerAvatarUrl(photoUrl: string | null | undefined, seed: string) {
  const chosen = photoUrl?.match(/^avatar:(\d{2})$/);
  if (chosen) {
    const index = Number(chosen[1]);
    if (index >= 1 && index <= DEFAULT_AVATAR_COUNT) return getAvatarUrl(index);
  }
  if (photoUrl && !photoUrl.startsWith("avatar:") && !photoUrl.startsWith("/card-art/") && !photoUrl.startsWith("bot-avatar:")) return photoUrl;
  return getDefaultAvatarUrl(seed);
}
