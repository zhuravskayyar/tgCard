import { useEffect, useState } from "react";
import { GUILD_ROLE_LABELS, type GuildProfileResponse, type GuildTreasuryCurrency, type PlayerCardInstance } from "@cardastika/shared";
import { AppIcon } from "../../components/AppIcon";
import { DeckCard } from "../../components/DeckCard";
import { MenuRow } from "../../components/MenuRow";
import { RibbonTitle } from "../../components/RibbonTitle";
import { ScreenHeading } from "../../components/ScreenHeading";
import { GuildRoleBadge, ROLE_ORDER, formatDate, formatNumber, type AsyncState } from "./GuildUi";

type TreasuryMetricId = "rank" | "guildXp" | "cardElements" | "gold" | "silver";

const TREASURY_METRICS: ReadonlyArray<{ id: TreasuryMetricId; label: string; asset?: string; icon?: "gold" | "silver" }> = [
  { id: "rank", label: "Звання", asset: "/assets/guild/guild-treasury-rank.png" },
  { id: "guildXp", label: "Бойовий гільд-досвід", asset: "/assets/guild/guild-treasury-xp.png" },
  { id: "cardElements", label: "Елементи в карту", asset: "/assets/guild/guild-treasury-card-elements.png" },
  { id: "gold", label: "Золото", icon: "gold" },
  { id: "silver", label: "Срібло", icon: "silver" },
];

const DEFAULT_TREASURY_METRIC = TREASURY_METRICS[0]!;

interface GuildTreasuryScreenProps {
  busy: boolean;
  onBack: () => void;
  onDonateCardElements: (instanceIds: string[]) => Promise<boolean>;
  onDonateCurrency: (currency: GuildTreasuryCurrency, amount: number) => Promise<boolean>;
  onLoadCardCandidates: () => void;
  profile: GuildProfileResponse;
  treasuryCardCandidates: AsyncState<PlayerCardInstance[]>;
}

function formatUnlockRemaining(value: string) {
  const hours = Math.max(0, Math.ceil((Date.parse(value) - Date.now()) / 3_600_000));
  if (hours <= 0) return "Внески вже доступні.";
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  return `Внески відкриються через ${days ? `${days} дн. ` : ""}${rest} год.`;
}

function metricValue(metric: TreasuryMetricId, member: GuildProfileResponse["treasury"]["members"][number]) {
  if (metric === "guildXp") return member.contributedXp;
  if (metric === "cardElements") return member.cardElements;
  if (metric === "gold") return member.contributedGold;
  if (metric === "silver") return member.contributedSilver;
  return 0;
}

