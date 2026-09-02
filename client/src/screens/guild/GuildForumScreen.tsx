import { useEffect, useState, type FormEvent } from "react";
import type { GuildForumIndexResponse, GuildForumSectionResponse, GuildForumTopicResponse } from "@cardastika/shared";
import { AppIcon } from "../../components/AppIcon";
import { createGuildForumPost, createGuildForumTopic, loadGuildForum, loadGuildForumSection, loadGuildForumTopic } from "../../telegram/guild";
import { GuildRoleBadge, GuildState, formatDate, guildErrorMessage, type AsyncState } from "./GuildUi";

interface GuildForumScreenProps { busy: boolean; guildId: string; guildName: string; onBack: () => void; }
type ForumView = { kind: "index" } | { kind: "section"; id: string } | { kind: "topic"; id: string; sectionId: string };

export function GuildForumScreen({ busy, guildId, guildName, onBack }: GuildForumScreenProps) {
  const [view, setView] = useState<ForumView>({ kind: "index" });
  const [indexState, setIndexState] = useState<AsyncState<GuildForumIndexResponse>>({ status: "loading" });
  const [sectionState, setSectionState] = useState<AsyncState<GuildForumSectionResponse>>({ status: "loading" });
  const [topicState, setTopicState] = useState<AsyncState<GuildForumTopicResponse>>({ status: "loading" });
  const [sectionPage, setSectionPage] = useState(1);
  const [topicPage, setTopicPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const sectionId = view.kind === "section" ? view.id : null;
  const topicId = view.kind === "topic" ? view.id : null;

  useEffect(() => { let active = true; setIndexState({ status: "loading" }); void loadGuildForum(guildId).then((data) => { if (active) setIndexState({ status: "ready", data }); }).catch((error: unknown) => { if (active) setIndexState({ status: "error", message: guildErrorMessage(error) }); }); return () => { active = false; }; }, [guildId, refresh]);
  useEffect(() => { if (!sectionId) return; let active = true; setSectionState({ status: "loading" }); void loadGuildForumSection(guildId, sectionId, sectionPage).then((data) => { if (active) setSectionState({ status: "ready", data }); }).catch((error: unknown) => { if (active) setSectionState({ status: "error", message: guildErrorMessage(error) }); }); return () => { active = false; }; }, [guildId, sectionId, sectionPage, refresh]);
  useEffect(() => { if (!topicId) return; let active = true; setTopicState({ status: "loading" }); void loadGuildForumTopic(guildId, topicId, topicPage).then((data) => { if (active) setTopicState({ status: "ready", data }); }).catch((error: unknown) => { if (active) setTopicState({ status: "error", message: guildErrorMessage(error) }); }); return () => { active = false; }; }, [guildId, topicId, topicPage, refresh]);

  const heading = view.kind === "index" ? "Форум гільдії" : view.kind === "section" && sectionState.status === "ready" ? sectionState.data.section.title : view.kind === "topic" && topicState.status === "ready" ? topicState.data.title : "Форум";
  const goBack = () => { if (view.kind === "index") onBack(); else if (view.kind === "section") setView({ kind: "index" }); else setView(view.sectionId ? { kind: "section", id: view.sectionId } : { kind: "index" }); };

  return <section className="guild-forum" aria-label={`${heading} — ${guildName}`}>
    <div className="guild-forum__toolbar"><button className="guild-icon-button" aria-label={view.kind === "index" ? "До гільдії" : "Назад"} disabled={busy} onClick={goBack} type="button"><AppIcon name="chevron" size={18} /></button><div><strong>{heading}</strong><small>{guildName}</small></div><button className="guild-icon-button" aria-label="Оновити форум" disabled={busy} onClick={() => setRefresh((value) => value + 1)} type="button"><AppIcon name="refresh" size={17} /></button></div>
    {view.kind === "index" ? <ForumIndex state={indexState} onSection={(id) => { setSectionPage(1); setView({ kind: "section", id }); }} /> : null}
    {view.kind === "section" ? <ForumSection state={sectionState} guildId={guildId} onPage={setSectionPage} onTopic={(id, parentId) => { setTopicPage(1); setView({ kind: "topic", id, sectionId: parentId }); }} onCreated={(id, parentId) => { setTopicPage(1); setView({ kind: "topic", id, sectionId: parentId }); }} /> : null}
    {view.kind === "topic" ? <ForumTopic state={topicState} busy={busy} guildId={guildId} onPage={setTopicPage} onPosted={(data) => setTopicState({ status: "ready", data })} /> : null}
  </section>;
}

function ForumIndex({ state, onSection }: { state: AsyncState<GuildForumIndexResponse>; onSection: (id: string) => void }) {
  if (state.status === "loading") return <GuildState>Завантаження форуму…</GuildState>;
  if (state.status === "error") return <GuildState error>{state.message}</GuildState>;
  return <div className="guild-forum__content"><div className="guild-forum__intro"><span className="guild-forum__sigil"><AppIcon name="collection" size={24} /></span><div><strong>Місце, де гільдія звучить</strong><p>Публічні новини для гостей і внутрішні плани для своїх.</p></div></div><div className="guild-forum__sections">{state.data.sections.map((section) => { const locked = section.visibility === "private" && !state.data.viewer.isMember; return <button className={`guild-forum-section${locked ? " guild-forum-section--locked" : ""}`} key={section.id} aria-label={locked ? `${section.title}: доступ лише учасникам` : section.title} disabled={locked} onClick={() => onSection(section.id)} type="button"><span className="guild-forum-section__icon"><AppIcon name={section.visibility === "private" ? "lock" : "mail"} size={19} /></span><span><strong>{section.title}</strong><small>{section.description}</small></span><span className="guild-forum-section__meta">{locked ? <AppIcon name="lock" size={13} /> : `${section.topicCount}${section.unreadCount ? ` · ${section.unreadCount} нових` : ""}`}</span></button>; })}</div>{!state.data.viewer.isMember ? <p className="guild-helper">Увійдіть до гільдії, щоб створювати теми й відповідати.</p> : null}</div>;
}

function ForumSection({ state, guildId, onPage, onTopic, onCreated }: { state: AsyncState<GuildForumSectionResponse>; guildId: string; onPage: (page: number) => void; onTopic: (id: string, sectionId: string) => void; onCreated: (id: string, sectionId: string) => void }) {
  const [showForm, setShowForm] = useState(false); const [title, setTitle] = useState(""); const [body, setBody] = useState(""); const [submitting, setSubmitting] = useState(false); const [error, setError] = useState<string | null>(null);
  if (state.status === "loading") return <GuildState>Завантаження тем…</GuildState>;
  if (state.status === "error") return <GuildState error>{state.message}</GuildState>;
  const section = state.data.section;
  async function submit(event: FormEvent) { event.preventDefault(); setSubmitting(true); setError(null); try { const result = await createGuildForumTopic(guildId, section.id, title, body); onCreated(result.topic.id, section.id); } catch (cause) { setError(guildErrorMessage(cause)); } finally { setSubmitting(false); } }
  return <div className="guild-forum__content"><div className="guild-forum__section-head"><div><h2>{section.title}</h2><p>{section.description}</p></div>{state.data.totalTopics ? <span>{state.data.totalTopics} тем</span> : null}</div>{state.data.topics.length ? <div className="guild-forum__topics">{state.data.topics.map((topic) => <button className={`guild-forum-topic${topic.unread ? " guild-forum-topic--unread" : ""}`} key={topic.id} onClick={() => onTopic(topic.id, section.id)} type="button"><span className="guild-forum-topic__mark">{topic.pinned ? "★" : topic.locked ? <AppIcon name="lock" size={14} /> : <AppIcon name="mail" size={14} />}</span><span><strong>{topic.title}</strong><small>{topic.authorName} · {formatDate(topic.lastPostAt)}</small></span><span className="guild-forum-topic__replies">{topic.replyCount}</span></button>)}</div> : <div className="guild-forum__empty"><AppIcon name="collection" size={26} /><strong>Зала ще мовчить</strong><span>Створи першу тему — нехай тут почнеться історія.</span></div>}<ForumPagination page={state.data.page} totalPages={state.data.totalPages} onPage={onPage} label="Сторінки тем" />{state.data.viewer.canPost ? <button className="guild-primary-button guild-forum__new" onClick={() => setShowForm((value) => !value)} type="button">{showForm ? "Сховати форму" : "Нова тема"}</button> : <p className="guild-helper">Лише учасники гільдії можуть створювати теми.</p>}{showForm ? <form className="guild-form guild-forum__form" onSubmit={(event) => { void submit(event); }}><label>Заголовок<input minLength={3} maxLength={80} required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Наприклад: план на тиждень" /></label><label>Повідомлення<textarea maxLength={4000} required rows={5} value={body} onChange={(event) => setBody(event.target.value)} placeholder="Напиши те, що має побачити гільдія…" /></label>{error ? <p className="guild-helper guild-helper--error">{error}</p> : null}<button className="guild-secondary-button" disabled={submitting} type="submit">Опублікувати тему</button></form> : null}</div>;
}

function ForumTopic({ state, busy, guildId, onPage, onPosted }: { state: AsyncState<GuildForumTopicResponse>; busy: boolean; guildId: string; onPage: (page: number) => void; onPosted: (data: GuildForumTopicResponse) => void }) {
  const [body, setBody] = useState(""); const [submitting, setSubmitting] = useState(false); const [error, setError] = useState<string | null>(null);
  if (state.status === "loading") return <GuildState>Завантаження розмови…</GuildState>;
  if (state.status === "error") return <GuildState error>{state.message}</GuildState>;
  const topicId = state.data.topic.id;
  async function submit(event: FormEvent) { event.preventDefault(); setSubmitting(true); setError(null); try { onPosted(await createGuildForumPost(guildId, topicId, body)); setBody(""); } catch (cause) { setError(guildErrorMessage(cause)); } finally { setSubmitting(false); } }
  return <div className="guild-forum__content"><div className="guild-forum__topic-head"><h2>{state.data.title}</h2><span>{state.data.totalPosts} повідомлень</span></div><div className="guild-forum__posts">{state.data.posts.map((post) => <article className="guild-forum-post" key={post.id}><div className="guild-forum-post__meta"><strong>{post.authorName}</strong>{post.authorRole ? <GuildRoleBadge role={post.authorRole} /> : null}<time dateTime={post.createdAt}>{formatDate(post.createdAt)}</time></div><p>{post.body}</p></article>)}</div><ForumPagination page={state.data.page} totalPages={state.data.totalPages} onPage={onPage} label="Сторінки повідомлень" />{state.data.viewer.canReply ? <form className="guild-form guild-forum__form" onSubmit={(event) => { void submit(event); }}><label>Твоя відповідь<textarea maxLength={4000} required rows={4} value={body} onChange={(event) => setBody(event.target.value)} placeholder="Додай думку або план…" /></label>{error ? <p className="guild-helper guild-helper--error">{error}</p> : null}<button className="guild-secondary-button" disabled={busy || submitting} type="submit">Відповісти</button></form> : <p className="guild-helper">{state.data.topic.locked ? "Тему закрито модератором." : "Відповідати можуть лише учасники гільдії."}</p>}</div>;
}

function ForumPagination({ page, totalPages, onPage, label }: { page: number; totalPages: number; onPage: (page: number) => void; label: string }) { if (totalPages <= 1) return null; return <nav className="guild-forum__pager" aria-label={label}><button className="guild-secondary-button" aria-label="Попередня сторінка" disabled={page <= 1} onClick={() => onPage(page - 1)} type="button">Назад</button><span><strong>{page}</strong> / {totalPages}</span><button className="guild-secondary-button" aria-label="Наступна сторінка" disabled={page >= totalPages} onClick={() => onPage(page + 1)} type="button">Далі</button></nav>; }
