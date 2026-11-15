import { useEffect, useState } from "react";
import type { CardElement, GuardianDragonFightResult, GuardianDragonRatingResponse, GuardianDragonView } from "@cardastika/shared";
import { CurrencyIcon } from "../components/CurrencyDisplay";
import { ElementArt } from "../components/ElementAura";
import { ElementSymbol } from "../components/ElementSymbol";
import { Pagination } from "../components/Pagination";
import { RibbonTitle } from "../components/RibbonTitle";
import { formatUiNumber } from "../i18n";
import { getTelegramInitData } from "../telegram";
import { absorbGuardianDragonFlame, fightGuardianDragon, GuardianDragonApiError, loadGuardianDragonRating, upgradeGuardianDragonFlame } from "../telegram/guardianDragon";
import "../styles/leaderboard-book.css";

function formatLeft(iso: string, now: number) {
  const left = Math.max(0, new Date(iso).getTime() - now);
  const hours = Math.floor(left / 3_600_000);
  const minutes = Math.floor((left % 3_600_000) / 60_000);
  return hours ? `${hours} год ${minutes} хв` : `${minutes} хв`;
}

/** Painted scene of two dragons fighting, above the send button as on the reference page. */
const FIGHTS_ART = "/assets/ui/guardian-dragon/fights.webp";

type RatingState = { status: "loading" } | { status: "error" } | { status: "ready"; data: GuardianDragonRatingResponse };

