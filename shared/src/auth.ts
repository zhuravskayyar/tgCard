export type AuthProvider = "telegram" | "google";

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
  sessionToken: string;
  identities: AuthIdentityView[];
}

export interface GoogleAuthRequest {
  credential: string;
}

export interface TelegramWebAuthRequest {
  authData: Record<string, string>;
}

export type LinkIdentityRequest =
  | { provider: "google"; credential: string; replaceExisting?: boolean }
  | { provider: "telegram"; authData: Record<string, string> };

export interface LinkIdentityResponse {
  identities: AuthIdentityView[];
  replacedExisting: boolean;
}
