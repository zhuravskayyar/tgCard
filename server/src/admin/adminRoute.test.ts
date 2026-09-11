import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";
import test from "node:test";
import type { AdminIdentity } from "@cardastika/shared";
import { PlayerSessionError } from "../auth/playerAuth.js";
import { AdminAccessDeniedError } from "./adminAuth.js";
import { handleAdminRequest } from "./adminRoute.js";
import type { AdminService } from "./adminService.js";

function createResponseCapture() {
  let status = 0;
  let body: unknown;
  const response = {
    writeHead(nextStatus: number) { status = nextStatus; return response; },
    end(chunk?: string) { body = chunk ? JSON.parse(chunk) : undefined; return response; },
  } as unknown as ServerResponse;
  return { response, read: () => ({ status, body }) };
}

const admin: AdminIdentity = {
  displayName: "Admin",
  playerId: "00000000-0000-4000-8000-000000000001",
  telegramUserId: "12345678",
};

test("returns 401 when an admin route has no valid Cardastika session", async () => {
  const capture = createResponseCapture();
  await handleAdminRequest({ method: "GET", url: "/api/admin/session" } as IncomingMessage, capture.response, {
    auth: { requireAdmin: async () => { throw new PlayerSessionError("missing_session"); } },
    service: {} as AdminService,
  });
  assert.deepEqual(capture.read(), {
    status: 401,
    body: { error: { code: "missing_session", message: "Потрібна авторизація" } },
  });
});

test("returns 403 for an authenticated ordinary player", async () => {
  const capture = createResponseCapture();
  await handleAdminRequest({ method: "GET", url: "/api/admin/session" } as IncomingMessage, capture.response, {
    auth: { requireAdmin: async () => { throw new AdminAccessDeniedError(); } },
    service: {} as AdminService,
  });
  assert.deepEqual(capture.read(), {
    status: 403,
    body: { error: { code: "admin_required", message: "Немає доступу до адмін-панелі" } },
  });
});

test("returns the server-verified admin identity", async () => {
  const capture = createResponseCapture();
  await handleAdminRequest({ method: "GET", url: "/api/admin/session" } as IncomingMessage, capture.response, {
    auth: { requireAdmin: async () => admin },
    service: {} as AdminService,
  });
  assert.deepEqual(capture.read(), { status: 200, body: { admin } });
});

test("rejects malformed encoded player IDs as a client error", async () => {
  const capture = createResponseCapture();
  await handleAdminRequest({ method: "GET", url: "/api/admin/players/%ZZ" } as IncomingMessage, capture.response, {
    auth: { requireAdmin: async () => admin },
    service: {} as AdminService,
  });
  assert.deepEqual(capture.read(), {
    status: 400,
    body: { error: { code: "invalid_player_id", message: "Player ID is invalid" } },
  });
});