/** Reference «Битви драконів»: mastery with the rating place, the send button and the dragon rating. */
export function GuardianDragonBattles({ dragon, onDragon, onGoldChange, onRefresh, locked }: { dragon: GuardianDragonView; onDragon: (next: GuardianDragonView) => void; onGoldChange: (gold: number) => void; onRefresh: () => void; locked: boolean }) {
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [rating, setRating] = useState<RatingState>({ status: "loading" });
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<GuardianDragonFightResult | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fights = dragon.fights;
  const [fightsArtMissing, setFightsArtMissing] = useState(false);
  // The cooldown label ticks; once it is over the free send shows again without a reload.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!fights.cooldownUntil) return;
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [fights.cooldownUntil]);
  const freeReady = fights.freeReady || Boolean(fights.cooldownUntil && new Date(fights.cooldownUntil).getTime() <= now);
  const price = freeReady ? 0 : fights.nextPaidPrice;

  useEffect(() => {
    const initData = getTelegramInitData();
    if (!initData) return;
    const controller = new AbortController();
    setRating({ status: "loading" });
    void loadGuardianDragonRating(initData, page, controller.signal)
      .then((data) => setRating({ status: "ready", data }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setRating({ status: "error" });
      });
    return () => controller.abort();
  }, [page, attempt]);

  async function send() {
    const initData = getTelegramInitData();
    if (!initData || pending) return;
    setPending(true);
    setNotice(null);
    try {
      const response = await fightGuardianDragon(initData, price);
      setResult(response.result);
      onDragon(response.dragon);
      onGoldChange(response.result.playerGold);
      setAttempt((value) => value + 1);
    } catch (error) {
      const code = error instanceof GuardianDragonApiError ? error.code : null;
      setNotice(code === "insufficient_gold" ? "Недостатньо золота для боїв." : code === "price_changed" ? "Ціна боїв змінилася. Перевірте її ще раз." : "Дію не виконано. Оновіть дані та спробуйте ще раз.");
      onRefresh();
    } finally {
      setPending(false);
    }
  }

  const data = rating.status === "ready" ? rating.data : null;
  const viewerOnPage = Boolean(data?.viewer && data.rows.some((row) => row.place === data.viewer?.place));
  return <>
    <p className="deck-note deck-note--info weak-cards-intro">Ваш дракон б’ється з драконами інших магів і підвищує майстерність у кожній битві. Рейтинг драконів росте за перемоги.</p>
    <p className="deck-note weak-cards-intro"><strong>{fights.place ? `Майстерність дракона: ${dragon.mastery} (${formatUiNumber(fights.place)} місце)` : `Майстерність дракона: ${dragon.mastery}`}</strong></p>
    {fightsArtMissing ? null : <span className="guardian-dragon__fights-art"><ElementArt alt="Битва драконів" element="air" onError={() => setFightsArtMissing(true)} src={FIGHTS_ART} /><span aria-hidden="true" className="guardian-dragon__lightning" /></span>}
    <div className="guardian-dragon__hike">
      {freeReady
        ? <button className="guardian-dragon__button" data-ready={locked ? undefined : ""} disabled={locked || pending} onClick={() => { void send(); }} type="button">{`${fights.freeFights} боїв безкоштовно`}</button>
        : <button className="guardian-dragon__button" disabled={locked || pending} onClick={() => { void send(); }} type="button"><span className="guardian-dragon__price"><span>{`${fights.fightsPerPaidSend} боїв`}</span><CurrencyIcon kind="gold" size={14} /><span>{formatUiNumber(fights.nextPaidPrice)}</span></span></button>}
      {!freeReady && fights.cooldownUntil ? <small className="guardian-dragon__caption">{`Безкоштовні бої через ${formatLeft(fights.cooldownUntil, now)}`}</small> : null}
    </div>
    {result ? <p className="deck-note weak-cards-intro" role="status">{`Боїв: ${result.fights}, перемог: ${result.wins}. Рейтинг +${formatUiNumber(result.ratingGain)}, майстерність +${result.masteryGain}.`}</p> : null}
    {notice ? <p className="deck-note deck-note--error weak-cards-intro" role="status">{notice}</p> : null}
    <p className="deck-note deck-note--info weak-cards-intro">Відправляйте дракона в битви! Б’ючись з іншими драконами, він підвищує майстерність і рейтинг.</p>

    <RibbonTitle>Рейтинг драконів</RibbonTitle>
    <div className="leaderboard-screen guardian-dragon__rating">
      <section aria-label="Рейтинг драконів" className="leaderboard-list-section">
        {rating.status === "loading" ? <div className="leaderboard-state">Завантаження рейтингу…</div> : null}
        {rating.status === "error" ? <div className="leaderboard-state leaderboard-state--error">Не вдалося завантажити рейтинг.</div> : null}
        {data && !data.rows.length ? <div className="leaderboard-state">У рейтингу драконів ще немає перемог.</div> : null}
        {data && (data.rows.length || data.viewer) ? <ol className="leaderboard-list">
          {data.rows.map((row) => <li className={row.place === data.viewer?.place ? "is-player" : undefined} key={row.playerId}>
            <span className="leaderboard-entry">
              <span className="leaderboard-entry__rank">{formatUiNumber(row.place)}</span>
              <span className="leaderboard-entry__identity"><strong>{row.displayName}</strong></span>
              <strong className="leaderboard-entry__score">{formatUiNumber(row.rating)}</strong>
            </span>
          </li>)}
          {data.viewer && !viewerOnPage ? <li className="is-player">
            <span className="leaderboard-entry">
              <span className="leaderboard-entry__rank">{data.viewer.place ? formatUiNumber(data.viewer.place) : "—"}</span>
              <span className="leaderboard-entry__identity"><strong>{data.viewer.displayName}</strong></span>
              <strong className="leaderboard-entry__score">{formatUiNumber(data.viewer.rating)}</strong>
            </span>
          </li> : null}
        </ol> : null}
        {data ? <Pagination currentPage={data.page} onPageChange={setPage} totalPages={data.totalPages} /> : null}
      </section>
    </div>
    <p className="deck-note deck-note--info weak-cards-intro">Чим вища майстерність дракона, тим більше шкоди завдасть Полум’я дракона в боях гільдії.</p>
  </>;
}

