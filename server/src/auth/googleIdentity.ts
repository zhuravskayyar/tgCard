import type { VerifiedIdentity } from "./identity.js";
import { OAuth2Client } from "google-auth-library";

export class GoogleIdentityError extends Error {
  constructor(public readonly code: "invalid_google_credential" | "google_not_configured") {
    super(code);
    this.name = "GoogleIdentityError";
  }
}

interface GoogleTokenInfo {
  aud?: string;
  email?: string;
  email_verified?: boolean | string;
  family_name?: string;
  iss?: string;
  name?: string;
  picture?: string;
  sub?: string;
}

type VerifyGoogleIdToken = (credential: string, clientId: string) => Promise<GoogleTokenInfo>;

const googleClient = new OAuth2Client();

async function verifyGoogleIdToken(credential: string, clientId: string): Promise<GoogleTokenInfo> {
  const ticket = await googleClient.verifyIdToken({
    audience: clientId,
    idToken: credential,
  });
  const payload = ticket.getPayload();
  if (!payload) throw new Error("missing_google_token_payload");
  return payload;
}

export async function verifyGoogleCredential(
  credential: string,
  clientId: string | null,
  verifier: VerifyGoogleIdToken = verifyGoogleIdToken,
): Promise<VerifiedIdentity> {
  if (!clientId) throw new GoogleIdentityError("google_not_configured");
  if (!credential.trim()) throw new GoogleIdentityError("invalid_google_credential");

  let payload: GoogleTokenInfo;
  try {
    payload = await verifier(credential, clientId);
  } catch {
    throw new GoogleIdentityError("invalid_google_credential");
  }

  if (
    (payload.iss !== "accounts.google.com" && payload.iss !== "https://accounts.google.com")
    || payload.aud !== clientId
    || !payload.sub?.trim()
    || (payload.email_verified !== true && payload.email_verified !== "true")
  ) {
    throw new GoogleIdentityError("invalid_google_credential");
  }

  const name = payload.name?.trim() || payload.email?.split("@")[0]?.trim();
  if (!name) throw new GoogleIdentityError("invalid_google_credential");

  return {
    provider: "google",
    providerUserId: payload.sub,
    email: payload.email?.trim().toLowerCase() || null,
    firstName: name,
    lastName: payload.family_name?.trim() || null,
    photoUrl: payload.picture?.trim() || null,
  };
}
