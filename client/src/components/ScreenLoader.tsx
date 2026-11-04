import { CardBack } from "./CardBack";

export function ScreenLoader() {
  return (
    <div className="screen-loader" role="status">
      <span aria-hidden="true" className="screen-loader__card">
        <CardBack className="screen-loader__back" />
        <span className="screen-loader__glint" />
      </span>
      <span className="screen-loader__label">Завантаження…</span>
    </div>
  );
}
