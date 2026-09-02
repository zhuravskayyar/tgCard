import { useEffect, useState } from "react";
import { GUILD_CONFIG, type CreateGuildRequest, type GuildLanguage, type GuildListResponse, type GuildRecruitmentMode } from "@cardastika/shared";
import { AppIcon } from "../../components/AppIcon";
import { loadGuildList } from "../../telegram/guild";
import { GuildEmblem, GuildState, LANGUAGE_LABELS, MODE_LABELS, formatNumber, guildErrorMessage, type AsyncState } from "./GuildUi";

export function GuildDirectory({ onOpen }: { onOpen: (id: string) => void }) {
  const [search, setSearch] = useState("");
  const [hasSpace, setHasSpace] = useState(false);
  const [query, setQuery] = useState({ name: "", hasSpace: false, page: 1 });
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<AsyncState<GuildListResponse>>({ status: "loading" });

  useEffect(() => {
    let active = true;
    setState({ status: "loading" });
    const params = new URLSearchParams({ page: String(query.page) });
    if (query.name) params.set("name", query.name);
    if (query.hasSpace) params.set("hasSpace", "true");
    void loadGuildList(params.toString()).then((data) => { if (active) setState({ status: "ready", data }); }).catch((error: unknown) => { if (active) setState({ status: "error", message: guildErrorMessage(error) }); });
    return () => { active = false; };
  }, [query, attempt]);

  return <section className="guild-directory" aria-label="Каталог гільдій">
    <form className="guild-search" onSubmit={(event) => { event.preventDefault(); setQuery({ name: search.trim(), hasSpace, page: 1 }); }}>
      <div><input aria-label="Пошук за назвою" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Назва гільдії" /><button className="guild-secondary-button" aria-label="Шукати" type="submit"><AppIcon name="chevron" size={18} /></button></div>
      <label className="guild-checkbox"><input type="checkbox" checked={hasSpace} onChange={(event) => { setHasSpace(event.target.checked); setQuery({ name: search.trim(), hasSpace: event.target.checked, page: 1 }); }} />Є вільні місця</label>
    </form>
    {state.status === "loading" ? <GuildState>Завантаження списку…</GuildState> : state.status === "error" ? <GuildState error onRetry={() => setAttempt((value) => value + 1)}>{state.message}</GuildState> : <>
      <div className="guild-section-heading"><h2>Гільдії</h2><span>{state.data.totalEntries}</span></div>
      {state.data.entries.length === 0 ? <GuildState>Гільдій за цим запитом не знайдено. Спробуйте іншу назву або приберіть фільтр.</GuildState> : <div className="guild-list">{state.data.entries.map((guild) => <button className="guild-list-row" key={guild.id} type="button" onClick={() => onOpen(guild.id)}>
        <GuildEmblem emblemId={guild.emblemId} />
        <span className="guild-list-row__body"><strong>{guild.name}</strong><small>{guild.isFull ? "Місць немає" : MODE_LABELS[guild.recruitmentMode]} · {LANGUAGE_LABELS[guild.language]}</small><span>Рів. {guild.level} · {guild.memberCount}/{guild.memberCapacity} учасників · {formatNumber(guild.activityScore)} XP</span></span>
        <AppIcon name="chevron" size={16} />
      </button>)}</div>}
      {state.data.totalPages > 1 ? <nav className="guild-pagination" aria-label="Сторінки каталогу гільдій">
        <button className="guild-secondary-button" disabled={state.data.page <= 1} onClick={() => setQuery((value) => ({ ...value, page: value.page - 1 }))} type="button">Назад</button>
        <span>{state.data.page} / {state.data.totalPages}</span>
        <button className="guild-secondary-button" disabled={state.data.page >= state.data.totalPages} onClick={() => setQuery((value) => ({ ...value, page: value.page + 1 }))} type="button">Далі</button>
      </nav> : null}
    </>}
  </section>;
}

export function GuildCreateForm({ busy, silver, onCreate }: { busy: boolean; silver: number; onCreate: (input: CreateGuildRequest) => void }) {
  const [form, setForm] = useState<CreateGuildRequest>({ name: "", description: "", language: "uk", recruitmentMode: "open" });
  const affordable = silver >= GUILD_CONFIG.creationCostSilver;
  return <form className="guild-form guild-create" onSubmit={(event) => { event.preventDefault(); onCreate(form); }}>
    <p className="guild-helper">Вартість створення: <strong>{formatNumber(GUILD_CONFIG.creationCostSilver)} срібла</strong>. Ви станете лідером нової гільдії.</p>
    <label>Назва<input required minLength={GUILD_CONFIG.nameMinLength} maxLength={GUILD_CONFIG.nameMaxLength} value={form.name} onChange={(event) => setForm((value) => ({ ...value, name: event.target.value }))} autoComplete="off" /></label>
    <label>Опис<textarea rows={3} maxLength={GUILD_CONFIG.descriptionMaxLength} value={form.description} onChange={(event) => setForm((value) => ({ ...value, description: event.target.value }))} /></label>
    <div className="guild-form__columns">
      <label>Мова<select value={form.language} onChange={(event) => setForm((value) => ({ ...value, language: event.target.value as GuildLanguage }))}>{Object.entries(LANGUAGE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label>Набір<select value={form.recruitmentMode} onChange={(event) => setForm((value) => ({ ...value, recruitmentMode: event.target.value as GuildRecruitmentMode }))}>{Object.entries(MODE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
    </div>
    {!affordable ? <GuildState>Недостатньо срібла. Потрібно ще {formatNumber(GUILD_CONFIG.creationCostSilver - silver)}.</GuildState> : null}
    <button className="guild-primary-button" disabled={busy || !affordable} type="submit">{busy ? "Створення…" : `Створити · ${formatNumber(GUILD_CONFIG.creationCostSilver)} срібла`}</button>
  </form>;
}
