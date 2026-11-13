import assert from "node:assert/strict";
import test from "node:test";
import { findActiveHolidayWindow, findNextHolidayWindow, holidayWindowKey } from "./holidayCalendar.js";

const winter = { startMonth: 12, startDay: 20, endMonth: 1, endDay: 14 };
const independence = { startMonth: 8, startDay: 22, endMonth: 8, endDay: 26 };

test("a span crossing the new year is active on both sides of it", () => {
  const december = findActiveHolidayWindow(winter, new Date("2026-12-31T12:00:00Z"));
  const january = findActiveHolidayWindow(winter, new Date("2027-01-14T23:59:59Z"));
  assert.equal(december?.startsAt.toISOString(), "2026-12-20T00:00:00.000Z");
  assert.equal(january?.startsAt.toISOString(), "2026-12-20T00:00:00.000Z");
  assert.equal(january?.endsAt.toISOString(), "2027-01-15T00:00:00.000Z");
  assert.equal(holidayWindowKey(january!), "2026-12-20");
});

test("the day after the end and the day before the start are outside", () => {
  assert.equal(findActiveHolidayWindow(winter, new Date("2027-01-15T00:00:00Z")), null);
  assert.equal(findActiveHolidayWindow(winter, new Date("2026-12-19T23:59:59Z")), null);
  assert.equal(findActiveHolidayWindow(independence, new Date("2026-08-27T00:00:00Z")), null);
  assert.ok(findActiveHolidayWindow(independence, new Date("2026-08-22T00:00:00Z")));
});

test("the next occurrence rolls into the following year once this one started", () => {
  assert.equal(findNextHolidayWindow(independence, new Date("2026-11-13T00:00:00Z")).startsAt.toISOString(), "2027-08-22T00:00:00.000Z");
  assert.equal(findNextHolidayWindow(winter, new Date("2026-11-13T00:00:00Z")).startsAt.toISOString(), "2026-12-20T00:00:00.000Z");
  assert.equal(findNextHolidayWindow(winter, new Date("2027-01-02T00:00:00Z")).startsAt.toISOString(), "2027-12-20T00:00:00.000Z");
});
