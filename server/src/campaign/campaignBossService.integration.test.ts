import assert from "node:assert/strict";
import test from "node:test";
import { CampaignBossAlreadyCompletedError, CampaignBossBattleConflictError, CampaignBossLockedError, CampaignBossService } from "./campaignBossService.js";
import { CampaignService } from "./campaignService.js";
import { databaseUrl, passLocations, unlockTrials, withCampaignPlayer } from "./campaignTestSupport.js";

test("boss requires this location's trials, resumes safely and hides enemy cards", { skip: !databaseUrl }, () => withCampaignPlayer(async (pool,id) => {
  const service = new CampaignBossService(pool,new CampaignService(pool),()=>0,{nextInt:()=>0});
  await assert.rejects(service.start(id,1),CampaignBossLockedError);
  await assert.rejects(service.start(id,2),CampaignBossLockedError);
  await unlockTrials(pool,id);
  const started = await service.start(id,1);
  assert.equal(started.locationNumber,1);
  assert.equal(started.enemyMaxHp,1436);
  assert.equal("cards" in started.opponent,false);
  assert.deepEqual(started.enemyActiveCards,[0,1,2].map(slotIndex=>({slotIndex,hidden:true})));
  assert.equal((await service.start(id,1)).battleId,started.battleId);
  await assert.rejects(service.start(id,2),CampaignBossBattleConflictError);
  const action = await service.action(id,started.battleId,{slotIndex:0,expectedVersion:started.version});
  assert.ok(action.battleLog[0]!.enemyCard.code);
  assert.deepEqual(action.enemyActiveCards,started.enemyActiveCards);
}));

test("first win pays exact currency and a standard random card; repeat pays only card and damage XP", { skip: !databaseUrl }, () => withCampaignPlayer(async (pool,id) => {
  const campaign = new CampaignService(pool);
  const service = new CampaignBossService(pool,campaign,()=>0,{nextInt:()=>0});
  await unlockTrials(pool,id);
  await pool.query("UPDATE players SET level=12, account_xp=0 WHERE id=$1",[id]);
  const now = new Date("2026-11-02T12:00:00Z");
  const first = await service.start(id,1,now);
  await pool.query("UPDATE duels SET enemy_hp=1 WHERE id=$1",[first.battleId]);
  const won = await service.action(id,first.battleId,{slotIndex:0,expectedVersion:first.version},now);
  assert.equal(won.status,"won");
  assert.equal(won.result!.firstWin,true);
  assert.equal(won.result!.silver,2000);
  assert.equal(won.result!.gold,10);
  assert.equal(won.result!.rewardCard!.rarity,"rare");
  assert.equal(won.result!.rewardCard!.level,14);
  assert.ok(won.result!.rewardCard!.finalPower >=250 && won.result!.rewardCard!.finalPower<=300);
  await assert.rejects(service.action(id,first.battleId,{slotIndex:0,expectedVersion:first.version},now),CampaignBossBattleConflictError);
  await assert.rejects(service.start(id,1,new Date(now.getTime()+2*3600000-1)),CampaignBossAlreadyCompletedError);
  const later = new Date(now.getTime()+2*3600000);
  const second = await service.start(id,1,later);
  await pool.query("UPDATE duels SET enemy_hp=1 WHERE id=$1",[second.battleId]);
  const repeat = await service.action(id,second.battleId,{slotIndex:0,expectedVersion:second.version},later);
  assert.equal(repeat.result!.firstWin,false);
  assert.equal(repeat.result!.silver,0);
  assert.equal(repeat.result!.gold,0);
  assert.ok(repeat.result!.xp>0);
  const events = await pool.query("SELECT event_type,COUNT(*)::integer AS count FROM player_campaign_events WHERE player_id=$1 AND event_type IN ('CARD_ACQUIRED','CAMPAIGN_CARD_DROP') GROUP BY event_type ORDER BY event_type",[id]);
  assert.deepEqual(events.rows,[{event_type:"CAMPAIGN_CARD_DROP",count:2},{event_type:"CARD_ACQUIRED",count:2}]);
  const progress = (await pool.query("SELECT first_win_at,last_win_at FROM player_campaign_locations WHERE player_id=$1",[id])).rows[0];
  assert.equal(progress.first_win_at.toISOString(),now.toISOString());
  assert.equal(progress.last_win_at.toISOString(),later.toISOString());
  assert.deepEqual((await campaign.getCampaign(id,later)).locations.map(l=>l.number),[2,1]);
}));

test("loss gives damage XP, no location win, no currency or card drop", { skip: !databaseUrl }, () => withCampaignPlayer(async (pool,id) => {
  const service = new CampaignBossService(pool,new CampaignService(pool),()=>0,{nextInt:()=>0});
  await unlockTrials(pool,id);
  const started = await service.start(id,1);
  await pool.query("UPDATE duels SET player_hp=1 WHERE id=$1",[started.battleId]);
  const lost = await service.action(id,started.battleId,{slotIndex:0,expectedVersion:started.version});
  assert.equal(lost.status,"lost");
  assert.equal(lost.result!.silver,0);
  assert.equal(lost.result!.rewardCard,undefined);
  assert.equal((await pool.query("SELECT COUNT(*) FROM player_campaign_locations WHERE player_id=$1",[id])).rows[0].count,"0");
}));

test("old bosses are rejected even after respawn", { skip: !databaseUrl }, () => withCampaignPlayer(async (pool,id) => {
  await passLocations(pool,id,4);
  const service = new CampaignBossService(pool,new CampaignService(pool));
  await assert.rejects(service.start(id,1,new Date("2026-11-03T12:00:00Z")),CampaignBossAlreadyCompletedError);
}));
