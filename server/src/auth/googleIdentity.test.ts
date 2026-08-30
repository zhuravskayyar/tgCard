import assert from "node:assert/strict";
import test from "node:test";
import { GoogleIdentityError, verifyGoogleCredential } from "./googleIdentity.js";

const payload = {
  aud: "client.apps.googleusercontent.com",
  email: "player@example.com",
  email_verified: "true",
  iss: "https://accounts.google.com",
  name: "Google Player",
  sub: "google-sub-105",
};

test("Google identity verification uses stable sub, not email", async () => {
  const identity = await verifyGoogleCredential(
    "signed-id-token",
    "client.apps.googleusercontent.com",
    async () => payload,
  );
  assert.equal(identity.provider, "google");
  assert.equal(identity.providerUserId, "google-sub-105");
  assert.equal(identity.email, "player@example.com");
});

test("Google identity verification accepts both documented issuer formats", async () => {
  const identity = await verifyGoogleCredential(
    "signed-id-token",
    "client.apps.googleusercontent.com",
    async () => ({
      ...payload,
      email_verified: true,
      iss: "accounts.google.com",
    }),
  );
  assert.equal(identity.providerUserId, "google-sub-105");
});

test("Google identity verification rejects a token for another client", async () => {
  await assert.rejects(
    verifyGoogleCredential(
      "signed-id-token",
      "another-client.apps.googleusercontent.com",
      async () => payload,
    ),
    (error) => error instanceof GoogleIdentityError && error.code === "invalid_google_credential",
  );
});
