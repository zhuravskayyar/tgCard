import type { ReactNode } from "react";

interface AuthProviderIconProps {
  provider: "google" | "telegram";
}

export function AuthProviderIcon({ provider }: AuthProviderIconProps) {
  if (provider === "google") {
    return <span aria-hidden="true" className="auth-provider-icon auth-provider-icon--google">G</span>;
  }

  const telegramIcon: ReactNode = (
    <svg aria-hidden="true" fill="none" height="22" viewBox="0 0 24 24" width="22">
      <path d="m21.4 3.5-18.8 7.2c-.8.3-.8 1.4 0 1.7l4.8 1.5 1.8 5.4c.2.7 1.1.9 1.6.3l2.6-3.1 4.7 3.4c.7.5 1.7.1 1.9-.7l2.5-14.5c.2-.8-.3-1.4-1.1-1.2Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.4" />
      <path d="m7.4 13.9 9.8-7.3-6.4 8.7" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.4" />
    </svg>
  );

  return <span aria-hidden="true" className="auth-provider-icon auth-provider-icon--telegram">{telegramIcon}</span>;
}
