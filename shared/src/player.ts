export interface PlayerSummary {
  firstName: string;
  gold: number;
  id: string;
  level: number;
  photoUrl: string | null;
  silver: number;
  username: string | null;
}

export interface TelegramAuthRequest {
  initData: string;
}
