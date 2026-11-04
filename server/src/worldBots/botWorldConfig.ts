import type { CardElement, CardRarity, GuildLanguage, GuildRecruitmentMode } from "@cardastika/shared";

export type WorldBotPersonality = "tactician" | "rusher" | "collector" | "wanderer" | "guardian";

export interface WorldBotDefinition {
  avatarIndex: number;
  botKey: string;
  firstName: string;
  lastName: string;
  nickname: string;
  username: string;
  language: GuildLanguage;
  personality: WorldBotPersonality;
  level: number;
  deckLevel: number;
  duelLeagueIndex: number;
  element: CardElement;
  equipmentRarity: CardRarity;
  equipmentSlots: number;
  extraDailySession: boolean;
  guild?: {
    name: string;
    nameKey: string;
    description: string;
    language: GuildLanguage;
    recruitmentMode: GuildRecruitmentMode;
    emblemId: string;
    themeElement: CardElement;
  };
  joinGuildBotKey?: string;
}

export const WORLD_BOTS: readonly WorldBotDefinition[] = Object.freeze([
  {
    avatarIndex: 1, botKey: "hanna-koval", firstName: "Hanna Koval", lastName: "Koval", nickname: "Hanna", username: "hanna_koval",
    language: "uk", personality: "tactician", level: 10, deckLevel: 1, duelLeagueIndex: 0, element: "water", equipmentRarity: "common", equipmentSlots: 2, extraDailySession: false,
    guild: { name: "Світанок", nameKey: "svitanok", description: "Шукаємо спокійних гравців для дуелей і спільних рейдів.", language: "uk", recruitmentMode: "open", emblemId: "shield-1", themeElement: "water" },
  },
  {
    avatarIndex: 2, botKey: "taras-bereza", firstName: "Taras Bereza", lastName: "Bereza", nickname: "Taras", username: "taras_bereza",
    language: "uk", personality: "rusher", level: 12, deckLevel: 2, duelLeagueIndex: 1, element: "fire", equipmentRarity: "common", equipmentSlots: 3, extraDailySession: false,
    guild: { name: "Мідний", nameKey: "midnyi", description: "Збираємо колекціонерів і любителів чесних боїв.", language: "uk", recruitmentMode: "application", emblemId: "shield-2", themeElement: "fire" },
  },
  {
    avatarIndex: 3, botKey: "johannes-weiss", firstName: "Johannes Weiss", lastName: "Weiss", nickname: "Johann", username: "johannes_weiss",
    language: "de", personality: "collector", level: 14, deckLevel: 4, duelLeagueIndex: 2, element: "air", equipmentRarity: "uncommon", equipmentSlots: 3, extraDailySession: false,
    guild: { name: "Nebelwacht", nameKey: "nebelwacht", description: "Eine ruhige Runde für Duelle, Karten und gemeinsame Raids.", language: "de", recruitmentMode: "open", emblemId: "shield-3", themeElement: "air" },
  },
  {
    avatarIndex: 4, botKey: "elin-ward", firstName: "Elin Ward", lastName: "Ward", nickname: "Elin", username: "elin_ward",
    language: "en", personality: "tactician", level: 17, deckLevel: 7, duelLeagueIndex: 3, element: "earth", equipmentRarity: "uncommon", equipmentSlots: 4, extraDailySession: false,
    guild: { name: "Ashen Pact", nameKey: "ashen-pact", description: "A small, friendly company for duels, collections, and raids.", language: "en", recruitmentMode: "application", emblemId: "shield-4", themeElement: "earth" },
  },
  {
    avatarIndex: 5, botKey: "liza-baran", firstName: "Liza Baran", lastName: "Baran", nickname: "Liza", username: "liza_baran",
    language: "uk", personality: "collector", level: 22, deckLevel: 12, duelLeagueIndex: 4, element: "fire", equipmentRarity: "rare", equipmentSlots: 5, extraDailySession: false,
    guild: { name: "Тиха Книга", nameKey: "tykha-knyha", description: "Місце для тих, хто збирає історії та рідкісні карти.", language: "uk", recruitmentMode: "closed", emblemId: "shield-5", themeElement: "fire" },
  },
  {
    avatarIndex: 6, botKey: "marko-hnatyshyn", firstName: "Marko Hnatyshyn", lastName: "Hnatyshyn", nickname: "Marko", username: "marko_hnatyshyn",
    language: "uk", personality: "guardian", level: 27, deckLevel: 18, duelLeagueIndex: 5, element: "earth", equipmentRarity: "rare", equipmentSlots: 6, extraDailySession: false,
    guild: { name: "Коло Вітру", nameKey: "kolo-vitru", description: "Граємо без поспіху, ділимося тактиками й ходимо в рейди.", language: "uk", recruitmentMode: "open", emblemId: "shield-6", themeElement: "air" },
  },
  {
    avatarIndex: 7, botKey: "amin-darzi", firstName: "Amin Darzi", lastName: "Darzi", nickname: "Amin", username: "amin_darzi",
    language: "other", personality: "wanderer", level: 31, deckLevel: 24, duelLeagueIndex: 6, element: "water", equipmentRarity: "epic", equipmentSlots: 6, extraDailySession: false,
    guild: { name: "Veilleurs", nameKey: "veilleurs", description: "Une compagnie ouverte aux voyageurs et aux amateurs de duels.", language: "other", recruitmentMode: "open", emblemId: "shield-7", themeElement: "water" },
  },
  {
    avatarIndex: 8, botKey: "nora-vogel", firstName: "Nora Vogel", lastName: "Vogel", nickname: "Nora", username: "nora_vogel",
    language: "de", personality: "guardian", level: 36, deckLevel: 30, duelLeagueIndex: 7, element: "earth", equipmentRarity: "epic", equipmentSlots: 7, extraDailySession: false,
    guild: { name: "Morgenrot", nameKey: "morgenrot", description: "Offen für Reisende, die gerne zusammen kämpfen und sammeln.", language: "de", recruitmentMode: "application", emblemId: "shield-8", themeElement: "earth" },
  },
  {
    avatarIndex: 9, botKey: "nika-sokolova", firstName: "Nika Sokolova", lastName: "Sokolova", nickname: "Nika", username: "nika_sokolova",
    language: "ru", personality: "rusher", level: 43, deckLevel: 40, duelLeagueIndex: 8, element: "fire", equipmentRarity: "legendary", equipmentSlots: 8, extraDailySession: false,
    guild: { name: "Костяной", nameKey: "kostyanoi", description: "Ищем сильных соперников и союзников для рейдов.", language: "ru", recruitmentMode: "open", emblemId: "shield-9", themeElement: "fire" },
  },
  {
    avatarIndex: 10, botKey: "theo-reed", firstName: "Theo Reed", lastName: "Reed", nickname: "Theo", username: "theo_reed",
    language: "en", personality: "wanderer", level: 52, deckLevel: 55, duelLeagueIndex: 9, element: "air", equipmentRarity: "mythic", equipmentSlots: 9, extraDailySession: true,
    guild: { name: "Hollow", nameKey: "hollow", description: "For curious players, close duels, and stories worth sharing.", language: "en", recruitmentMode: "application", emblemId: "shield-10", themeElement: "air" },
  },
  {
    avatarIndex: 11, botKey: "ostap-klymchuk", firstName: "Ostap Klymchuk", lastName: "Klymchuk", nickname: "Ostap", username: "ostap_klymchuk",
    language: "uk", personality: "guardian", level: 12, deckLevel: 1, duelLeagueIndex: 0, element: "earth", equipmentRarity: "common", equipmentSlots: 2, extraDailySession: false, joinGuildBotKey: "hanna-koval",
  },
  {
    avatarIndex: 12, botKey: "iryna-leshchuk", firstName: "Iryna Leshchuk", lastName: "Leshchuk", nickname: "Iryna", username: "iryna_leshchuk",
    language: "uk", personality: "wanderer", level: 14, deckLevel: 2, duelLeagueIndex: 1, element: "water", equipmentRarity: "common", equipmentSlots: 3, extraDailySession: false, joinGuildBotKey: "hanna-koval",
  },
  {
    avatarIndex: 13, botKey: "lukas-hartmann", firstName: "Lukas Hartmann", lastName: "Hartmann", nickname: "Lukas", username: "lukas_hartmann",
    language: "de", personality: "tactician", level: 16, deckLevel: 4, duelLeagueIndex: 2, element: "fire", equipmentRarity: "uncommon", equipmentSlots: 3, extraDailySession: false, joinGuildBotKey: "johannes-weiss",
  },
  {
    avatarIndex: 14, botKey: "greta-vogel", firstName: "Greta Vogel", lastName: "Vogel", nickname: "Greta", username: "greta_vogel",
    language: "de", personality: "collector", level: 18, deckLevel: 7, duelLeagueIndex: 3, element: "air", equipmentRarity: "uncommon", equipmentSlots: 4, extraDailySession: false, joinGuildBotKey: "johannes-weiss",
  },
  {
    avatarIndex: 15, botKey: "bohdan-rudenko", firstName: "Bohdan Rudenko", lastName: "Rudenko", nickname: "Bohdan", username: "bohdan_rudenko",
    language: "uk", personality: "rusher", level: 22, deckLevel: 12, duelLeagueIndex: 4, element: "fire", equipmentRarity: "rare", equipmentSlots: 5, extraDailySession: false, joinGuildBotKey: "marko-hnatyshyn",
  },
  {
    avatarIndex: 16, botKey: "sofiia-kravets", firstName: "Sofiia Kravets", lastName: "Kravets", nickname: "Sofiia", username: "sofiia_kravets",
    language: "uk", personality: "collector", level: 26, deckLevel: 18, duelLeagueIndex: 5, element: "water", equipmentRarity: "rare", equipmentSlots: 6, extraDailySession: false, joinGuildBotKey: "marko-hnatyshyn",
  },
  {
    avatarIndex: 17, botKey: "camille-moreau", firstName: "Camille Moreau", lastName: "Moreau", nickname: "Camille", username: "camille_moreau",
    language: "other", personality: "wanderer", level: 31, deckLevel: 24, duelLeagueIndex: 6, element: "water", equipmentRarity: "epic", equipmentSlots: 6, extraDailySession: false, joinGuildBotKey: "amin-darzi",
  },
  {
    avatarIndex: 18, botKey: "elias-fournier", firstName: "Elias Fournier", lastName: "Fournier", nickname: "Elias", username: "elias_fournier",
    language: "other", personality: "guardian", level: 35, deckLevel: 30, duelLeagueIndex: 7, element: "earth", equipmentRarity: "epic", equipmentSlots: 7, extraDailySession: false, joinGuildBotKey: "amin-darzi",
  },
  {
    avatarIndex: 19, botKey: "dmitri-pavlov", firstName: "Dmitri Pavlov", lastName: "Pavlov", nickname: "Dmitri", username: "dmitri_pavlov",
    language: "ru", personality: "rusher", level: 43, deckLevel: 40, duelLeagueIndex: 8, element: "fire", equipmentRarity: "legendary", equipmentSlots: 8, extraDailySession: false, joinGuildBotKey: "nika-sokolova",
  },
  {
    avatarIndex: 20, botKey: "alina-morozova", firstName: "Alina Morozova", lastName: "Morozova", nickname: "Alina", username: "alina_morozova",
    language: "ru", personality: "tactician", level: 51, deckLevel: 55, duelLeagueIndex: 9, element: "air", equipmentRarity: "mythic", equipmentSlots: 9, extraDailySession: false, joinGuildBotKey: "nika-sokolova",
  },
  {
    avatarIndex: 21, botKey: "marta-shulha", firstName: "Marta Shulha", lastName: "Shulha", nickname: "Marta", username: "marta_shulha",
    language: "uk", personality: "tactician", level: 58, deckLevel: 60, duelLeagueIndex: 10, element: "earth", equipmentRarity: "mythic", equipmentSlots: 5, extraDailySession: false, joinGuildBotKey: "hanna-koval",
  },
  {
    avatarIndex: 22, botKey: "lev-bondar", firstName: "Lev Bondar", lastName: "Bondar", nickname: "Lev", username: "lev_bondar",
    language: "uk", personality: "rusher", level: 60, deckLevel: 62, duelLeagueIndex: 10, element: "fire", equipmentRarity: "epic", equipmentSlots: 4, extraDailySession: false, joinGuildBotKey: "hanna-koval",
  },
  {
    avatarIndex: 23, botKey: "felix-bauer", firstName: "Felix Bauer", lastName: "Bauer", nickname: "Felix", username: "felix_bauer",
    language: "de", personality: "collector", level: 62, deckLevel: 64, duelLeagueIndex: 11, element: "air", equipmentRarity: "legendary", equipmentSlots: 6, extraDailySession: false, joinGuildBotKey: "johannes-weiss",
  },
  {
    avatarIndex: 24, botKey: "klara-stein", firstName: "Klara Stein", lastName: "Stein", nickname: "Klara", username: "klara_stein",
    language: "de", personality: "guardian", level: 64, deckLevel: 66, duelLeagueIndex: 11, element: "water", equipmentRarity: "epic", equipmentSlots: 5, extraDailySession: false, joinGuildBotKey: "johannes-weiss",
  },
  {
    avatarIndex: 25, botKey: "nazar-hreben", firstName: "Nazar Hreben", lastName: "Hreben", nickname: "Nazar", username: "nazar_hreben",
    language: "uk", personality: "rusher", level: 67, deckLevel: 68, duelLeagueIndex: 12, element: "fire", equipmentRarity: "legendary", equipmentSlots: 7, extraDailySession: true, joinGuildBotKey: "marko-hnatyshyn",
  },
  {
    avatarIndex: 26, botKey: "olena-tkach", firstName: "Olena Tkach", lastName: "Tkach", nickname: "Olena", username: "olena_tkach",
    language: "uk", personality: "collector", level: 69, deckLevel: 70, duelLeagueIndex: 12, element: "earth", equipmentRarity: "epic", equipmentSlots: 6, extraDailySession: false, joinGuildBotKey: "marko-hnatyshyn",
  },
  {
    avatarIndex: 27, botKey: "luc-morel", firstName: "Luc Morel", lastName: "Morel", nickname: "Luc", username: "luc_morel",
    language: "other", personality: "wanderer", level: 71, deckLevel: 72, duelLeagueIndex: 13, element: "water", equipmentRarity: "legendary", equipmentSlots: 7, extraDailySession: false, joinGuildBotKey: "amin-darzi",
  },
  {
    avatarIndex: 28, botKey: "aline-gerard", firstName: "Aline Gerard", lastName: "Gerard", nickname: "Aline", username: "aline_gerard",
    language: "other", personality: "tactician", level: 73, deckLevel: 74, duelLeagueIndex: 13, element: "air", equipmentRarity: "epic", equipmentSlots: 6, extraDailySession: false, joinGuildBotKey: "amin-darzi",
  },
  {
    avatarIndex: 29, botKey: "kirill-antonov", firstName: "Kirill Antonov", lastName: "Antonov", nickname: "Kirill", username: "kirill_antonov",
    language: "ru", personality: "guardian", level: 75, deckLevel: 76, duelLeagueIndex: 14, element: "earth", equipmentRarity: "legendary", equipmentSlots: 8, extraDailySession: false, joinGuildBotKey: "nika-sokolova",
  },
  {
    avatarIndex: 30, botKey: "vera-klimova", firstName: "Vera Klimova", lastName: "Klimova", nickname: "Vera", username: "vera_klimova",
    language: "ru", personality: "collector", level: 77, deckLevel: 78, duelLeagueIndex: 14, element: "fire", equipmentRarity: "epic", equipmentSlots: 7, extraDailySession: false, joinGuildBotKey: "nika-sokolova",
  },
  {
    avatarIndex: 31, botKey: "bohdan-kruk", firstName: "Bohdan Kruk", lastName: "Kruk", nickname: "Bohdan", username: "bohdan_kruk",
    language: "uk", personality: "tactician", level: 79, deckLevel: 80, duelLeagueIndex: 15, element: "water", equipmentRarity: "mythic", equipmentSlots: 8, extraDailySession: false, joinGuildBotKey: "hanna-koval",
  },
  {
    avatarIndex: 32, botKey: "zoryana-savchuk", firstName: "Zoryana Savchuk", lastName: "Savchuk", nickname: "Zoryana", username: "zoryana_savchuk",
    language: "uk", personality: "wanderer", level: 81, deckLevel: 82, duelLeagueIndex: 15, element: "air", equipmentRarity: "legendary", equipmentSlots: 7, extraDailySession: false, joinGuildBotKey: "hanna-koval",
  },
  {
    avatarIndex: 33, botKey: "matthias-engel", firstName: "Matthias Engel", lastName: "Engel", nickname: "Matthias", username: "matthias_engel",
    language: "de", personality: "guardian", level: 83, deckLevel: 84, duelLeagueIndex: 16, element: "earth", equipmentRarity: "mythic", equipmentSlots: 9, extraDailySession: false, joinGuildBotKey: "johannes-weiss",
  },
  {
    avatarIndex: 34, botKey: "jana-keller", firstName: "Jana Keller", lastName: "Keller", nickname: "Jana", username: "jana_keller",
    language: "de", personality: "collector", level: 85, deckLevel: 86, duelLeagueIndex: 16, element: "fire", equipmentRarity: "legendary", equipmentSlots: 8, extraDailySession: false, joinGuildBotKey: "johannes-weiss",
  },
  {
    avatarIndex: 35, botKey: "mykhailo-berezhnyi", firstName: "Mykhailo Berezhnyi", lastName: "Berezhnyi", nickname: "Mykhailo", username: "mykhailo_berezhnyi",
    language: "uk", personality: "rusher", level: 87, deckLevel: 88, duelLeagueIndex: 17, element: "fire", equipmentRarity: "mythic", equipmentSlots: 9, extraDailySession: false, joinGuildBotKey: "marko-hnatyshyn",
  },
  {
    avatarIndex: 36, botKey: "mariia-kovalchuk", firstName: "Mariia Kovalchuk", lastName: "Kovalchuk", nickname: "Mariia", username: "mariia_kovalchuk",
    language: "uk", personality: "tactician", level: 89, deckLevel: 90, duelLeagueIndex: 17, element: "water", equipmentRarity: "legendary", equipmentSlots: 8, extraDailySession: false, joinGuildBotKey: "marko-hnatyshyn",
  },
  {
    avatarIndex: 37, botKey: "yves-bernard", firstName: "Yves Bernard", lastName: "Bernard", nickname: "Yves", username: "yves_bernard",
    language: "other", personality: "wanderer", level: 91, deckLevel: 92, duelLeagueIndex: 18, element: "air", equipmentRarity: "mythic", equipmentSlots: 9, extraDailySession: false, joinGuildBotKey: "amin-darzi",
  },
  {
    avatarIndex: 38, botKey: "nadia-benali", firstName: "Nadia Benali", lastName: "Benali", nickname: "Nadia", username: "nadia_benali",
    language: "other", personality: "guardian", level: 93, deckLevel: 94, duelLeagueIndex: 18, element: "water", equipmentRarity: "legendary", equipmentSlots: 8, extraDailySession: false, joinGuildBotKey: "amin-darzi",
  },
  {
    avatarIndex: 39, botKey: "anton-lebedev", firstName: "Anton Lebedev", lastName: "Lebedev", nickname: "Anton", username: "anton_lebedev",
    language: "ru", personality: "rusher", level: 96, deckLevel: 98, duelLeagueIndex: 19, element: "fire", equipmentRarity: "mythic", equipmentSlots: 9, extraDailySession: false, joinGuildBotKey: "nika-sokolova",
  },
  {
    avatarIndex: 40, botKey: "irina-volkova", firstName: "Irina Volkova", lastName: "Volkova", nickname: "Irina", username: "irina_volkova",
    language: "ru", personality: "collector", level: 100, deckLevel: 100, duelLeagueIndex: 20, element: "earth", equipmentRarity: "mythic", equipmentSlots: 9, extraDailySession: false, joinGuildBotKey: "nika-sokolova",
  },
]);

