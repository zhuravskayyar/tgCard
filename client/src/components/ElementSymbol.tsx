import type { CardElement } from "@cardastika/shared";

export function ElementSymbol({ element }: { element: CardElement }) {
  return (
    <svg aria-hidden="true" className="element-symbol" viewBox="0 0 48 48">
      {element === "fire" ? <path d="M25 5c2 9-8 12-5 21 2-3 5-5 8-7 5 6 7 14 1 21-6 6-17 3-20-5-4-11 6-20 16-30Z" /> : null}
      {element === "water" ? <path d="M24 5C18 15 10 23 10 32a14 14 0 0 0 28 0c0-9-8-17-14-27Zm-8 28c2 5 6 7 11 6" /> : null}
      {element === "air" ? <path d="M7 18h25c8 0 8-10 1-10-4 0-6 2-7 5M7 25h32M7 32h22c7 0 7 9 1 9-3 0-5-2-6-4" /> : null}
      {element === "earth" ? <path d="m24 6 16 18-16 18L8 24 24 6Zm0 0v36M8 24h32M16 15l8 9 8-9M16 33l8-9 8 9" /> : null}
    </svg>
  );
}
