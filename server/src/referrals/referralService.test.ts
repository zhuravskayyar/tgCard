import assert from "node:assert/strict";
import test from "node:test";
import { parseReferralStartParam, toReferralStartParam } from "./referralService.js";

test("parses a direct referral start parameter case-insensitively", () => {
  assert.equal(parseReferralStartParam(" ref_ABCD1234 "), "abcd1234");
  assert.equal(toReferralStartParam(" ABCD1234 "), "ref_abcd1234");
});

test("parses copied Telegram launch wrappers", () => {
  assert.equal(parseReferralStartParam("startapp=ref_abcd1234"), "abcd1234");
  assert.equal(parseReferralStartParam("?start_param=ref_abcd1234"), "abcd1234");
  assert.equal(parseReferralStartParam("https://t.me/cardastikabot?startapp=ref_abcd1234"), "abcd1234");
});

test("rejects missing and malformed referral parameters", () => {
  assert.equal(parseReferralStartParam(null), null);
  assert.equal(parseReferralStartParam("startapp=not-a-referral"), null);
  assert.equal(parseReferralStartParam("ref_short"), null);
});
