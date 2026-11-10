import type { ReactNode } from "react";
import "./seal-toggle.css";

interface SealToggleProps {
  busy?: boolean;
  checked: boolean;
  disabled?: boolean;
  /** Short visible label; it wraps instead of being cut off. */
  label: ReactNode;
  onToggle: () => void;
  /** Read by screen readers only; the knob's lock and the track colour show the state visually. */
  stateLabel?: string;
}

/** Shared on/off switch: brass plate, leather/verdigris track and a padlock knob that slides across. */
export function SealToggle({ busy = false, checked, disabled = false, label, onToggle, stateLabel }: SealToggleProps) {
  return (
    <button
      aria-busy={busy}
      aria-checked={checked}
      className={`seal-toggle${checked ? " seal-toggle--on" : ""}`}
      disabled={disabled}
      onClick={onToggle}
      role="switch"
      type="button"
    >
      <span className="seal-toggle__label">
        {label}
        {stateLabel ? <span className="seal-toggle__state"> {stateLabel}</span> : null}
      </span>
      <span aria-hidden="true" className="seal-toggle__track"><span className="seal-toggle__knob" /></span>
    </button>
  );
}
