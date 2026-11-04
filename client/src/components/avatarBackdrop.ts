const AVATAR_BACKDROP_COUNT = 6;

/** Bot portraits are transparent cut-out card art; each gets a stable painted backdrop picked from its art path. */
export function cardArtAvatarClassName(photoUrl: string | null | undefined) {
  if (!photoUrl?.startsWith("/card-art/")) return undefined;
  let hash = 0;
  for (const character of photoUrl) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return `duel-avatar__card-art duel-avatar__card-art--${hash % AVATAR_BACKDROP_COUNT}`;
}
