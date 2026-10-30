export type AuthProvider = "telegram" | "google";
export type AuthSessionProvider = AuthProvider | "guest";

export type AccountProtectionStatus = "locked" | "available" | "completed" | "not_applicable";

export interface AccountProtectionTaskView {
  rewardGold: 500;
  status: AccountProtectionStatus;
}

export interface AuthConfigResponse {
  googleClientId: string | null;
  telegramBotUsername: string | null;
}

export interface AuthIdentityView {
  provider: AuthProvider;
  email: string | null;
  createdAt: string;
}

export interface AuthSessionResponse {
  player: import("./player.js").PlayerSummary;
  sessionProvider: AuthSessionProvider;
  sessionToken: string;
  identities: AuthIdentityView[];
}

export interface AuthMeResponse {
  accountProtection: AccountProtectionTaskView;
  identities: AuthIdentityView[];
  player: import("./player.js").PlayerSummary;
  sessionProvider: AuthSessionProvider;
}

export interface GoogleAuthRequest {
  credential: string;
}

export interface TelegramWebAuthRequest {
  authData: Record<string, string>;
}

export type LinkIdentityRequest =
  | { provider: "google"; credential: string; replaceExisting?: boolean }
  | { provider: "telegram"; authData: Record<string, string> }
  | { provider: "telegram"; initData: string };

export interface LinkIdentityResponse {
  identities: AuthIdentityView[];
  rewardGranted: boolean;
  replacedExisting: boolean;
}
