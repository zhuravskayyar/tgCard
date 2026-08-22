import assert from "node:assert/strict";
import test from "node:test";
import { getCorsPolicy } from "./cors.js";

const allowedOrigin = "https://cardastika.example";

test("allows the configured Mini App origin", () => {
  const policy = getCorsPolicy(allowedOrigin, allowedOrigin);

  assert.equal(policy.allowed, true);
  assert.equal(policy.headers["Access-Control-Allow-Origin"], allowedOrigin);
});

test("rejects an unconfigured browser origin", () => {
  assert.deepEqual(getCorsPolicy("https://untrusted.example", allowedOrigin), {
    allowed: false,
    headers: {},
  });
});

test("allows non-browser requests without adding CORS headers", () => {
  assert.deepEqual(getCorsPolicy(undefined, allowedOrigin), {
    allowed: true,
    headers: {},
  });
});

test("keeps local proxy development working without enabling cross-origin access", () => {
  assert.deepEqual(getCorsPolicy("http://localhost:5173", null), {
    allowed: true,
    headers: {},
  });
});
