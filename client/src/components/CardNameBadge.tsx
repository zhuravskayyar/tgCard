interface CardNameBadgeProps {
  name: string;
}

export function CardNameBadge({ name }: CardNameBadgeProps) {
  return <h1 className="card-name-badge">{name}</h1>;
}
