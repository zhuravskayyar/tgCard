import assert from "node:assert/strict";
import test from "node:test";
import {
  parseForumIndexHtml,
  parseForumSectionHtml,
  parseForumTopicHtml,
  parseGuildAchievementsHtml,
  parseGuildForumIndexHtml,
  parseGuildMembersHtml,
  parseGuildProfileHtml,
  parseReferencePageHtml,
  referenceHtmlToText,
} from "./guildForumReference.js";

test("converts legacy HTML to readable text and keeps image alt text", () => {
  assert.equal(referenceHtmlToText("A&nbsp;B<br><img alt=\":yes\"><div>C</div>"), "A B\n:yes\nC");
});

test("discovers same-origin reference pages and ignores external/user links", () => {
  const page = parseReferencePageHtml(`
    <title>Об игре</title>
    <a href="/about/cards/">Карты</a>
    <a href="/forum/7/66510/#post">Гайд</a>
    <a href="/user/42/">Игрок</a>
    <a href="https://example.com/about/">External</a>
  `, "https://elem.mobi/about/");
  assert.equal(page.kind, "about");
  assert.equal(page.title, "Об игре");
  assert.deepEqual(page.links, [
    { label: "Карты", url: "https://elem.mobi/about/cards/" },
    { label: "Гайд", url: "https://elem.mobi/forum/7/66510/" },
  ]);
  assert.deepEqual(page.styleUrls, []);
});

test("extracts linked stylesheets for layout auditing", () => {
  const page = parseReferencePageHtml(`
    <link rel="stylesheet" href="/css/base.css">
    <link rel="stylesheet theme" href="/css/theme.css?v=2">
    <link rel="icon" href="/img/favicon.png">
  `, "https://elem.mobi/about/");
  assert.deepEqual(page.styleUrls, [
    "https://elem.mobi/css/base.css",
    "https://elem.mobi/css/theme.css?v=2",
  ]);
});

test("classifies the whole read-only project navigation and filters mutation links", () => {
  const page = parseReferencePageHtml(`
    <a href="/">Главная</a>
    <a href="/profile/">Профиль</a>
    <a href="/guild/">Гильдия</a>
    <a href="/guild/info/">Информация</a>
    <a href="/guild/card/">Карта</a>
    <a href="/guild/accept/3750/">Принять</a>
    <a href="/guild/notice/close/">Закрыть</a>
    <a href="/daily/reward/win_duels/">Забрать</a>
  `, "https://elem.mobi/");
  assert.equal(page.kind, "home");
  assert.deepEqual(page.links, [
    { label: "Главная", url: "https://elem.mobi/" },
    { label: "Профиль", url: "https://elem.mobi/profile/" },
    { label: "Гильдия", url: "https://elem.mobi/guild/" },
    { label: "Информация", url: "https://elem.mobi/guild/info/" },
    { label: "Карта", url: "https://elem.mobi/guild/card/" },
  ]);
});

test("parses the public forum index and section topics", () => {
  const index = parseForumIndexHtml(`
    <div class="l_ttl"><a href="/forum/7/">Гильдии</a><div class="small c_99">Поиск игроков в гильдии</div></div>
    <div class="l_ttl"><a href="/forum/3/">Помощь</a><div class="small c_99">Вопросы</div></div>
  `);
  assert.deepEqual(index.categories, [
    { id: 7, title: "Гильдии", description: "Поиск игроков в гильдии", url: "https://elem.mobi/forum/7/" },
    { id: 3, title: "Помощь", description: "Вопросы", url: "https://elem.mobi/forum/3/" },
  ]);

  const section = parseForumSectionHtml(`
    <a href="/forum/7/">Гильдии</a>
    <div class="mb1"><a href="/forum/7/87/#2410"><img src="/img/ico16-forum-topic-important.png"><span class="l_ttl">📌Правила раздела</span></a></div>
    <div class="mb1 odd"><a href="/forum/7/313944/#26739538"><img src="/img/ico16-forum-topic.png"><span class="l_ttl">Гильдия &quot;Домик&quot;</span></a></div>
    <div class="pgn"><span>1</span><a href="/forum/7/page_2/">2</a><a href="/forum/7/page_24/">»</a></div>
    <div>Создавать новые темы могут только маги 10 уровня и выше, но не чаще одной темы в час</div>
    <div>Модераторы: <a href="/user/1/">Mod</a></div>
  `, "https://elem.mobi/forum/7/");
  assert.equal(section.sectionId, 7);
  assert.equal(section.pageCount, 24);
  assert.equal(section.creationRule, "Создавать новые темы могут только маги 10 уровня и выше, но не чаще одной темы в час");
  assert.deepEqual(section.topics.map((topic) => ({ title: topic.title, pinned: topic.pinned, icon: topic.icon })), [
    { title: "📌Правила раздела", pinned: true, icon: "important" },
    { title: "Гильдия \"Домик\"", pinned: false, icon: "unread" },
  ]);
  assert.deepEqual(section.moderators, [{ label: "Mod", url: "https://elem.mobi/user/1/" }]);
});

