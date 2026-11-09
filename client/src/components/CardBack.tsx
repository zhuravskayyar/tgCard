import { CARD_BACK_SRC } from "../cards/cardBackModel";

interface CardBackProps {
  className?: string;
  label?: string;
}

/** A single shared painted back for battle slots, previews and booster cards. */
export function CardBack({ className = "", label }: CardBackProps) {
  return (
    <span aria-hidden={label ? undefined : true} aria-label={label} className={["card-back", className].filter(Boolean).join(" ")} role={label ? "img" : undefined}>
      <img alt="" className="card-back__art" decoding="async" draggable={false} src={CARD_BACK_SRC} />
    </span>
  );
}
