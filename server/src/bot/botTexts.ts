import {
  ONBOARDING_FALLBACK,
  ONBOARDING_FINAL,
  ONBOARDING_RETURNING,
  ONBOARDING_SLIDES,
  ONBOARDING_WELCOME,
} from "./onboarding.js";

export interface BotTexts {
  about: string;
  captions: Readonly<Record<string, string>>;
  fallback: string;
  final: string;
  intro: string;
  play: string;
  returning: string;
  welcome: string;
}

const UKRAINIAN: BotTexts = {
  about: "Про гру",
  captions: Object.fromEntries(ONBOARDING_SLIDES.map(({ fileName, caption }) => [fileName, caption])),
  fallback: ONBOARDING_FALLBACK,
  final: ONBOARDING_FINAL,
  intro: "Почати знайомство",
  play: "ГРАТИ",
  returning: ONBOARDING_RETURNING,
  welcome: ONBOARDING_WELCOME,
};

const ENGLISH: BotTexts = {
  about: "About the game",
  captions: {
    "01-main.jpg": "Your adventure starts here\n\nGrow your hero, gather resources and choose where to go next.",
    "02-cards.jpg": "Build your deck\n\nCards of the four elements differ in rarity and power. Find strong cards and improve them.",
    "03-battle.jpg": "Test your deck in battle\n\nFight other players, use elemental advantages and climb the ranking.",
    "04-guild.jpg": "Play together\n\nJoin a guild, earn its bonuses and unlock more options.",
    "05-profile.jpg": "Grow your hero\n\nEquipment, cards and level steadily strengthen your account.",
  },
  fallback: "Cardastika is a collectible fantasy game about cards of the four elements.\n\nBuild a collection, assemble a deck, grow your hero, fight and play with your guild.",
  final: "Ready to enter Cardastika?\n\nYour first deck is waiting.",
  intro: "Get started",
  play: "PLAY",
  returning: "Welcome back to Cardastika.\n\nYour deck is waiting for the next battle.",
  welcome: "Cardastika\n\nA collectible fantasy game right in Telegram.\n\nCollect cards of the four elements, strengthen your deck, fight other players and unlock new abilities for your hero.\n\nNo long explanations: build a deck and fight.",
};

const GERMAN: BotTexts = {
  about: "Über das Spiel",
  captions: {
    "01-main.jpg": "Dein Abenteuer beginnt hier\n\nEntwickle deinen Helden, sammle Ressourcen und wähle, wohin es als Nächstes geht.",
    "02-cards.jpg": "Baue dein Deck\n\nKarten der vier Elemente unterscheiden sich in Seltenheit und Stärke. Finde starke Karten und verbessere sie.",
    "03-battle.jpg": "Teste dein Deck im Kampf\n\nKämpfe gegen andere Spieler, nutze Elementvorteile und steige in der Rangliste auf.",
    "04-guild.jpg": "Spielt zusammen\n\nTritt einer Gilde bei, erhalte ihre Boni und schalte weitere Möglichkeiten frei.",
    "05-profile.jpg": "Entwickle deinen Helden\n\nAusrüstung, Karten und Stufe stärken dein Konto nach und nach.",
  },
  fallback: "Cardastika ist ein Fantasy-Sammelkartenspiel über Karten der vier Elemente.\n\nBaue eine Sammlung auf, stelle ein Deck zusammen, entwickle deinen Helden, kämpfe und spiele mit deiner Gilde.",
  final: "Bereit für Cardastika?\n\nDein erstes Deck wartet schon.",
  intro: "Loslegen",
  play: "SPIELEN",
  returning: "Willkommen zurück bei Cardastika.\n\nDein Deck wartet auf den nächsten Kampf.",
  welcome: "Cardastika\n\nEin Fantasy-Sammelkartenspiel direkt in Telegram.\n\nSammle Karten der vier Elemente, stärke dein Deck, kämpfe gegen andere Spieler und schalte neue Fähigkeiten deines Helden frei.\n\nOhne lange Erklärungen: Deck bauen und ab in den Kampf.",
};

const RUSSIAN: BotTexts = {
  about: "Об игре",
  captions: {
    "01-main.jpg": "Твоё приключение начинается здесь\n\nРазвивай героя, собирай ресурсы и выбирай, куда отправиться дальше.",
    "02-cards.jpg": "Собирай свою колоду\n\nКарты четырёх стихий различаются редкостью и силой. Находи сильные карты и улучшай их.",
    "03-battle.jpg": "Испытай колоду в бою\n\nСражайся с другими игроками, используй преимущества стихий и поднимайся в рейтинге.",
    "04-guild.jpg": "Играй вместе\n\nВступай в гильдию, получай её бонусы и открывай дополнительные возможности.",
    "05-profile.jpg": "Развивай своего героя\n\nСнаряжение, карты и уровень постепенно усиливают твой аккаунт.",
  },
  fallback: "Cardastika — это коллекционная fantasy-игра о картах четырёх стихий.\n\nСобирай коллекцию, составляй колоду, развивай героя, сражайся и играй вместе с гильдией.",
  final: "Готовы войти в Cardastika?\n\nТвоя первая колода уже ждёт.",
  intro: "Начать знакомство",
  play: "ИГРАТЬ",
  returning: "С возвращением в Cardastika.\n\nТвоя колода уже ждёт следующего боя.",
  welcome: "Cardastika\n\nКоллекционная fantasy-игра прямо в Telegram.\n\nСобирай карты четырёх стихий, усиливай колоду, сражайся с другими игроками и открывай новые возможности своего героя.\n\nБез долгих объяснений: собрал колоду — и в бой.",
};

/** Mirrors the Mini App: the player's Telegram language when the game has it, otherwise English. */
export function getBotTexts(languageCode: string | undefined): BotTexts {
  const language = languageCode?.toLowerCase().split("-")[0];
  if (language === "uk") return UKRAINIAN;
  if (language === "ru") return RUSSIAN;
  if (language === "de") return GERMAN;
  return ENGLISH;
}
