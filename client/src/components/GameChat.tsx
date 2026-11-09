import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { CHAT_MAX_LENGTH, type ChatMessage, type ChatView } from "@cardastika/shared";
import { getTelegramInitData } from "../telegram";
import "../styles/game-chat.css";

type ChatState = "loading" | "ready" | "error";

interface GameChatProps {
  /** Heading shown above the composer, e.g. «Чат арени». */
  title: string;
  inputLabel: string;
  signInNotice: string;
  unavailableNotice: string;
  load: (initData: string, signal: AbortSignal) => Promise<ChatView>;
  send: (initData: string, body: string) => Promise<ChatMessage>;
}

function errorCode(error: unknown) {
  return error && typeof error === "object" && typeof (error as { code?: unknown }).code === "string" ? (error as { code: string }).code : null;
}

function sendErrorMessage(error: unknown) {
  const code = errorCode(error);
  if (code === "chat_rate_limited") return "Зачекай кілька секунд перед наступним повідомленням.";
  if (code === "message_too_long") return `Повідомлення задовге. Максимум ${CHAT_MAX_LENGTH} символів.`;
  if (code === "empty_message") return "Напиши повідомлення перед відправленням.";
  return "Не вдалося надіслати повідомлення. Перевір з’єднання й спробуй ще раз.";
}

function messageTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(date);
}

/** Lobby chat shared by every mode; each mode passes its own endpoints and wording. */
export function GameChat({ inputLabel, load, send, signInNotice, title, unavailableNotice }: GameChatProps) {
  const titleId = useId();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
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
      setNotice(signInNotice);
      return;
    }

    const controller = new AbortController();
    let firstLoad = true;
    let timerId: number | null = null;
    const refresh = async () => {
      try {
        const next = await load(initData, controller.signal);
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
          setNotice(unavailableNotice);
        }
      } finally {
        firstLoad = false;
        if (!controller.signal.aborted) timerId = window.setTimeout(() => { void refresh(); }, 3_000);
      }
    };
    void refresh();
    return () => {
      controller.abort();
      if (timerId !== null) window.clearTimeout(timerId);
    };
  }, [load, signInNotice, unavailableNotice]);

  useEffect(() => {
    const element = messagesRef.current;
    if (element && bottomPinnedRef.current) element.scrollTop = element.scrollHeight;
  }, [messages]);

  function handleScroll() {
    const element = messagesRef.current;
    if (element) bottomPinnedRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 24;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = draft.trim();
    const initData = getTelegramInitData();
    if (!body || !initData || sending) return;
    setSending(true);
    setNotice(null);
    try {
      const message = await send(initData, body);
      setMessages(current => [...current.filter(item => item.id !== message.id), message].slice(-50));
      setDraft("");
      bottomPinnedRef.current = true;
    } catch (error) {
      setNotice(sendErrorMessage(error));
    } finally {
      setSending(false);
    }
  }

  return <section aria-labelledby={titleId} className="game-chat">
    <h2 id={titleId}>{title}</h2>
    <form className="game-chat__composer" onSubmit={submit}>
      <input aria-label={inputLabel} autoComplete="off" maxLength={CHAT_MAX_LENGTH} onChange={event => setDraft(event.target.value)} placeholder="Написати повідомлення…" value={draft} />
      <button aria-label="Надіслати повідомлення" aria-busy={sending} className="ui-button game-chat__send" disabled={sending || !draft.trim()} type="submit">
        {sending ? "Надсилаємо…" : "Надіслати"}
      </button>
    </form>
    <div className="game-chat__messages" onScroll={handleScroll} ref={messagesRef} aria-live="polite">
      {messages.map(message => <article className="game-chat__message" key={message.id}>
        <header><strong>{message.author}</strong><time dateTime={message.createdAt}>{messageTime(message.createdAt)}</time></header>
        <p>{message.body}</p>
      </article>)}
      {!messages.length && state === "loading" ? <p className="game-chat__state">Завантажуємо чат…</p> : null}
      {!messages.length && state === "ready" ? <p className="game-chat__state">Повідомлень поки немає.</p> : null}
      {!messages.length && state === "error" ? <p className="game-chat__state">Чат з’явиться, щойно з’єднання відновиться.</p> : null}
    </div>
    {notice ? <p className="game-chat__notice" role={state === "error" ? "status" : "alert"}>{notice}</p> : null}
  </section>;
}
