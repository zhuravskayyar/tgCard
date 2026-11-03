import assert from "node:assert/strict";
import test from "node:test";
import { CampaignService } from "./campaignService.js";
import { databaseUrl, passLocations, unlockTrials, withCampaignPlayer } from "./campaignTestSupport.js";

test("campaign starts fresh, preserves fairy claims and ignores old stage completion", { skip: !databaseUrl }, () => withCampaignPlayer(async (pool, id) => {
  const service = new CampaignService(pool);
  await pool.query("INSERT INTO player_campaign_quest_progress (player_id, quest_id, stage_number, progress, completed_at, claimed_at) VALUES ($1, '1.1', 1, 1, NOW(), NOW())", [id]);
  const before = await service.getCampaign(id);
  assert.deepEqual(before.locations.map(l => [l.number, l.state]), [[1,"trials"]]);
  await unlockTrials(pool, id);
  assert.equal((await service.getCampaign(id)).locations[0]!.state, "open");
  await passLocations(pool, id, 1);
  const after = await service.getCampaign(id);
  assert.deepEqual(after.locations.map(l => [l.number, l.state]), [[2,"trials"],[1,"passed"]]);
  assert.equal((await pool.query("SELECT COUNT(*) FROM player_campaign_quest_progress WHERE player_id=$1",[id])).rows[0].count, "1");
}));

test("only the last three passed locations are refightable, with exact respawn boundary", { skip: !databaseUrl }, () => withCampaignPlayer(async (pool, id) => {
  const now = new Date("2026-11-02T10:00:00Z");
  await passLocations(pool, id, 4, new Date("2026-11-01T10:00:00Z"));
  const service = new CampaignService(pool);
  const map = await service.getCampaign(id, now);
  assert.equal(map.locations.find(l => l.number === 1)!.boss.canFight, false);
  assert.equal(map.locations.find(l => l.number === 2)!.boss.canFight, true);
  await pool.query("UPDATE player_campaign_locations SET last_win_at=$2 WHERE player_id=$1 AND location_number=2", [id, new Date(now.getTime()-4*3600000+1)]);
  assert.equal((await service.getCampaign(id, now)).locations.find(l => l.number === 2)!.boss.canFight, false);
  assert.equal((await service.getCampaign(id, new Date(now.getTime()+1))).locations.find(l => l.number === 2)!.boss.canFight, true);
}));

test("campaign events only append events and no longer create old stage state", { skip: !databaseUrl }, () => withCampaignPlayer(async (pool,id) => {
  const service = new CampaignService(pool);
  await service.recordExternalEvent(id,"CARD_ACQUIRED",{rarity:"mythic"});
  assert.equal((await pool.query("SELECT COUNT(*) FROM player_campaign_state WHERE player_id=$1",[id])).rows[0].count, "0");
  assert.equal((await pool.query("SELECT payload->>'rarityRank' AS rank FROM player_campaign_events WHERE player_id=$1",[id])).rows[0].rank, "5");
}));
