import assert from "node:assert/strict";
import test from "node:test";
import {
  parseEquipmentManualHtml,
  parseEquipmentManualText,
} from "./equipmentManual.js";

const MANUAL_TEXT = `
Мануал: снаряжение
Снаряжение - это предметы, которые можно надеть на персонажа.
Существует 9 типов снаряжения: 4 из них - это вещи (одежда и обувь), остальные 5 - аксессуары.
У вас может быть не более 888 штук вещей (одежды и обуви) и 888 артефактов - не считая надетых.
Будучи надетой, любая вещь увеличивает силу каждой карты своей стихии и здоровье игрока.
Увеличение силы зависит от редкости вещи:
редкость усиление обычная +25 необычная +50 редкая +100 эпическая +200 легендарная +400 мифическая +1000
Существует два типа комплектов вещей, дающие дополнительные бонусы.
Единая редкость Наденьте 4 вещи одинаковой редкости, и бонус каждой вещи вырастет на 25%.
Школа всех стихий Наденьте 4 вещи 4 разных стихий, и каждая вещь будет усиливать ВСЕ карты Боевой колоды.
Возможна комбинация обоих типов комплектов.
Виды артефактов:
Копье мага Увеличивает наносимый урон (но не здоровье). Увеличение урона (% от силы карты): редкость усиление обычное 2% необычное 4% редкое 8% эпическое 12% легендарное 20% мифическое 30%
Щит мага Уменьшает получаемый урон. Уменьшение урона (% от силы карты врага): редкость уменьшение обычный 2% необычный 3% редкий 7% эпический 11% легендарный 18% мифический 24%
Зеркало магии Частично уменьшает урон, частично отражает его в противника. Уменьшение и отражение урона (% от силы карты врага): редкость уменьшение отражение обычное 1% 1% необычное 2% 2% редкое 4% 4% эпическое 6% 6% легендарное 9% 9% мифическое 12% 12%
Амулет жизни После смерти маг воскресает с Х% своих максимальных ОЗ. Восполняемые ОЗ (% от ОЗ): редкость восстановление обычный 2% необычный 4% редкий 8% эпический 12% легендарный 20% мифический 30%
Кукла Вуду После смерти маг проклинает того, кто его убил. Уменьшение ОЗ (% от максимального ОЗ врага): редкость уменьшение обычная 1% необычная 2% редкая 4% эпическая 6% легендарная 9% мифическая 12%
Правила создания вещей и артефактов: 4 обычных вещи + 5 = 1 необычная вещь 5 необычных вещей + 50 = 1 редкая вещь 6 редких вещей + 500 = 1 эпическая вещь 7 эпических вещей + 5000 = 1 легендарная вещь 8 легендарных вещей + 50 000 = 1 мифическая вещь
`;

test("parses equipment counts, bonuses, sets, artifacts and forge recipes", () => {
  const manual = parseEquipmentManualText(MANUAL_TEXT);

  assert.equal(manual.equipmentTypeCount, 9);
  assert.equal(manual.thingTypeCount, 4);
  assert.equal(manual.artifactTypeCount, 5);
  assert.deepEqual(manual.storageLimit, { things: 888, artifacts: 888 });
  assert.deepEqual(manual.rarityPowerBonus, {
    common: 25,
    uncommon: 50,
    rare: 100,
    epic: 200,
    legendary: 400,
    mythic: 1000,
  });
  assert.deepEqual(manual.setRules.map((rule) => [rule.id, rule.multiplier]), [
    ["single_rarity", 1.25],
    ["all_elements", null],
  ]);
  assert.deepEqual(manual.artifactRules.map((rule) => rule.id), [
    "mage_spear",
    "mage_shield",
    "magic_mirror",
    "life_amulet",
    "voodoo_doll",
  ]);
  assert.deepEqual(manual.artifactRules[0]?.valuesByRarity, {
    common: [2],
    uncommon: [4],
    rare: [8],
    epic: [12],
    legendary: [20],
    mythic: [30],
  });
  assert.deepEqual(manual.artifactRules[2]?.valuesByRarity.mythic, [12, 12]);
  assert.deepEqual(manual.forgeRecipes, [
    { inputCount: 4, inputRarity: "common", gold: 5, outputCount: 1, outputRarity: "uncommon" },
    { inputCount: 5, inputRarity: "uncommon", gold: 50, outputCount: 1, outputRarity: "rare" },
    { inputCount: 6, inputRarity: "rare", gold: 500, outputCount: 1, outputRarity: "epic" },
    { inputCount: 7, inputRarity: "epic", gold: 5000, outputCount: 1, outputRarity: "legendary" },
    { inputCount: 8, inputRarity: "legendary", gold: 50000, outputCount: 1, outputRarity: "mythic" },
  ]);
});

test("converts legacy forum markup and extracts only relevant links", () => {
  const html = `<html><head><title>Повелители стихий</title><script>ignore me</script></head><body>
    <a href="/forum/3/228564/#16029443"><b>Ежедневные задания</b></a><br>
    <a href="https://elem.mobi/forum/3/228581/#16031858">Лавка сундуков</a><br>
    <a href="https://elem.mobi/forum/3/228564/#16029443">Дублирующий источник</a><br>
    <a href="https://elem.mobi/forum/3/218665/#15127825">Арена</a>
    ${MANUAL_TEXT.replace(/\n/g, "<br>")}
  </body></html>`;

  const manual = parseEquipmentManualHtml(html);

  assert.equal(manual.acquisitionSources.length, 2);
  assert.equal(manual.acquisitionSources[0]?.url, "https://elem.mobi/forum/3/228564/#16029443");
  assert.deepEqual(manual.artifactBattleModes.map((link) => link.label), ["Арена"]);
});
