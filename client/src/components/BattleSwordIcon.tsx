interface BattleSwordIconProps {
  tone: "gold" | "gray";
}

export function BattleSwordIcon({ tone }: BattleSwordIconProps) {
  return (
    <svg
      aria-hidden="true"
      className={`battle-sword battle-sword--${tone}`}
      fill="none"
      viewBox="0 0 24 24"
    >
      <path d="m19.5 3.5-8.1 8.1M17 3.5h2.5V6M9.8 10.2l4 4M7.8 12.2l4 4M10.7 15.1l-5.2 5.2-1.8-1.8 5.2-5.2" />
    </svg>
  );
}
