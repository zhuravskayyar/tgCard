import { useEffect, useState } from "react";
import "../styles/winter-festive.css";

const MAX_TIMEOUT_MS = 2_147_483_647;

export function WinterFestiveMark({ until }: { until?: string }) {
  const [expiredUntil, setExpiredUntil] = useState<string>();

  useEffect(() => {
    if (!until) return;
    const expiresAt = Date.parse(until);
    let timer: number;
    const scheduleExpiry = () => {
      const remaining = expiresAt - Date.now();
      if (remaining > 0) {
        timer = window.setTimeout(scheduleExpiry, Math.min(remaining, MAX_TIMEOUT_MS));
      } else {
        setExpiredUntil(until);
      }
    };
    scheduleExpiry();
    return () => window.clearTimeout(timer);
  }, [until]);

  if (!until || until === expiredUntil) return null;
  return <span aria-hidden="true" className="winter-festive-mark">❄︎</span>;
}