export function GuildTreasuryScreen({ busy, onBack, onDonateCardElements, onDonateCurrency, onLoadCardCandidates, profile, treasuryCardCandidates }: GuildTreasuryScreenProps) {
  const [view, setView] = useState<"overview" | "stats">("overview");
  const [metric, setMetric] = useState<TreasuryMetricId>("rank");
  const [statsPage, setStatsPage] = useState(1);
  const [silverAmount, setSilverAmount] = useState("");
  const [goldAmount, setGoldAmount] = useState("");
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const activeMetric = TREASURY_METRICS.find((item) => item.id === metric) ?? DEFAULT_TREASURY_METRIC;
  const { treasury } = profile;
  const activeGuildCard = profile.guildCard.active;
  const canContribute = treasury.viewer.canContribute;

  useEffect(() => {
    setSelectedCardIds([]);
  }, [activeGuildCard?.instanceId, activeGuildCard?.level, activeGuildCard?.levelProgressElements, activeGuildCard?.storedElements, treasuryCardCandidates.status]);

  function handleBack() {
    if (view === "stats") {
      setView("overview");
      return;
    }
    onBack();
  }

  async function submitCurrency(currency: GuildTreasuryCurrency) {
    const rawAmount = currency === "silver" ? silverAmount : goldAmount;
    const amount = Number(rawAmount);
    if (!Number.isSafeInteger(amount) || amount <= 0) return;
    if (await onDonateCurrency(currency, amount)) {
      if (currency === "silver") setSilverAmount("");
      else setGoldAmount("");
    }
  }

  function toggleCard(instanceId: string) {
    setSelectedCardIds((current) => current.includes(instanceId) ? current.filter((id) => id !== instanceId) : [...current, instanceId]);
  }

  async function donateSelectedCards() {
    if (busy || selectedCardIds.length === 0) return;
    if (await onDonateCardElements(selectedCardIds)) setSelectedCardIds([]);
  }

  const sortedMembers = [...treasury.members].sort((left, right) => {
    if (metric === "rank") return ROLE_ORDER.indexOf(left.role) - ROLE_ORDER.indexOf(right.role);
    return metricValue(metric, right) - metricValue(metric, left) || left.displayName.localeCompare(right.displayName, "uk");
  });
  const statsPages = Math.max(1, Math.ceil(sortedMembers.length / 10));
  const currentStatsPage = Math.min(statsPage, statsPages);
  const pageStats = sortedMembers.slice((currentStatsPage - 1) * 10, currentStatsPage * 10);

  return <section className="guild-treasury" aria-labelledby="guild-treasury-title">
    <ScreenHeading backLabel={view === "stats" ? "До казни" : "До гільдії"} onBack={handleBack} title={profile.guild.name} />
    <RibbonTitle id="guild-treasury-title" size="wide">{view === "stats" ? "СКЛАД І СТАТИСТИКА" : "КАЗНА ГІЛЬДІЇ"}</RibbonTitle>

    {view === "overview" ? <>
      <div className="guild-treasury__balance" aria-label="Поточний баланс казни">
        <span>Зараз у казні</span>
        <div>
          <span><AppIcon name="silver" size={18} /> {formatNumber(treasury.balance.silver)}</span>
          <span><AppIcon name="gold" size={18} /> {formatNumber(treasury.balance.gold)}</span>
        </div>
      </div>

      {!profile.viewer.member ? <p className="guild-treasury__empty" role="status">Поповнювати казну можуть тільки учасники гільдії.</p> : <>
        <p className="guild-treasury__cooldown" role="status">{canContribute ? "Внески відкриті для вашого акаунта." : `${formatUnlockRemaining(treasury.viewer.contributionAvailableAt)} · ${formatDate(treasury.viewer.contributionAvailableAt)}`}</p>
        <div className="guild-treasury__donations" aria-label="Внесок ресурсів у казну">
          <div className="guild-treasury__donation-row">
            <label><span><AppIcon name="silver" size={16} /> Срібло</span><input inputMode="numeric" min="1" max={treasury.viewer.silver} type="number" value={silverAmount} onChange={(event) => setSilverAmount(event.target.value)} /></label>
            <button className="guild-secondary-button" disabled={busy || !canContribute || !silverAmount} onClick={() => void submitCurrency("silver")} type="button">{busy ? "Вносимо…" : "Внести"}</button>
          </div>
          <div className="guild-treasury__donation-row">
            <label><span><AppIcon name="gold" size={16} /> Золото</span><input inputMode="numeric" min="1" max={Math.min(treasury.viewer.gold, treasury.viewer.goldDailyRemaining)} type="number" value={goldAmount} onChange={(event) => setGoldAmount(event.target.value)} /></label>
            <button className="guild-secondary-button" disabled={busy || !canContribute || !goldAmount || treasury.viewer.goldDailyRemaining <= 0} onClick={() => void submitCurrency("gold")} type="button">{busy ? "Вносимо…" : "Внести"}</button>
          </div>
        </div>
        {canContribute ? <p className="guild-helper">Золото сьогодні: ще {treasury.viewer.goldDailyRemaining} з {treasury.viewer.goldDailyLimit}. Ліміт не накопичується.</p> : null}

        <section className="guild-treasury__cards" aria-labelledby="guild-treasury-card-title">
          <div className="guild-treasury__subheading"><strong id="guild-treasury-card-title">Прокачати карту гільдії</strong>{activeGuildCard ? <small>{activeGuildCard.displayName ?? activeGuildCard.code} · рів. {activeGuildCard.level}</small> : <small>Лідер ще не виставив карту</small>}</div>
          {activeGuildCard && canContribute ? <>
            <p className="guild-helper">Пожертвуйте слабкі карти будь-якої стихії. Вони зникнуть з вашої колекції, а прогрес отримає окрема карта гільдії.</p>
            <button className="guild-secondary-button" disabled={busy || treasuryCardCandidates.status === "loading"} onClick={onLoadCardCandidates} type="button">{treasuryCardCandidates.status === "loading" ? "Завантаження…" : "Показати слабкі карти"}</button>
            {treasuryCardCandidates.status === "error" ? <p className="guild-treasury__empty" role="alert">{treasuryCardCandidates.message}</p> : treasuryCardCandidates.status === "ready" && treasuryCardCandidates.data.length === 0 ? <p className="guild-treasury__empty">Немає доступних карт для пожертви.</p> : treasuryCardCandidates.status === "ready" ? <>
              <div className="guild-treasury__card-grid">{treasuryCardCandidates.data.map((card) => <DeckCard card={card} key={card.instanceId} onClick={() => toggleCard(card.instanceId)} selected={selectedCardIds.includes(card.instanceId)} showLevel />)}</div>
              <button className="guild-primary-button" disabled={busy || selectedCardIds.length === 0} onClick={() => void donateSelectedCards()} type="button">{busy ? "Вносимо…" : `Пожертвувати карти (${selectedCardIds.length})`}</button>
            </> : null}
          </> : <p className="guild-helper">{!canContribute ? "Після трьох днів у гільдії тут з’явиться можливість внеску." : "Спочатку лідер має виставити карту гільдії."}</p>}
        </section>
      </>}
      <div className="guild-menu-list"><MenuRow compact icon="record" metalTexture onClick={() => setView("stats")} title="Статистика казни" /></div>
    </> : <>
      <div className="guild-roster__rank-tabs" aria-label="Критерії статистики казни" role="tablist">
        {TREASURY_METRICS.map((item) => <button aria-label={item.label} aria-selected={item.id === activeMetric.id} className={`guild-roster__rank-tab${item.id === activeMetric.id ? " guild-roster__rank-tab--active" : ""}`} key={item.id} onClick={() => { setMetric(item.id); setStatsPage(1); }} role="tab" type="button">{item.asset ? <img alt="" aria-hidden="true" className="guild-roster__rank-sprite" src={item.asset} /> : <AppIcon name={item.icon!} size={22} />}</button>)}
      </div>
      <h2 className="guild-roster__title">{activeMetric.label}</h2>
      <div className="guild-treasury__stats-list" role="list" aria-label={`Статистика: ${activeMetric.label}`}>
        {sortedMembers.length === 0 ? <div className="guild-treasury__stats-empty" role="status"><span>У гільдії поки немає учасників.</span></div> : pageStats.map((member, index) => <div className="guild-treasury__stat-row" key={member.playerId} role="listitem">
          <span className="guild-treasury__stat-index">{(currentStatsPage - 1) * 10 + index + 1}</span>
          <span className="guild-treasury__stat-badge"><GuildRoleBadge role={member.role} /></span>
          <strong className="guild-treasury__stat-name">{member.displayName}</strong>
          <span className="guild-treasury__stat-value">{metric === "rank" ? GUILD_ROLE_LABELS[member.role] : <>{metric === "gold" || metric === "silver" ? <AppIcon name={metric} size={15} /> : null}{formatNumber(metricValue(metric, member))}</>}</span>
        </div>)}
      </div>
      {statsPages > 1 ? <nav className="guild-pagination" aria-label="Сторінки статистики">
        <button className="guild-secondary-button" disabled={currentStatsPage <= 1} onClick={() => setStatsPage(currentStatsPage - 1)} type="button">«</button>
        <span>{currentStatsPage} / {statsPages}</span>
        <button className="guild-secondary-button" disabled={currentStatsPage >= statsPages} onClick={() => setStatsPage(currentStatsPage + 1)} type="button">»</button>
      </nav> : null}
    </>}
  </section>;
}