test("parses topic metadata, posts, links and inline assets", () => {
  const topic = parseForumTopicHtml(`
    <a href="/forum/2/">Общий раздел</a>
    <div class="medium pt2">Предложение</div>
    <div class="small">Комментариев: 1</div>
    <div class="t"><div class="b"><div class="l"><div class="r">
      <a id="123"></a>
      <div class="ml5 rght"><a href="/user/42/">Игрок</a><span class="c_66 small"> 1 авг 12:34</span><a href="/forum/2/99/page_1/replyto/42/#postreply"><img src="/img/ico16-reply.png"></a></div>
      <div class="ml8 c_da pt3 clip small">Текст<br><a href="/guild/952/">Гильдия</a><img src="/img/smilies/yes.gif" alt=":yes"></div>
    </div></div></div></div>
    <div>Модераторы: <a href="/user/1/">Mod</a></div>
    <div class="pgn"><a href="/forum/2/99/page_4/">»</a></div>
  `, "https://elem.mobi/forum/2/99/");
  assert.equal(topic.title, "Предложение");
  assert.equal(topic.commentCount, 1);
  assert.equal(topic.pageCount, 4);
  assert.equal(topic.posts.length, 1);
  assert.deepEqual(topic.posts[0], {
    postId: 123,
    authorId: 42,
    authorName: "Игрок",
    authorUrl: "https://elem.mobi/user/42/",
    authorAvatarUrl: null,
    createdAt: "1 авг 12:34",
    replyUrl: "https://elem.mobi/forum/2/99/page_1/replyto/42/#postreply",
    bodyText: "Текст\nГильдия :yes",
    links: [{ label: "Гильдия", url: "https://elem.mobi/guild/952/" }],
    assetUrls: ["https://elem.mobi/img/smilies/yes.gif"],
  });
});

test("parses guild profile, members, achievements and guild forum", () => {
  const profile = parseGuildProfileHtml(`
    <div class="fttl blue"><div class="lf"><div class="rt"><img src="/img/ico16-el-fire.png">Домик У Озера</div></div></div>
    <div class="bplace fire"><a href="/guild/952/info/">О гильдии<br>55 уровень</a></div>
    <div>Основана 06·09·2015<br>топ-гильдия<br>Союзник: <a href="/guild/4059/">Angels</a><br>
      Боевой рейтинг: 159 (№ 216)<br>Рейтинг по боевому опыту: № 49<br>Боевой опыт: 1.88T<br>Бонусы: +55% +55%</div>
    <a href="/guild/952/members/">13 / 13 Состав</a><span class="stat">17304</span><span>164 ур.</span>
  `, "https://elem.mobi/guild/952/");
  assert.equal(profile.name, "Домик У Озера");
  assert.equal(profile.element, "fire");
  assert.equal(profile.level, 55);
  assert.equal(profile.foundedAt, "2015-09-06");
  assert.equal(profile.ally?.label, "Angels");
  assert.equal(profile.memberCapacity, 13);
  assert.equal(profile.combatRank, 216);
  assert.equal(profile.combatExperienceRank, 49);
  assert.deepEqual(profile.bonuses, ["+55%", "+55%"]);

  const members = parseGuildMembersHtml(`
    <a href="/user/42/" class="bl tdn small c_dblue"><span class="fl bl w20px">1</span><span class="c_66">Игрок</span><span class="c_99 fr"><img>100.11G</span><span class="fr c_99">4011 д</span><br><span class="c_99"> Магистр</span></a>
    <div class="pgn"><a href="/guild/952/members/page_2/">2</a></div>
  `, "https://elem.mobi/guild/952/members/");
  assert.equal(members.pageCount, 2);
  assert.deepEqual(members.members[0], {
    position: 1,
    playerId: 42,
    name: "Игрок",
    guildExperience: "100.11G",
    daysInGuild: 4011,
    rank: "Магистр",
    profileUrl: "https://elem.mobi/user/42/",
  });

  const achievements = parseGuildAchievementsHtml(`
    <div class="fttl green"><div class="lf"><div class="rt">Достижения гильдии</div></div></div>
    <div class="cntr small c_99 mt20"><img src="/img/ach/pl_gwar_100.jpg"><span>Гильдия вошла в Топ100 (64 место)</span><br>в восемнадцатом сезоне войн<br>(август 2025 — декабрь 2025).</div>
  `, "https://elem.mobi/guild/952/achievements/gwars/");
  assert.equal(achievements.mode, "wars");
  assert.equal(achievements.entries.length, 1);
  assert.match(achievements.entries[0]!.text, /Топ100/);
  assert.deepEqual(achievements.entries[0]!.assetUrls, ["https://elem.mobi/img/ach/pl_gwar_100.jpg"]);

  const guildForum = parseGuildForumIndexHtml(`
    <a href="/guildforum/952/95201/">Гостевой</a><span>Доступен всем</span>
  `);
  assert.deepEqual(guildForum.sections, [{
    guildId: 952,
    forumId: 95201,
    title: "Гостевой",
    url: "https://elem.mobi/guildforum/952/95201/",
    access: "Доступен всем",
  }]);
});
