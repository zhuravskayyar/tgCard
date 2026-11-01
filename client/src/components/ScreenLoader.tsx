const CARD_BACK_SPRITE = "/assets/guild/card-back-v1.webp";
const SEAL_SPRITE = "/assets/ui/trials/board/seal-v1.webp";
const GLINT_SPRITE = "/assets/ui/bestiary/seal-glint-v1.webp";

/** Loaded ahead of time: a loader that itself pops in would defeat its purpose. */
export function preloadScreenLoader() {
  for (const source of [CARD_BACK_SPRITE, SEAL_SPRITE, GLINT_SPRITE]) new Image().src = source;
}

export function ScreenLoader() {
  return (
    <div className="screen-loader" role="status">
      <span aria-hidden="true" className="screen-loader__card">
        <img alt="" className="screen-loader__back" src={CARD_BACK_SPRITE} />
        <span className="screen-loader__glint"><img alt="" src={GLINT_SPRITE} /></span>
        <img alt="" className="screen-loader__seal" src={SEAL_SPRITE} />
      </span>
      <span className="screen-loader__label">Завантаження…</span>
    </div>
  );
}
