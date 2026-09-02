import assert from "node:assert/strict";
import test from "node:test";
import {
  GUILD_CONFIG,
  canKickGuildMember,
  canManageGuildRole,
  getGuildLevelForExperience,
  getGuildNextLevelExperience,
  hasGuildPermission,
  normalizeGuildName,
  normalizeGuildNameKey,
} from "@cardastika/shared";

test("guild balance is config-driven and level thresholds are monotonic", () => {
  assert.equal(GUILD_CONFIG.unlockLevel, 10);
  assert.equal(GUILD_CONFIG.creationCostSilver, 10_000);
  assert.equal(GUILD_CONFIG.nameMaxLength, 10);
  assert.equal(GUILD_CONFIG.dailyXpCap, 300);
  assert.equal(getGuildLevelForExperience(0), 1);
  assert.equal(getGuildLevelForExperience(1_000_000), 2);
  assert.equal(getGuildLevelForExperience(75_000_000), 20);
  assert.equal(getGuildNextLevelExperience(1), 1_000_000);
  assert.equal(getGuildNextLevelExperience(20), null);
});

test("guild names accept Ukrainian and Latin names and reject unsafe forms", () => {
  assert.equal(normalizeGuildName("  Вартові  "), "Вартові");
  assert.equal(normalizeGuildNameKey("CARD Asti"), "card asti");
  assert.throws(() => normalizeGuildName("ab"), /guild_name_too_short/);
  assert.throws(() => normalizeGuildName("Довга Гільдія"), /guild_name_too_long/);
  assert.throws(() => normalizeGuildName("---"), /guild_name_invalid/);
  assert.throws(() => normalizeGuildName("Double  Sp"), /guild_name_double_space/);
  assert.throws(() => normalizeGuildName("Name!"), /guild_name_invalid/);
  assert.throws(() => normalizeGuildName("中文公会"), /guild_name_invalid/);
});

test("guild role permissions enforce officer boundaries", () => {
  assert.equal(hasGuildPermission("leader", "dissolve_guild"), true);
  assert.equal(hasGuildPermission("officer", "manage_settings"), false);
  assert.equal(canManageGuildRole("officer", "member", "veteran"), true);
  assert.equal(canManageGuildRole("officer", "veteran", "officer"), false);
  assert.equal(canManageGuildRole("officer", "officer", "member"), false);
  assert.equal(canKickGuildMember("officer", "newbie"), true);
  assert.equal(canKickGuildMember("officer", "veteran"), false);
  assert.equal(canKickGuildMember("leader", "officer"), true);
  assert.equal(canKickGuildMember("leader", "leader"), false);
});
