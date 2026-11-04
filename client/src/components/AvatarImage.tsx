import "./AvatarImage.css";

interface AvatarImageProps {
  alt: string;
  name: string;
  photoUrl: string | null;
}

function getBotAvatarIndex(photoUrl: string | null) {
  const match = photoUrl?.match(/^bot-avatar:(\d{2})$/);
  const index = match ? Number(match[1]) : 0;
  return Number.isInteger(index) && index >= 1 && index <= 40 ? index : null;
}

export function AvatarImage({ alt, name, photoUrl }: AvatarImageProps) {
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
  if (photoUrl) return <img alt={alt} src={photoUrl} />;
  return <span>{name.slice(0, 2).toUpperCase()}</span>;
}
