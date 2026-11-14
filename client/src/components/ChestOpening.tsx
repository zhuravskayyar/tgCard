import "../styles/chest-opening.css";

/**
 * Shared chest opening scene, three painted frames of one chest on one aligned canvas:
 * closed → ajar (light leaks from the gap) → open. Each frame swap is hidden under a light flash;
 * shake, squash and the rising prize run as CSS animations at the display's frame rate.
 */
export const CHEST_SPRITES = {
  closed: "/assets/ui/chest/chest-closed.webp",
  ajar: "/assets/ui/chest/chest-ajar.webp",
  open: "/assets/ui/chest/chest-open.webp",
} as const;

/** Length of the opening phase; keep in sync with `--chest-opening-ms` in chest-opening.css. */
export const CHEST_OPENING_MS = 1_300;

export type ChestOpeningPhase = "idle" | "opening" | "opened";

export function ChestOpening({ phase, prize }: { phase: ChestOpeningPhase; prize?: React.ReactNode }) {
  return (
    <div className={`chest-opening chest-opening--${phase}`}>
      <span aria-hidden="true" className="chest-opening__rays" />
      <span aria-hidden="true" className="chest-opening__flash" />
      <div className="chest-opening__chest">
        <img alt="" className="chest-opening__frame chest-opening__frame--closed" draggable={false} src={CHEST_SPRITES.closed} />
        <img alt="" className="chest-opening__frame chest-opening__frame--ajar" draggable={false} src={CHEST_SPRITES.ajar} />
        <img alt="" className="chest-opening__frame chest-opening__frame--open" draggable={false} src={CHEST_SPRITES.open} />
      </div>
      {phase === "opened" && prize ? <div className="chest-opening__prize">{prize}</div> : null}
    </div>
  );
}
