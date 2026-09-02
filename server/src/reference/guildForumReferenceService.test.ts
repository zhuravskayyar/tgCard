import assert from "node:assert/strict";
import test from "node:test";
import { GuildForumReferenceService, GuildForumReferenceUnavailableError } from "./guildForumReferenceService.js";

test("reports the reference source as unavailable when the public fetch is rejected", async () => {
  let fetchCount = 0;
  const service = new GuildForumReferenceService(async () => {
    fetchCount += 1;
    return new Response("", { status: 403 });
  });

  await assert.rejects(service.get(), (error) => error instanceof GuildForumReferenceUnavailableError);
  assert.equal(fetchCount > 0, true);
});

test("does not expose an empty snapshot for an unauthenticated reference shell", async () => {
  const service = new GuildForumReferenceService(async () => new Response(
    "<html><head><title>Повелители стихий</title></head><body><a href='/forum/'>Обновить</a></body></html>",
    { status: 200 },
  ));

  await assert.rejects(service.get(), (error) => {
    assert.equal(error instanceof GuildForumReferenceUnavailableError, true);
    assert.match((error as Error).message, /неавторизованной|unsupported/i);
    return true;
  });
});

test("full scope crawls linked public pages and produces a logic discrepancy report", async () => {
  const fetcher = async (url: string) => new Response(referenceFixture(url), { status: 200 });
  const service = new GuildForumReferenceService(fetcher);

  const snapshot = await service.get({ scope: "full", maxPages: 60, maxDepth: 4 });
  assert.equal(snapshot.scope, "full");
  assert.equal(snapshot.crawl.truncated, false);
  assert.equal(snapshot.pages.some((page) => page.sourceUrl === "https://elem.mobi/about/guilds/"), true);
  assert.equal(snapshot.pages.some((page) => page.sourceUrl === "https://elem.mobi/about/guilds_war/"), true);
  assert.equal(snapshot.logic.observations.find((entry) => entry.key === "guild_unlock_level")?.status, "match");
  assert.equal(snapshot.logic.observations.find((entry) => entry.key === "guild_element_affiliation")?.status, "diverges");
  assert.equal(snapshot.logic.observations.find((entry) => entry.key === "guild_forum")?.status, "reference-only");
});

test("does not treat a reference rate-limit page as a successful full crawl", async () => {
  const service = new GuildForumReferenceService(async () => new Response(
    "<title>Повелители стихий</title><p>К сожалению, с вашего адреса поступает слишком много запросов. Сервер перегружен. Осталось около 588 сек.</p>",
    { status: 200 },
  ));

  await assert.rejects(service.get({ scope: "full", maxPages: 4 }), (error) => {
    assert.equal(error instanceof GuildForumReferenceUnavailableError, true);
    assert.match((error as Error).message, /rate-limiting|полезных|useful/i);
    return true;
  });
});

function referenceFixture(url: string) {
  const path = new URL(url).pathname;
  if (path === "/about/") {
    return `<title>Об игре</title><p>Публичная справочная страница референса с описанием мира, карт, боев, гильдий, правил и всех игровых систем.</p>
      <a href="/about/guilds/">Гильдии</a><a href="/about/guilds_war/">Войны гильдий</a><a href="/about/guilds_raids/">Рейды</a>
      <a href="/about/guilds_arena/">Арена гильдий</a><a href="/about/fight_deck_adds/">Дополнительные карты</a><a href="/rules/">Правила</a>`;
  }
  if (path === "/about/guilds/") {
    return `<title>Гильдии</title><p>С 10-го уровня доступны гильдии. Гильдия имеет стихийную принадлежность. Уровень растет за опыт дуэлей и дает бонусы к серебру и опыту. У гильдии есть собственная казна. Ранги: магистр, маршалы, архимаги, боевые маги, адепты, неофиты.</p>`;
  }
  if (path === "/about/guilds_war/") return `<title>Войны гильдий</title><p>Войны гильдий доступны с 35 уровня.</p>`;
  if (path === "/about/guilds_raids/") return `<title>Рейды гильдий</title><p>Рейды гильдий на дракона.</p>`;
  if (path === "/about/guilds_arena/") return `<title>Арена гильдий</title><p>Арена гильдий и альянсы.</p>`;
  if (path === "/about/fight_deck_adds/") return `<title>Дополнительные карты</title><p>К боевой колоде добавляются три дополнительные карты гильдии и союзника.</p>`;
  if (path === "/rules/") return `<title>Правила</title><p>Правила сообщества запрещают ботов, мультиаккаунты и оскорбления.</p><a href="/rules/fc/">Полные правила</a>`;
  if (path === "/forum/") return `<div class="l_ttl"><a href="/forum/7/">Гильдии</a><div class="small">Поиск игроков</div></div>`;
  if (path === "/forum/7/") return `<a href="/forum/7/">Гильдии</a><a href="/forum/7/151400/"><span class="l_ttl">Гайд</span></a>`;
  if (path === "/guild/952/" || path === "/guild/952/info/") return `<div class="fttl blue"><div class="rt">Домик</div></div><div>10 уровень</div>`;
  if (path === "/guildforum/952/") return `<a href="/guildforum/952/95201/">Гостевой</a><span>Доступен всем</span>`;
  return `<title>Reference page</title><p>Reference public page with useful game documentation and links.</p>`;
}