export interface WorldBotPhrases {
  announcement: string[];
  post: string[];
  reply: string[];
  topic: string[];
  welcome: string;
}

export const WORLD_BOT_PHRASES: Readonly<Record<GuildLanguage, WorldBotPhrases>> = Object.freeze({
  uk: {
    announcement: ["Сьогодні ввечері збираємося на дуелі. Новачкам раді.", "Підбираю карти під рейд — пишіть, якщо маєте цікаві комбінації.", "У залі є нові теми про колоди й стихії.", "Дякую всім, хто нещодавно приєднався. Побачимось у бою."],
    post: ["Після кількох дуелей помітив, що зміна однієї карти сильно міняє темп бою.", "Хто яку стихію зараз збирає? Я поки тестую різні поєднання.", "Зайшов на пару боїв і знайшов цікаву комбінацію для захисту.", "Як вам останні бої? Мені подобається, коли результат вирішує одна вдала заміна."],
    reply: ["Згоден, теж пробував таку комбінацію. Ще тестую спорядження.", "Дякую за пораду, спробую в наступній дуелі.", "Класна ідея. Можна перевірити це разом у рейді.", "У мене схоже спрацювало, але довелося поміняти порядок карт."],
    topic: ["Пара думок після дуелей", "Які карти берете в рейд?", "Перевіряю нову комбінацію", "Знайомство мандрівників"],
    welcome: "Привіт! Я {name}, збираю карти й час від часу заходжу на дуелі. Приємно познайомитися — яку стихію зараз розвиваєте?",
  },
  de: {
    announcement: ["Heute Abend bin ich für ein paar Duelle online. Neue Leute sind willkommen.", "Ich teste gerade Decks für den nächsten Raid. Gute Ideen sind immer willkommen.", "Im Forum gibt es neue Notizen zu Karten und Elementen.", "Danke an alle, die kürzlich beigetreten sind. Bis zum nächsten Kampf."],
    post: ["Nach ein paar Duellen habe ich eine Karte ausgetauscht und das Tempo hat sich sofort verändert.", "Welche Elemente spielt ihr gerade? Ich probiere verschiedene Kombinationen.", "Ich habe eine interessante defensive Kombination gefunden.", "Wie liefen eure letzten Kämpfe? Manchmal entscheidet ein guter Kartenwechsel."],
    reply: ["Stimmt, die Kombination habe ich auch getestet. Jetzt probiere ich die Ausrüstung.", "Danke für den Tipp, ich versuche es im nächsten Duell.", "Gute Idee. Das könnten wir gemeinsam im Raid testen.", "Bei mir hat es ähnlich funktioniert, aber ich musste die Reihenfolge ändern."],
    topic: ["Gedanken nach ein paar Duellen", "Welche Karten nehmt ihr in den Raid?", "Ich teste eine neue Kombination", "Reisende stellen sich vor"],
    welcome: "Hallo! Ich bin {name} und sammle Karten. Ab und zu spiele ich ein paar Duelle. Schön, euch kennenzulernen — welches Element entwickelt ihr gerade?",
  },
  en: {
    announcement: ["I’ll be around for a few duels this evening. New members are welcome.", "Testing a deck for the next raid. Always happy to hear a good idea.", "There are fresh notes about cards and elements in the forum.", "Thanks to everyone who joined recently. See you in the next fight."],
    post: ["After a few duels I swapped one card and the whole pace of the match changed.", "Which element are you building around right now? I’m testing a few mixes.", "Found an interesting defensive setup after a couple of fights.", "How have your recent matches gone? I like when one smart swap makes the difference."],
    reply: ["Agreed, I tried that mix too. I’m still figuring out the equipment.", "Thanks for the tip — I’ll try it in my next duel.", "Good idea. We could test that together in the raid.", "Something similar worked for me, but I had to change the card order."],
    topic: ["A few thoughts after duels", "Which cards do you take to raids?", "Testing a new combination", "Travelers, introduce yourselves"],
    welcome: "Hey! I’m {name}. I collect cards and drop into a few duels when I can. Nice to meet you — what element are you working on?",
  },
  ru: {
    announcement: ["Сегодня вечером сыграю несколько дуэлей. Новым участникам рады.", "Подбираю колоду к следующему рейду. Хорошим идеям всегда рад.", "В форуме появились новые заметки о картах и стихиях.", "Спасибо всем, кто недавно присоединился. Увидимся в бою."],
    post: ["После нескольких дуэлей заменил одну карту — и темп боя сразу изменился.", "Какую стихию сейчас собираете? Я пока проверяю разные сочетания.", "Нашёл интересную защитную комбинацию после пары боёв.", "Как прошли ваши последние бои? Иногда всё решает одна удачная замена."],
    reply: ["Согласен, тоже проверял это сочетание. Теперь разбираюсь со снаряжением.", "Спасибо за совет, попробую в следующей дуэли.", "Хорошая идея. Можно проверить вместе в рейде.", "У меня сработало похоже, но пришлось поменять порядок карт."],
    topic: ["Мысли после нескольких дуэлей", "Какие карты берёте в рейд?", "Проверяю новую комбинацию", "Давайте знакомиться"],
    welcome: "Привет! Я {name}, собираю карты и иногда захожу на дуэли. Приятно познакомиться — какую стихию сейчас развиваете?",
  },
  other: {
    announcement: ["Je serai là ce soir pour quelques duels. Les nouveaux sont les bienvenus.", "Je prépare un deck pour le prochain raid. Les bonnes idées sont toujours utiles.", "De nouvelles notes sur les cartes sont dans le forum.", "Merci à tous les nouveaux membres. À bientôt dans l’arène."],
    post: ["Après quelques duels, j’ai changé une carte et le rythme du combat a tout de suite changé.", "Quel élément développez-vous en ce moment ? J’essaie plusieurs combinaisons.", "J’ai trouvé une bonne combinaison défensive après quelques combats.", "Comment se sont passés vos derniers combats ? Un bon changement peut tout décider."],
    reply: ["C’est vrai, j’ai essayé cette combinaison aussi. Je teste encore l’équipement.", "Merci pour le conseil, je vais essayer au prochain duel.", "Bonne idée. On pourrait la tester ensemble pendant le raid.", "J’ai eu un résultat similaire, mais j’ai changé l’ordre des cartes."],
    topic: ["Quelques idées après les duels", "Quelles cartes pour le raid ?", "Je teste une nouvelle combinaison", "Présentation des voyageurs"],
    welcome: "Salut ! Je suis {name}. Je collectionne des cartes et je fais quelques duels de temps en temps. Ravi de vous rencontrer — quel élément développez-vous ?",
  },
});
