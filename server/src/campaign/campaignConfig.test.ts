import assert from "node:assert/strict";
import test from "node:test";
import { getRarityForLevel, validateDeckElementBalance } from "@cardastika/game-core";
import { COLLECTION_CARDS } from "../collections/collectionCatalog.js";
import { CAMPAIGN_LOCATIONS } from "./campaignLocations.js";

test("campaign has ten ordered locations, globally unique trials and canonical rewards", () => {
  assert.deepEqual(CAMPAIGN_LOCATIONS.map(l => l.number), [1,2,3,4,5,6,7,8,9,10]);
  assert.deepEqual(CAMPAIGN_LOCATIONS.map(l => l.trials.length), [5,5,4,5,5,7,7,7,7,7]);
  const ids = CAMPAIGN_LOCATIONS.flatMap(l => l.trials.map(t => t.id));
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(CAMPAIGN_LOCATIONS[0]!.trials.map(t => t.id), ["first-duel-win","play-duels","buy-cards","upgrade-cards","save-profile"]);
  assert.deepEqual(CAMPAIGN_LOCATIONS.map(l => l.boss.hp), [1436,5972,17336,25001,40646,55711,70230,85072,101878,116105]);
  assert.deepEqual(CAMPAIGN_LOCATIONS.map(l => l.boss.respawnHours), [2,4,10,20,20,20,20,20,20,20]);
  for (const l of CAMPAIGN_LOCATIONS) {
    assert.equal(l.trialReward.gold, l.number);
    assert.equal(l.trialReward.silver, l.number * 100);
    assert.equal(getRarityForLevel(l.boss.drop.level), l.boss.drop.rarity);
    for (const trial of l.trials.filter(t => !t.available)) assert.equal(trial.navigation, null);
  }
});

test("configured boss decks use nine catalog cards, 3/2/2/2, and sum exactly to HP", () => {
  const byCode = new Map(COLLECTION_CARDS.map(card => [card.code, card]));
  for (const l of CAMPAIGN_LOCATIONS) {
    assert.ok(byCode.has(l.giverCode), l.giverCode);
    assert.ok(byCode.has(l.boss.portraitCode), l.boss.portraitCode);
    assert.ok(l.boss.deck, `location ${l.number} has its reference deck`);
    assert.equal(l.boss.deck.length, 9);
    assert.equal(l.boss.deck.reduce((sum, card) => sum + card.power, 0), l.boss.hp);
    const cards = l.boss.deck.map(card => { const definition = byCode.get(card.code); assert.ok(definition); return definition; });
    assert.equal(validateDeckElementBalance(cards).valid, true);
  }
});