const MAGIC_ELEMENTS: readonly CardElement[] = ["fire", "water", "earth", "air"];
const MAGIC_ELEMENT_NAMES: Record<CardElement, string> = { fire: "Вогонь", water: "Вода", earth: "Земля", air: "Повітря" };
/** The flame card's painted art; hidden until the file is added. */
const FLAME_ART = "/assets/ui/guardian-dragon/flame-card.webp";

/** The flame card with its power; shared by the Magic tab and the compact dragon block on the deck screen. */
export function GuardianDragonFlameCard({ power }: { power: number }) {
  const [artMissing, setArtMissing] = useState(false);
  return <figure className="guardian-dragon__flame">
    {artMissing ? <strong className="guardian-dragon__flame-power">{formatUiNumber(power)}</strong> : <span className="guardian-dragon__flame-art"><span className="guardian-dragon__flame-pic"><ElementArt alt="Полум’я дракона" cardId="guardian_dragon" element="fire" onError={() => setArtMissing(true)} src={FLAME_ART} /></span><strong>{formatUiNumber(power)}</strong></span>}
    <figcaption>Полум’я дракона</figcaption>
  </figure>;
}

/** Reference «Магія дракона»: the flame card outside the elements, dragon magic by element and the current choice. */
export function GuardianDragonMagic({ dragon, onDragon, onGoldChange, onRefresh, locked }: { dragon: GuardianDragonView; onDragon: (next: GuardianDragonView) => void; onGoldChange: (gold: number) => void; onRefresh: () => void; locked: boolean }) {
  const [pending, setPending] = useState<"absorb" | "upgrade" | null>(null);
  const [flameNotice, setFlameNotice] = useState<{ text: string; error: boolean } | null>(null);
  const [element, setElement] = useState<CardElement | "all">("all");
  const flame = dragon.flame;
  const maxed = flame.level >= flame.maxLevel;

  async function absorb() {
    const initData = getTelegramInitData();
    if (!initData || pending) return;
    setPending("absorb");
    setFlameNotice(null);
    try {
      const response = await absorbGuardianDragonFlame(initData);
      onDragon(response.dragon);
      setFlameNotice({ text: `Поглинуто карт: ${response.consumedInstanceIds.length}. Прогрес рівня оновлено.`, error: false });
    } catch (error) {
      const code = error instanceof GuardianDragonApiError ? error.code : null;
      setFlameNotice({ text: code === "nothing_to_absorb" ? "Немає слабких карт, що поміщаються в поточний рівень." : "Дію не виконано. Оновіть дані та спробуйте ще раз.", error: true });
      onRefresh();
    } finally {
      setPending(null);
    }
  }

  async function upgrade() {
    const initData = getTelegramInitData();
    if (!initData || pending || flame.upgradePrice === null) return;
    setPending("upgrade");
    setFlameNotice(null);
    try {
      const response = await upgradeGuardianDragonFlame(initData, flame.upgradePrice);
      onDragon(response.dragon);
      onGoldChange(response.playerGold);
      setFlameNotice({ text: `Полум’я дракона досягло ${response.dragon.flame.level} рівня.`, error: false });
    } catch (error) {
      const code = error instanceof GuardianDragonApiError ? error.code : null;
      setFlameNotice({ text: code === "insufficient_gold" ? "Недостатньо золота для покращення." : code === "price_changed" ? "Ціна покращення змінилася. Перевірте її ще раз." : "Дію не виконано. Оновіть дані та спробуйте ще раз.", error: true });
      onRefresh();
    } finally {
      setPending(null);
    }
  }

  const flameCard = <GuardianDragonFlameCard power={flame.power} />;
  return <>
    <p className="deck-note deck-note--info weak-cards-intro">Покращуйте Полум’я дракона й Магію дракона та беріть потрібну магію з собою в бої Турніру й Війни гільдій.</p>
    <RibbonTitle>Полум’я дракона (поза стихіями)</RibbonTitle>
    {flameCard}
    <p className="deck-note weak-cards-intro">{`Рівень ${flame.level} · сила ${formatUiNumber(flame.power)} · на ${flame.maxLevel} рівні ${formatUiNumber(flame.powerAtMaxLevel)}`}</p>
    {maxed ? <p className="deck-note deck-note--info weak-cards-intro">Досягнуто максимального рівня.</p> : <>
      <div className="guardian-dragon__progress">
        <span aria-label="Прогрес рівня" aria-valuemax={100} aria-valuemin={0} aria-valuenow={flame.progressPercent} className="guardian-dragon__rail" role="progressbar"><span style={{ width: `${Math.min(100, flame.progressPercent)}%` }} /></span>
      </div>
      <div className="guardian-dragon__hikes guardian-dragon__hikes--pair">
        <div className="guardian-dragon__hike-option">
          <button className="guardian-dragon__button" disabled={locked || pending !== null || flame.absorbableCards === 0} onClick={() => { void absorb(); }} type="button">{pending === "absorb" ? "Поглинання…" : "Поглинути слабкі"}</button>
          <small>{flame.absorbableCards ? `Карт: ${flame.absorbableCards} · прогрес +${formatUiNumber(flame.absorbGainPercent)}%` : "Слабких карт немає"}</small>
        </div>
        <div className="guardian-dragon__hike-option">
          <button className="guardian-dragon__button" data-ready={!locked && flame.upgradeReady ? "" : undefined} disabled={locked || pending !== null || !flame.upgradeReady} onClick={() => { void upgrade(); }} type="button">{pending === "upgrade" ? "Підвищення…" : "Підняти рівень"}</button>
          <small className="guardian-dragon__price">{flame.upgradePowerGain === null ? null : <span>{`Сила +${formatUiNumber(flame.upgradePowerGain)}`}</span>}<CurrencyIcon kind="gold" size={14} /><span>{formatUiNumber(flame.upgradePrice ?? 0)}</span></small>
        </div>
      </div>
    </>}
    {flameNotice ? <p className={flameNotice.error ? "deck-note deck-note--error weak-cards-intro" : "deck-note weak-cards-intro"} role="status">{flameNotice.text}</p> : null}
    {flame.dragonFans || flame.dragonWhisperers ? <p className="deck-note deck-note--info weak-cards-intro">{[flame.dragonFans ? "«Любителі драконів»: майстерність +10" : null, flame.dragonWhisperers ? "«Приборкувачки драконів»: шкода ×2" : null].filter(Boolean).join(" · ")}</p> : null}

    <RibbonTitle>Магія дракона</RibbonTitle>
    <div aria-label="Стихія магії дракона" className="guardian-dragon__elements">
      <button aria-label="Уся магія" aria-pressed={element === "all"} className={element === "all" ? "guardian-dragon__element is-active" : "guardian-dragon__element"} onClick={() => setElement("all")} type="button"><ElementSymbol element="all" size={22} /></button>
      {MAGIC_ELEMENTS.map((value) => <button aria-label={`Магія стихії ${MAGIC_ELEMENT_NAMES[value]}`} aria-pressed={element === value} className={element === value ? "guardian-dragon__element is-active" : "guardian-dragon__element"} key={value} onClick={() => setElement(value)} type="button"><ElementSymbol element={value} size={22} /></button>)}
    </div>
    <p className="deck-note deck-note--info weak-cards-intro">{element === "all" ? "Магії дракона поки немає." : `Магії дракона стихії «${MAGIC_ELEMENT_NAMES[element]}» поки немає.`}</p>

    <RibbonTitle>Поточний вибір</RibbonTitle>
    <div aria-label="Поточний вибір магії" className="guardian-dragon__slots">
      <span className="deck-note guardian-dragon__slot">Додати магію</span>
      {flameCard}
      <span className="deck-note guardian-dragon__slot">Додати магію</span>
    </div>
    <p className="deck-note weak-cards-intro">Магія дракона ще не діє в боях Турніру й Війни гільдій.</p>
  </>;
}
