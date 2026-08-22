interface BadgeProps {
  label?: string;
  value: string;
}

export function Badge({ label = "Сповіщення", value }: BadgeProps) {
  return (
    <span className="badge" aria-label={`${label}: ${value}`}>
      {value}
    </span>
  );
}
