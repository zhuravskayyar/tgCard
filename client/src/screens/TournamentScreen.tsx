import { useEffect, useRef, useState } from "react";
import type { TournamentLobbyView, TournamentRunAction, TournamentRunView } from "@cardastika/shared";
import { ScreenHeading } from "../components/ScreenHeading";
import { getTelegramInitData } from "../telegram";
import {
  loadTournament,
  loadTournamentRun,
  registerTournament,
  scheduleTournamentTest,
  submitTournamentAction,
  unregisterTournament,
} from "../telegram/tournament";
import { TournamentLobby } from "./tournament/TournamentLobby";
import { TournamentRun } from "./tournament/TournamentRun";
import { TournamentRules } from "./tournament/TournamentRules";
import "../styles/tournament.css";

type TournamentState = { status: "loading" | "error" | "unauthenticated" } | { status: "ready"; data: TournamentLobbyView };

const ACTION_ERRORS: Record<string, string> = {
  "Not enough gold for the tournament buff": "Недостатньо золота для підсилення.",
  "Tournament buffs close when the battle starts": "Бій уже почався — підсилення закрите.",
  "Tournament card already used in this cycle": "Ця карта вже вдарила в цьому циклі.",
  "Tournament free card change already used": "Безплатну заміну карт уже використано.",
  "Tournament battle is not live": "Бій зараз не триває.",
  "Tournament match is no longer active": "Цей бій уже завершено.",
  "Already registered for a tournament": "Ти вже записаний на турнір.",
  "Tournament registration is closed": "Запис уже закрито.",
  "Tournament registration is not open": "Запис ще не відкрився.",
  "Tournament needs a higher duel league": "Для турніру потрібна вища ліга дуелей.",
};

function message(cause: unknown, fallback: string) {
  return cause instanceof Error ? ACTION_ERRORS[cause.message] ?? fallback : fallback;
}

/** Live phases are polled about once a second so both players see the same server round. */
const POLLED = new Set<TournamentRunView["status"]>(["waiting", "buff_selection", "battle", "round_wait"]);

