import type { ReactNode } from "react";
import { ARENA_LEAGUE_CONFIG, type LeagueDefinition, type TournamentLobbyView } from "@cardastika/shared";
import { AppIcon, type AppIconName } from "../../components/AppIcon";
import { formatUiNumber } from "../../i18n";
import { TournamentLeagueEmblem } from "./TournamentLeagueEmblem";

const BADGE_NAMES: Record<NonNullable<TournamentLobbyView["prizes"][number]["prize"]["badge"]>, string> = {
  cup_1: "Кубок за 1 місце",
  cup_2: "Кубок за 2 місце",
  cup_3: "Кубок за 3 місце",
  cup_4: "Кубок за 4 місце",
  quarterfinal: "Медаль за 1/4 фіналу",
  eighthfinal: "Медаль за 1/8 фіналу",
  participant: "Медаль учасника",
};

function RuleSection({ icon, title, children }: { icon: AppIconName; title: string; children: ReactNode }) {
  return <section className="tournament-rule-section">
    <span className="tournament-rule-section__icon"><AppIcon name={icon} size={24} /></span>
    <div className="tournament-rule-section__content">
      <h2>{title}</h2>
      <div className="tournament-rule-section__copy">{children}</div>
    </div>
  </section>;
}

type TournamentLeagueRow = TournamentLobbyView["leagues"][number] & {
  key: string;
  badge: LeagueDefinition | null;
};

function getLeagueRows(leagues: TournamentLobbyView["leagues"]): TournamentLeagueRow[] {
  return leagues.flatMap<TournamentLeagueRow>(league => {
    const divisions = ARENA_LEAGUE_CONFIG.leagues.filter(item => item.iconKey === league.league);
    return divisions.length
      ? divisions.map(badge => ({ ...league, key: badge.key, name: badge.name, minimumRating: badge.minRating, badge }))
      : [{ ...league, key: league.league, badge: null }];
  });
}

function LeagueRows({ leagues }: { leagues: TournamentLeagueRow[] }) {
  return <ul className="tournament-rules__leagues">
    {leagues.map(league => <li key={league.key}>
      <TournamentLeagueEmblem league={league.badge} />
      <span><strong>{league.name}</strong><small>
        {league.weeklyQualification
          ? "Щотижневий відбір"
          : `Від ${formatUiNumber(league.minimumRating)} турнірного рейтингу${league.requiresMasterCup ? " · потрібен Кубок Майстрів" : ""}`}
      </small></span>
    </li>)}
  </ul>;
}

function prizeSummary(prize: TournamentLobbyView["prizes"][number]["prize"]) {
  const parts: string[] = [];
  if (prize.reward) parts.push(`${prize.reward.kind === "card" ? "Карта" : "Джерело"} · рівень ${prize.reward.level}`);
  if (prize.diamonds > 0) parts.push(`+${formatUiNumber(prize.diamonds)} алмазів`);
  if (prize.badge) parts.push(BADGE_NAMES[prize.badge]);
  return parts.length ? parts.join(" · ") : "Без нагороди";
}

function leagueHours(league: TournamentLobbyView["leagues"][number]) {
  return league.hours.map(hour => `${String(hour).padStart(2, "0")}:00`).join(" · ");
}

function clockLabel(offset: number) {
  if (offset === 0) return "GMT";
  const sign = offset < 0 ? "−" : "+";
  const absolute = Math.abs(offset);
  return `UTC${sign}${Math.floor(absolute / 60)}${absolute % 60 ? `:${String(absolute % 60).padStart(2, "0")}` : ""}`;
}

export function TournamentRules({ data }: { data: TournamentLobbyView }) {
  const { rules } = data;
  const leagues = getLeagueRows(data.leagues);
  return <section aria-label="Правила турніру" className="tournament-rules-page">
    <div className="tournament-rules__body">
      <header className="tournament-rules__heading">
        <AppIcon name="tournament" size={30} />
        <div><h2>Правила турніру</h2><p>Ліги, раунди, підсилення, призи й розклад</p></div>
      </header>

      <RuleSection icon="ranking" title="Ліги">
        <p>Турніри проходять у глобальних лігах. Усі підліги однієї глобальної ліги грають у спільній сітці. Вхід доступний від {formatUiNumber(data.requiredDuelRating)} рейтингу дуелей. Для Ліги Володарів потрібен Кубок Майстрів.</p>
        <p>До Ліги Чемпіонів щопонеділка о 00:00 GMT відбирають до 128 найсильніших гравців за сумою сили колоди, карти гільдії та союзника. Потрібні Кубок Володарів та участь у їхньому турнірі протягом останніх двох тижнів.</p>
        <LeagueRows leagues={leagues} />
      </RuleSection>

      <RuleSection icon="tournament" title="Раунди">
        <p>Кожен раунд — дуель із суперником у реальному часі. Найсильніші за турнірним рейтингом одразу проходять у перший раунд. Для решти учасників проводиться відбір.</p>
        <p>У відборі й першому раунді суперники розподіляються на пари випадково.</p>
        <p>У звичайних лігах одна поразка вибиває з турніру. Після півфіналу переможці грають за 1 місце, а ті, хто програв, — за 3 місце.</p>
        <p>У Лізі Чемпіонів із щотижневим відбором учасник вибуває після другої поразки; відбір проходить на одне вибування. Якщо учасник нижньої сітки виграє фінал, проводиться вирішальний повторний бій.</p>
      </RuleSection>

      <RuleSection icon="gold" title="Підсилення">
        <p>Перед боєм можна придбати одне підсилення, яке діє тільки в цьому матчі. Гра пропонує власну найсильнішу стихію або контрстихію до найсильнішої стихії суперника.</p>
        <p>Якщо контрстихія збігається з твоєю, з’являється контр-контрстихія. Обране підсилення дає +{rules.buffPercent}% сили відповідним картам і збільшує їхній внесок у початкове здоров’я.</p>
        <p>Ціна підсилення — {formatUiNumber(rules.buffGold)} золота. До початку бою його можна змінити; кожна зміна оплачується як нова покупка.</p>
      </RuleSection>

      <RuleSection icon="card-reward" title="Призи">
        <p>Четверо фіналістів отримують кубки. За 1/4 та 1/8 фіналу є окремі медалі; за раніше вибування після відбору — медаль учасника. Приз залежить від ліги й результату.</p>
        <ul className="tournament-rules__prizes">
          {data.prizes.map(({ label, prize }) => <li key={label}><strong>{label}</strong><span>{prizeSummary(prize)}</span></li>)}
        </ul>
      </RuleSection>

      <RuleSection icon="record" title="Розклад">
        <p>Турніри проходять двічі на день за часом Грінвіча (GMT). Запис відкривається за {rules.registrationMinutes} хв до старту.</p>
        <p>У середу й п’ятницю турніри не проводяться. Під час перемир’я вони проходять щодня.</p>
        <ul className="tournament-rules__schedule">
          {leagues.map(league => <li key={league.key}>
            <TournamentLeagueEmblem league={league.badge} />
            <strong>{league.name}</strong><span>{leagueHours(league)} <small>{clockLabel(data.schedule.utcOffsetMinutes)}</small></span>
          </li>)}
        </ul>
      </RuleSection>
    </div>
  </section>;
}
