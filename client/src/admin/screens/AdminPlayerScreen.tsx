import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { AdminAuditResponse, AdminCardDefinitionItem, AdminCurrency, AdminPlayerDetailResponse } from "@cardastika/shared";
import { CurrencyIcon } from "../../components/CurrencyDisplay";
import {
  AdminApiError,
  changeAdminPlayerCurrency,
  changeAdminPlayerLevel,
  grantAdminPlayerCards,
  loadAdminAudit,
  loadAdminCards,
  loadAdminPlayer,
  removeAdminPlayerCard,
} from "../adminApi";
import { AdminAuditDiff } from "../AdminAuditDiff";
import {
  elementLabels,
  formatAction,
  formatDate,
  formatLastSeen,
  formatNumber,
  formatPercent,
  guildRoleLabels,
  initials,
  playerName,
  providerLabels,
  rarityLabels,
} from "../adminFormat";
import { useAdminFeedback } from "../AdminFeedback";
import { AdminPagination } from "../AdminPagination";
import { AdminEmpty, AdminError, AdminLoading } from "../AdminStates";

type Tab = "overview" | "deck" | "cards" | "history";

const CURRENCY_PRESETS: Record<AdminCurrency, number[]> = {
  gold: [10, 50, 100, 500],
  silver: [100, 1_000, 10_000, 100_000],
};

function CurrencyEditor({ currency, current, disabled, onChange }: {
  currency: AdminCurrency;
  current: number;
  disabled: boolean;
  onChange: (currency: AdminCurrency, delta: number) => void;
}) {
  const [amount, setAmount] = useState("");
  const label = currency === "silver" ? "Срібло" : "Золото";
  const parsed = Number(amount);
  const valid = amount !== "" && Number.isSafeInteger(parsed) && parsed > 0;
  const submit = (sign: 1 | -1) => { if (valid) { onChange(currency, parsed * sign); setAmount(""); } };
  return (
    <article className="admin-balance">
      <div className="admin-balance__top">
        <CurrencyIcon kind={currency} size={34} />
        <div><small>{label}</small><strong>{formatNumber(current)}</strong></div>
      </div>
      <div className="admin-presets" aria-label={`Швидкі суми: ${label}`}>
        {CURRENCY_PRESETS[currency].map((preset) => <button disabled={disabled} key={preset} onClick={() => setAmount(String(preset))} type="button">{formatNumber(preset)}</button>)}
      </div>
      <div className="admin-balance__row">
        <input aria-label={`Сума зміни: ${label}`} className="admin-input" disabled={disabled} inputMode="numeric" min="1" onChange={(event) => setAmount(event.target.value)} placeholder="Сума" type="number" value={amount} />
        <button className="admin-button admin-button--good" disabled={disabled || !valid} onClick={() => submit(1)} type="button">+ Додати</button>
        <button className="admin-button admin-button--danger-soft" disabled={disabled || !valid || parsed > current} onClick={() => submit(-1)} title={parsed > current ? "Не можна зняти більше, ніж є" : undefined} type="button">− Зняти</button>
      </div>
    </article>
  );
}

function GrantCardForm({ disabled, onGrant }: { disabled: boolean; onGrant: (card: AdminCardDefinitionItem, quantity: number, level: number) => void }) {
  const [search, setSearch] = useState("");
  const [cards, setCards] = useState<AdminCardDefinitionItem[]>([]);
  const [cardId, setCardId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [level, setLevel] = useState("1");
  useEffect(() => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      void loadAdminCards({ search, page: 1, limit: 50, sort: "name", direction: "asc" }, controller.signal)
        .then((result) => {
          setCards(result.cards);
          setCardId((current) => result.cards.some(({ id }) => id === current) ? current : result.cards[0]?.id ?? "");
        })
        .catch(() => undefined);
    }, 250);
    return () => { window.clearTimeout(timeoutId); controller.abort(); };
  }, [search]);
  const selected = cards.find(({ id }) => id === cardId);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const parsedQuantity = Number(quantity);
    const parsedLevel = Number(level);
    if (!selected || !Number.isSafeInteger(parsedQuantity) || !Number.isSafeInteger(parsedLevel) || parsedQuantity < 1 || parsedLevel < 1) return;
    onGrant(selected, parsedQuantity, parsedLevel);
  };
  return (
    <form className="admin-grant" onSubmit={submit}>
      <label className="admin-field"><span>Пошук карти</span><input disabled={disabled} onChange={(event) => setSearch(event.target.value)} placeholder="Назва або код" type="search" value={search} /></label>
      <label className="admin-field"><span>Карта {cards.length ? <span className="admin-muted">({cards.length})</span> : null}</span><select disabled={disabled || cards.length === 0} onChange={(event) => setCardId(event.target.value)} value={cardId}>{cards.map((card) => <option key={card.id} value={card.id}>{card.displayName ?? card.code} · {elementLabels[card.element]}</option>)}</select></label>
      <label className="admin-field"><span>Кількість</span><input disabled={disabled} inputMode="numeric" max="20" min="1" onChange={(event) => setQuantity(event.target.value)} type="number" value={quantity} /></label>
      <label className="admin-field"><span>Рівень</span><input disabled={disabled} inputMode="numeric" max="50" min="1" onChange={(event) => setLevel(event.target.value)} type="number" value={level} /></label>
      <button className="admin-button" disabled={disabled || !cardId} type="submit">+ Видати</button>
    </form>
  );
}

