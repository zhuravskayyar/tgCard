import type { AuthProvider } from "@cardastika/shared";

export interface VerifiedIdentity {
  provider: AuthProvider;
  providerUserId: string;
  email: string | null;
  firstName: string;
  lastName: string | null;
  photoUrl: string | null;
}