export function TournamentScreen({ onBack }: { onBack: () => void }) {
  const [state, setState] = useState<TournamentState>({ status: "loading" });
  const [rulesOpen, setRulesOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [run, setRun] = useState<TournamentRunView | null>(null);
  const [runOpen, setRunOpen] = useState(false);
  const [clockOffset, setClockOffset] = useState(0);
  const [pending, setPending] = useState<number | "buff" | "change" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  /** Bumped by every action, so an older poll response never overwrites a newer action result. */
  const requestSeq = useRef(0);
  const startsAt = state.status === "ready" ? state.data.event?.startsAt ?? state.data.schedule.startsAt : null;

  function acceptRun(next: TournamentRunView | null) {
    setRun(next);
    if (next) setClockOffset(next.serverNow - Date.now());
  }

  useEffect(() => {
    const initData = getTelegramInitData();
    if (!initData) { setState({ status: "unauthenticated" }); return; }
    const controller = new AbortController();
    setState(current => current.status === "ready" ? current : { status: "loading" });
    void loadTournament(initData, controller.signal).then(data => {
      if (!controller.signal.aborted) setState({ status: "ready", data });
    }).catch(() => {
      if (!controller.signal.aborted) setState({ status: "error" });
    });
    return () => controller.abort();
  }, [attempt]);

  // A lobby left open across the start or the registration window shows the next state.
  useEffect(() => {
    if (!startsAt || runOpen) return;
    const untilStart = Date.parse(startsAt) - Date.now();
    // Before the start wake right after it; once it has passed, refresh slowly.
    const timer = window.setTimeout(() => setAttempt(value => value + 1), untilStart > 0 ? Math.max(1_000, Math.min(untilStart + 500, 60_000)) : 15_000);
    return () => window.clearTimeout(timer);
  }, [startsAt, runOpen, attempt]);

  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible") setAttempt(value => value + 1); };
    document.addEventListener("visibilitychange", refresh);
    return () => document.removeEventListener("visibilitychange", refresh);
  }, []);

  const runStatus = run?.status;
  useEffect(() => {
    const initData = getTelegramInitData();
    if (!runOpen || !initData) return;
    if (run && !POLLED.has(run.status)) return;
    let stopped = false;
    let timer = 0;
    const poll = async () => {
      if (pendingRef.current === null) {
        const seq = requestSeq.current;
        try {
          const next = await loadTournamentRun(initData);
          if (stopped || seq !== requestSeq.current) { /* superseded */ }
          else if (!next) { setRunOpen(false); setAttempt(value => value + 1); return; }
          else { acceptRun(next); setError(null); }
        }
        catch { if (!stopped) setError("Зв’язок із турніром перервано. Пробуємо ще раз…"); }
      }
      if (!stopped) timer = window.setTimeout(poll, 1_000);
    };
    void poll();
    return () => { stopped = true; window.clearTimeout(timer); };
  }, [runOpen, runStatus]);

  async function lobbyAction(request: (initData: string) => Promise<TournamentLobbyView>, fallback: string) {
    const initData = getTelegramInitData();
    if (!initData || pending !== null) return;
    setPending(-1);
    setError(null);
    try { setState({ status: "ready", data: await request(initData) }); }
    catch (cause) { setError(message(cause, fallback)); }
    finally { setPending(null); }
  }

  async function handleAction(action: TournamentRunAction) {
    const initData = getTelegramInitData();
    if (!initData || pending !== null) return;
    setPending(action.type === "attack" ? action.slotIndex : action.type);
    setError(null);
    requestSeq.current += 1;
    try { acceptRun(await submitTournamentAction(initData, action)); }
    catch (cause) {
      setError(message(cause, "Не вдалося виконати хід."));
      try { acceptRun(await loadTournamentRun(initData)); } catch { /* the poll retries */ }
    }
    finally { setPending(null); }
  }

  if (runOpen && run) {
    return <TournamentRun
      clockOffset={clockOffset}
      error={error}
      onAction={handleAction}
      onExit={() => { setRunOpen(false); setRun(null); setError(null); setAttempt(value => value + 1); }}
      pending={pending}
      run={run}
    />;
  }

  return <section className="tournament-screen">
    <ScreenHeading onBack={rulesOpen ? () => setRulesOpen(false) : onBack} title={rulesOpen ? "Правила турніру" : "Турнір"} />
    {state.status === "loading" || (runOpen && !run && !error) ? <p className="ui-panel tournament-state" role="status">Завантажуємо турнір…</p> : null}
    {runOpen && !run && error ? <div className="ui-panel tournament-state" role="alert"><p>{error}</p><button className="ui-button ui-button--primary" onClick={() => { setRunOpen(false); setError(null); setAttempt(value => value + 1); }} type="button">До лобі турніру</button></div> : null}
    {state.status === "unauthenticated" ? <p className="ui-panel tournament-state" role="status">Увійди в гру, щоб переглянути свою лігу, розклад і нагороди.</p> : null}
    {state.status === "error" ? <div className="ui-panel tournament-state" role="alert"><p>Не вдалося завантажити турнір.</p><button className="ui-button ui-button--primary" onClick={() => setAttempt(value => value + 1)} type="button">Повторити</button></div> : null}
    {state.status === "ready" && !runOpen ? rulesOpen
      ? <TournamentRules data={state.data} />
      : <TournamentLobby
        data={state.data}
        onOpenRules={() => setRulesOpen(true)}
        onOpenRun={() => { setError(null); setRunOpen(true); }}
        onRefresh={() => setAttempt(value => value + 1)}
        onRegister={() => void lobbyAction(registerTournament, "Не вдалося записатися на турнір.")}
        onScheduleTest={() => void lobbyAction(scheduleTournamentTest, "Не вдалося створити тестовий турнір.")}
        onUnregister={() => void lobbyAction(unregisterTournament, "Не вдалося скасувати запис.")}
        error={error}
        pending={pending !== null}
      />
      : null}
  </section>;
}
