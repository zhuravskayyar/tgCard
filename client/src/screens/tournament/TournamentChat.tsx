import { useEffect, useRef, useState, type FormEvent } from "react";
import type { TournamentChatMessage } from "@cardastika/shared";
import { getTelegramInitData } from "../../telegram";
import { loadTournamentChat, sendTournamentChatMessage, TournamentRequestError } from "../../telegram/tournament";

type ChatState = "loading" | "ready" | "error";

function sendErrorMessage(error: unknown) {
  if (error instanceof TournamentRequestError) {
    if (error.code === "chat_rate_limited") return "Зачекай кілька секунд перед наступним повідомленням.";
    if (error.code === "message_too_long") return "Повідомлення задовге. Максимум 240 символів.";
    if (error.code === "empty_message") return "Напиши повідомлення перед відправленням.";
  }
  return "Не вдалося надіслати повідомлення. Перевір з’єднання й спробуй ще раз.";
}

function messageTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(date);
}

export function TournamentChat() {
  const [messages, setMessages] = useState<TournamentChatMessage[]>([]);
  const [state, setState] = useState<ChatState>("loading");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const bottomPinnedRef = useRef(true);
  const loadErrorRef = useRef(false);

  useEffect(() => {
    const initData = getTelegramInitData();
    if (!initData) {
      setState("error");
      setNotice("Увійди в гру, щоб переглянути чат турніру.");
      return;
    }

    const controller = new AbortController();
    let firstLoad = true;
    let timerId: number | null = null;
    const load = async () => {
      try {
        const next = await loadTournamentChat(initData, controller.signal);
        setMessages(next.messages);
        setState("ready");
        if (loadErrorRef.current) {
          loadErrorRef.current = false;
          setNotice(null);
        }
      } catch {
        if (controller.signal.aborted) return;
        if (firstLoad) {
          loadErrorRef.current = true;
          setState("error");
          setNotice("Чат турніру тимчасово недоступний.");
        }
      } finally {
        firstLoad = false;
        if (!controller.signal.aborted) timerId = window.setTimeout(() => { void load(); }, 3_000);
      }
    };
    void load();
    return () => {
      controller.abort();
      if (timerId !== null) window.clearTimeout(timerId);
    };
  }, []);

  useEffect(() => {
    const element = messagesRef.current;
    if (element && bottomPinnedRef.current) element.scrollTop = element.scrollHeight;
  }, [messages]);

  function handleScroll() {
    const element = messagesRef.current;
    if (element) bottomPinnedRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 24;
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = draft.trim();
    const initData = getTelegramInitData();
    if (!body || !initData || sending) return;
    setSending(true);
    setNotice(null);
    try {
      const message = await sendTournamentChatMessage(initData, body);
      setMessages(current => [...current.filter(item => item.id !== message.id), message].slice(-50));
      setDraft("");
      bottomPinnedRef.current = true;
    } catch (error) {
      setNotice(sendErrorMessage(error));
    } finally {
      setSending(false);
    }
  }

  return <section aria-labelledby="tournament-chat-title" className="tournament-chat">
    <h2 id="tournament-chat-title">Чат турніру</h2>
    <form className="tournament-chat__composer" onSubmit={send}>
      <input aria-label="Повідомлення в чат турніру" autoComplete="off" maxLength={240} onChange={event => setDraft(event.target.value)} placeholder="Написати повідомлення…" value={draft} />
      <button aria-label="Надіслати повідомлення" aria-busy={sending} className="ui-button tournament-chat__send" disabled={sending || !draft.trim()} type="submit">
        {sending ? "Надсилаємо…" : "Надіслати"}
      </button>
    </form>
    <div className="tournament-chat__messages" onScroll={handleScroll} ref={messagesRef} aria-live="polite">
      {messages.map(message => <article className="tournament-chat__message" key={message.id}>
        <header><strong>{message.author}</strong><time dateTime={message.createdAt}>{messageTime(message.createdAt)}</time></header>
        <p>{message.body}</p>
      </article>)}
      {!messages.length && state === "loading" ? <p className="tournament-chat__state">Завантажуємо чат…</p> : null}
      {!messages.length && state === "ready" ? <p className="tournament-chat__state">Повідомлень поки немає.</p> : null}
      {!messages.length && state === "error" ? <p className="tournament-chat__state">Чат з’явиться, щойно з’єднання відновиться.</p> : null}
    </div>
    {notice ? <p className="tournament-chat__notice" role={state === "error" ? "status" : "alert"}>{notice}</p> : null}
  </section>;
}