function PlayerHistory({ playerId, refreshKey }: { playerId: string; refreshKey: number }) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AdminAuditResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    void loadAdminAudit({ entityId: playerId, page, limit: 20 }, controller.signal)
      .then(setData)
      .catch((requestError: unknown) => {
        if (requestError instanceof Error && requestError.name === "AbortError") return;
        setError(requestError instanceof Error ? requestError.message : "Невідома помилка");
      });
    return () => controller.abort();
  }, [page, playerId, refreshKey]);
  if (error) return <AdminError message={error} />;
  if (!data) return <AdminLoading />;
  if (data.logs.length === 0) return <AdminEmpty message="Адміністратори ще не змінювали цей акаунт." title="Історія порожня" />;
  return (
    <>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead><tr><th>Час</th><th>Дія</th><th>Зміни</th><th>Адмін</th></tr></thead>
          <tbody>{data.logs.map((log) => (
            <tr className="admin-audit-row" key={log.id}>
              <td className="admin-td-title"><span className="admin-muted">{formatDate(log.createdAt)}</span></td>
              <td data-label="Дія"><span className="admin-badge admin-badge--accent">{formatAction(log.action)}</span></td>
              <td data-label="Зміни"><AdminAuditDiff log={log} /></td>
              <td data-label="Адмін"><span className="admin-muted">{log.adminTelegramUserId}</span></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <AdminPagination onPageChange={setPage} page={data.page} total={data.total} totalPages={data.totalPages} />
    </>
  );
}

export function AdminPlayerScreen({ onNavigate, playerId }: { onNavigate: (path: string) => void; playerId: string }) {
  const { confirm, toast } = useAdminFeedback();
  const [tab, setTab] = useState<Tab>("overview");
  const [cardPage, setCardPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [data, setData] = useState<AdminPlayerDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [levelDraft, setLevelDraft] = useState("1");
  const [cardFilter, setCardFilter] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void loadAdminPlayer(playerId, cardPage, controller.signal)
      .then((result) => {
        setData(result);
        setLevelDraft(String(result.player.level));
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof Error && requestError.name === "AbortError") return;
        setError(requestError instanceof AdminApiError ? requestError.message : "Невідома помилка");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [cardPage, playerId, refreshKey]);

  const runMutation = useCallback(async (operation: () => Promise<{ message: string }>) => {
    setPending(true);
    try {
      const result = await operation();
      toast("success", result.message);
      setRefreshKey((key) => key + 1);
    } catch (mutationError) {
      toast("error", mutationError instanceof Error ? mutationError.message : "Операцію не виконано");
    } finally {
      setPending(false);
    }
  }, [toast]);

  const name = data ? playerName(data.player) : "";

  const handleCurrency = async (currency: AdminCurrency, delta: number) => {
    const currencyName = currency === "silver" ? "срібла" : "золота";
    const ok = await confirm({
      title: delta > 0 ? `Додати ${currencyName}?` : `Зняти ${currencyName}?`,
      message: `${name}: ${delta > 0 ? "+" : "−"}${formatNumber(Math.abs(delta))} ${currencyName}. Дію буде записано в журнал.`,
      confirmLabel: delta > 0 ? "Додати" : "Зняти",
      danger: delta < 0,
    });
    if (ok) void runMutation(() => changeAdminPlayerCurrency(playerId, currency, delta));
  };
  const handleLevel = async () => {
    const level = Number(levelDraft);
    if (!Number.isSafeInteger(level) || level < 1 || level > 120) { toast("error", "Рівень має бути від 1 до 120."); return; }
    if (await confirm({ title: "Змінити рівень?", message: `${name}: рівень ${data?.player.level} → ${level}.`, confirmLabel: "Зберегти" })) {
      void runMutation(() => changeAdminPlayerLevel(playerId, level));
    }
  };
  const handleGrant = async (card: AdminCardDefinitionItem, quantity: number, level: number) => {
    if (await confirm({ title: "Видати карту?", message: `«${card.displayName ?? card.code}» × ${quantity}, рівень ${level} → ${name}.`, confirmLabel: "Видати" })) {
      void runMutation(() => grantAdminPlayerCards(playerId, card.id, quantity, level));
    }
  };
  const handleRemove = async (instanceId: string, cardName: string, inDeck: boolean) => {
    const ok = await confirm({
      title: "Видалити карту?",
      message: `«${cardName}» буде видалено з інвентарю.${inDeck ? " Карта в колоді — колоду перебудує сервер; якщо це неможливо, операцію буде скасовано." : ""}`,
      confirmLabel: "Видалити",
      danger: true,
    });
    if (ok) void runMutation(() => removeAdminPlayerCard(playerId, instanceId));
  };
  const copy = async (value: string, label: string) => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard_unavailable");
      await navigator.clipboard.writeText(value);
      toast("success", `${label} скопійовано.`);
    } catch {
      toast("error", "Не вдалося скопіювати. Виділіть текст вручну.");
    }
  };

  const deckPower = useMemo(() => data?.deck.reduce((sum, card) => sum + card.finalPower, 0) ?? 0, [data?.deck]);
  const visibleCards = useMemo(() => {
    const query = cardFilter.trim().toLowerCase();
    if (!data || !query) return data?.cards ?? [];
    return data.cards.filter((card) => `${card.displayName ?? ""} ${card.code} ${elementLabels[card.element]} ${rarityLabels[card.rarity]}`.toLowerCase().includes(query));
  }, [cardFilter, data]);

  if (loading && !data) return <AdminLoading label="Завантажуємо профіль гравця…" />;
  if (error && !data) return <div className="admin-page"><button className="admin-back" onClick={() => onNavigate("/admin/players")} type="button">← Гравці</button><AdminError message={error} onRetry={() => setRefreshKey((key) => key + 1)} /></div>;
  if (!data) return null;

  const { player, stats } = data;
  const duels = stats.duelsWon + stats.duelsLost;
  const tabs: Array<{ count?: number; id: Tab; label: string }> = [
    { id: "overview", label: "Огляд" },
    { count: data.deck.length, id: "deck", label: "Колода" },
    { count: data.cardsPagination.total, id: "cards", label: "Карти" },
    { id: "history", label: "Історія змін" },
  ];

  return (
    <div className="admin-page">
      <button className="admin-back" onClick={() => onNavigate("/admin/players")} type="button">← Гравці</button>

      <header className="admin-profile">
        <span className="admin-avatar admin-avatar--lg">{initials(name)}</span>
        <div className="admin-profile__name">
          <h1>{name}</h1>
          <p>
            {player.isOnline ? <span className="admin-badge admin-badge--good"><i className="admin-dot admin-dot--online" />Онлайн</span> : <span className="admin-badge">Був(ла) {formatLastSeen(player.lastSeenAt)}</span>}
            {player.username ? <span>@{player.username}</span> : null}
            {player.telegramUserId ? <button className="admin-link" onClick={() => { void copy(player.telegramUserId!, "Telegram ID"); }} title="Скопіювати Telegram ID" type="button">TG {player.telegramUserId}</button> : null}
            <span className="admin-id"><code title={player.id}>{player.id}</code><button onClick={() => { void copy(player.id, "ID гравця"); }} type="button">Копіювати</button></span>
          </p>
        </div>
        <button className="admin-button admin-button--secondary" disabled={loading} onClick={() => setRefreshKey((key) => key + 1)} type="button">{loading ? <span className="admin-spinner" /> : "↻"} Оновити</button>
      </header>

      <section aria-label="Показники гравця" className="admin-kpis admin-kpis--compact">
        <article className="admin-kpi"><span className="admin-kpi__label">Рівень</span><strong className="admin-kpi__value">{player.level}</strong></article>
        <article className="admin-kpi"><span className="admin-kpi__label">Срібло</span><strong className="admin-kpi__value">{formatNumber(player.silver)}</strong></article>
        <article className="admin-kpi"><span className="admin-kpi__label">Золото</span><strong className="admin-kpi__value">{formatNumber(player.gold)}</strong></article>
        <article className="admin-kpi"><span className="admin-kpi__label">Карт</span><strong className="admin-kpi__value">{formatNumber(data.cardsPagination.total)}</strong><span className="admin-kpi__hint">сила колоди {formatNumber(deckPower)}</span></article>
        <article className="admin-kpi"><span className="admin-kpi__label">Дуелі</span><strong className="admin-kpi__value">{formatNumber(duels)}</strong><span className="admin-kpi__hint">{duels ? `${formatNumber(stats.duelsWon)} перемог · ${formatPercent(stats.duelsWon, duels)}` : "ще не грав(ла)"}</span></article>
      </section>

      <div aria-label="Розділи профілю" className="admin-tabs" role="tablist">
        {tabs.map((item) => <button aria-selected={tab === item.id} key={item.id} onClick={() => setTab(item.id)} role="tab" type="button">{item.label}{item.count !== undefined ? <small>{formatNumber(item.count)}</small> : null}</button>)}
      </div>

      {tab === "overview" ? (
        <div className="admin-grid admin-grid--wide-left">
          <section className="admin-panel">
            <div className="admin-panel__head"><div><h2>Баланс</h2><p>Кожна зміна потребує підтвердження та потрапляє в журнал.</p></div></div>
            <div className="admin-grid admin-grid--2">
              <CurrencyEditor currency="silver" current={player.silver} disabled={pending} onChange={(currency, delta) => { void handleCurrency(currency, delta); }} />
              <CurrencyEditor currency="gold" current={player.gold} disabled={pending} onChange={(currency, delta) => { void handleCurrency(currency, delta); }} />
            </div>
          </section>
          <div className="admin-grid">
            <section className="admin-panel">
              <div className="admin-panel__head"><div><h2>Рівень акаунта</h2><p>Від 1 до 120. Досвід зберігається в межах нового рівня.</p></div></div>
              <div className="admin-stepper">
                <button aria-label="Мінус рівень" className="admin-button admin-button--secondary admin-button--icon" disabled={pending} onClick={() => setLevelDraft((value) => String(Math.max(1, Number(value) - 1)))} type="button">−</button>
                <input aria-label="Новий рівень" className="admin-input" disabled={pending} inputMode="numeric" max="120" min="1" onChange={(event) => setLevelDraft(event.target.value)} type="number" value={levelDraft} />
                <button aria-label="Плюс рівень" className="admin-button admin-button--secondary admin-button--icon" disabled={pending} onClick={() => setLevelDraft((value) => String(Math.min(120, Number(value) + 1)))} type="button">+</button>
                <button className="admin-button" disabled={pending || Number(levelDraft) === player.level} onClick={() => { void handleLevel(); }} type="button">Зберегти</button>
              </div>
            </section>
            <section className="admin-panel">
              <div className="admin-panel__head"><div><h2>Акаунт</h2></div></div>
              <dl className="admin-facts">
                <div><dt>Гільдія</dt><dd>{stats.guild ? stats.guild.name : "—"}{stats.guild ? <small>{guildRoleLabels[stats.guild.role] ?? stats.guild.role}</small> : <small>не в гільдії</small>}</dd></div>
                <div><dt>Вхід через</dt><dd>{stats.authProviders.length ? stats.authProviders.map((provider) => providerLabels[provider] ?? provider).join(", ") : "—"}</dd></div>
                <div><dt>Реєстрація</dt><dd>{formatDate(player.createdAt)}</dd></div>
                <div><dt>Остання дуель</dt><dd>{stats.lastDuelAt ? formatLastSeen(stats.lastDuelAt) : "—"}</dd></div>
              </dl>
            </section>
          </div>
        </div>
      ) : null}

      {tab === "deck" ? (
        <section className="admin-panel">
          <div className="admin-panel__head"><div><h2>Активна колода</h2><p>{data.deck.length}/9 карт · сила {formatNumber(deckPower)} · колоду автоматично перебудовує сервер</p></div></div>
          {data.deck.length === 0 ? <AdminEmpty message="Колода ще не сформована." title="Колода порожня" /> : (
            <div className="admin-deck">{data.deck.map((card) => (
              <article className="admin-deck__card" key={card.instanceId}>
                <span className="admin-deck__slot">{card.slot}</span>
                <div><strong>{card.displayName ?? card.code}</strong><small><span className={`admin-rarity admin-rarity--${card.rarity}`}>{rarityLabels[card.rarity]}</span> · {elementLabels[card.element]} · рів. {card.level}</small></div>
                <b>{formatNumber(card.finalPower)}</b>
              </article>
            ))}</div>
          )}
        </section>
      ) : null}

      {tab === "cards" ? (
        <>
          <section className="admin-panel">
            <div className="admin-panel__head"><div><h2>Видати карту</h2><p>Рідкість визначає сервер за рівнем карти, як і в грі.</p></div></div>
            <GrantCardForm disabled={pending} onGrant={(card, quantity, level) => { void handleGrant(card, quantity, level); }} />
          </section>
          <section className="admin-panel admin-panel--flush">
            <div className="admin-panel__head">
              <div><h2>Інвентар</h2><p>{formatNumber(data.cardsPagination.total)} екземплярів · спочатку карти з колоди</p></div>
              <input aria-label="Фільтр карт на сторінці" className="admin-input" onChange={(event) => setCardFilter(event.target.value)} placeholder="Фільтр на сторінці…" style={{ maxWidth: 240 }} type="search" value={cardFilter} />
            </div>
            {data.cards.length === 0 ? <AdminEmpty message="У цього гравця немає карт." title="Інвентар порожній" /> : (
              <>
                <div className={`admin-table-wrap${loading ? " admin-table-wrap--updating" : ""}`}>
                  <table className="admin-table">
                    <thead><tr><th>Карта</th><th>Рідкість</th><th>Стихія</th><th className="is-num">Рівень</th><th className="is-num">Сила</th><th>Стан</th><th><span className="admin-sr-only">Дія</span></th></tr></thead>
                    <tbody>{visibleCards.map((card) => (
                      <tr key={card.instanceId}>
                        <td className="admin-td-title"><span className="admin-cell-main"><strong>{card.displayName ?? card.code}</strong><small>{card.code}</small></span></td>
                        <td data-label="Рідкість"><span className={`admin-rarity admin-rarity--${card.rarity}`}>{rarityLabels[card.rarity]}</span></td>
                        <td data-label="Стихія"><span className="admin-element"><i className={`admin-fill--${card.element}`} />{elementLabels[card.element]}</span></td>
                        <td className="is-num" data-label="Рівень">{card.level}</td>
                        <td className="is-num" data-label="Сила"><strong>{formatNumber(card.finalPower)}</strong>{card.bonusPower ? <span className="admin-muted"> (+{formatNumber(card.bonusPower)})</span> : null}</td>
                        <td data-label="Стан">{card.inDeck ? <span className="admin-badge admin-badge--accent">Колода · слот {card.slot}</span> : <span className="admin-muted">Інвентар</span>}</td>
                        <td className="admin-td-actions"><button className="admin-button admin-button--danger-soft admin-button--sm" disabled={pending} onClick={() => { void handleRemove(card.instanceId, card.displayName ?? card.code, card.inDeck); }} type="button">Видалити</button></td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
                {visibleCards.length === 0 ? <AdminEmpty message="На цій сторінці немає карт, що відповідають фільтру." /> : null}
                <AdminPagination onPageChange={setCardPage} page={data.cardsPagination.page} total={data.cardsPagination.total} totalPages={data.cardsPagination.totalPages} />
              </>
            )}
          </section>
        </>
      ) : null}

      {tab === "history" ? (
        <section className="admin-panel admin-panel--flush">
          <div className="admin-panel__head"><div><h2>Історія змін</h2><p>Усі дії адміністраторів щодо цього гравця</p></div></div>
          <PlayerHistory playerId={playerId} refreshKey={refreshKey} />
        </section>
      ) : null}
    </div>
  );
}
