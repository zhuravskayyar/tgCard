import { useEffect, useState } from "react";
import type { CardElement, TournamentLobbyView, TournamentRunView } from "@cardastika/shared";
import { ScreenHeading } from "../components/ScreenHeading";
import { getTelegramInitData } from "../telegram";
import { loadTournament } from "../telegram/tournament";
import { TournamentLobby } from "./tournament/TournamentLobby";
import { enterTournament, loadTournamentRun, submitTournamentAction } from "../telegram/tournament";
import { TournamentRun } from "./tournament/TournamentRun";
import { TournamentRules } from "./tournament/TournamentRules";
import "../styles/tournament.css";

type TournamentState = { status: "loading" | "error" | "unauthenticated" } | { status: "ready"; data: TournamentLobbyView };

export function TournamentScreen({ onBack }: { onBack: () => void }) {
  const [state, setState] = useState<TournamentState>({ status: "loading" });
  const [rulesOpen, setRulesOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [run, setRun] = useState<TournamentRunView | null>(null);
  const [availableRun, setAvailableRun] = useState<TournamentRunView | null>(null);
  const [runStatusLoaded, setRunStatusLoaded] = useState(false);
  const [pending, setPending] = useState<number | "buff" | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const startsAt = state.status === "ready" ? state.data.schedule.startsAt : null;

  useEffect(() => {
    const initData = getTelegramInitData();
    if (!initData) { setState({ status: "unauthenticated" }); return; }
    const controller = new AbortController();
    setRunStatusLoaded(false);
    setState(current => current.status === "ready" ? current : { status: "loading" });
    void loadTournament(initData, controller.signal).then(data => {
      if (!controller.signal.aborted) setState({ status: "ready", data });
    }).catch(() => {
      if (!controller.signal.aborted) setState({ status: "error" });
    });
    void loadTournamentRun(initData, controller.signal).then(value => {
      if (!controller.signal.aborted) {
        setAvailableRun(value);
        setRunStatusLoaded(true);
      }
    }).catch(() => {
      if (!controller.signal.aborted) setRunStatusLoaded(true);
    });
    return () => controller.abort();
  }, [attempt]);

  // A lobby left open across the scheduled start must show the next event.
  useEffect(() => {
    if (!startsAt) return;
    const timer = window.setTimeout(() => setAttempt(value => value + 1), Math.max(1_000, Date.parse(startsAt) - Date.now() + 250));
    return () => window.clearTimeout(timer);
  }, [startsAt]);

  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible") setAttempt(value => value + 1); };
    document.addEventListener("visibilitychange", refresh);
    return () => document.removeEventListener("visibilitychange", refresh);
  }, []);

  async function handleEnter() {
    const initData = getTelegramInitData();
    if (!initData || pending !== null) return;
    setPending(-1);
    setRunError(null);
    try {
      const saved = await loadTournamentRun(initData);
      setAvailableRun(saved);
      if (saved && !["finished", "eliminated"].includes(saved.status)) setRun(saved);
      else {
        const next = await enterTournament(initData);
        setRun(next);
        setAvailableRun(next);
      }
    }
    catch { setRunError("Не вдалося розпочати турнір. Перевір, що збережена колода містить 9 карт."); }
    finally { setPending(null); }
  }

  async function handleContinue() {
    const initData = getTelegramInitData();
    if (!initData || pending !== null) return;
    setPending(-1);
    setRunError(null);
    try {
      const next = await enterTournament(initData);
      setRun(next);
      setAvailableRun(next);
    } catch { setRunError("Не вдалося відкрити наступний бій."); }
    finally { setPending(null); }
  }

  async function handleAction(action: { type: "buff"; matchId: string; element: CardElement } | { type: "attack"; matchId: string; slotIndex: 0 | 1 | 2 }) {
    const initData = getTelegramInitData();
    if (!initData || pending !== null) return;
    setPending(action.type === "buff" ? "buff" : action.slotIndex);
    setRunError(null);
    try {
      const next = await submitTournamentAction(initData, action);
      setRun(next);
      setAvailableRun(next);
    }
    catch (cause) {
      const message = cause instanceof Error ? cause.message : "Не вдалося виконати хід.";
      try {
        const latest = await loadTournamentRun(initData);
        setRun(latest);
        setAvailableRun(latest);
        setRunError(message);
      } catch {
        setRunError("Не вдалося оновити стан бою. Онови екран і спробуй ще раз.");
      }
    }
    finally { setPending(null); }
  }

  if (run) return <TournamentRun error={runError} onAction={handleAction} onContinue={handleContinue} onExit={() => { setAvailableRun(run); setRun(null); setRunError(null); }} pending={pending} run={run} />;

  return <section className="tournament-screen">
    <ScreenHeading onBack={rulesOpen ? () => setRulesOpen(false) : onBack} title={rulesOpen ? "Правила турніру" : "Турнір"} />
    {state.status === "loading" ? <p className="ui-panel tournament-state" role="status">Завантажуємо турнір…</p> : null}
    {state.status === "unauthenticated" ? <p className="ui-panel tournament-state" role="status">Увійди в гру, щоб переглянути свою лігу, розклад і нагороди.</p> : null}
    {state.status === "error" ? <div className="ui-panel tournament-state" role="alert"><p>Не вдалося завантажити турнір.</p><button className="ui-button ui-button--primary" onClick={() => setAttempt(value => value + 1)} type="button">Повторити</button></div> : null}
    {!run && runError && state.status === "ready" ? <div className="ui-panel tournament-state" role="alert"><p>{runError}</p><button className="ui-button ui-button--primary" onClick={() => { setRunError(null); setAttempt(value => value + 1); }} type="button">Спробувати відновити</button></div> : null}
    {state.status === "ready" ? rulesOpen
      ? <TournamentRules data={state.data} />
      : <TournamentLobby data={state.data} onEnter={handleEnter} onOpenRules={() => setRulesOpen(true)} pending={pending !== null || !runStatusLoaded} resumeAvailable={Boolean(availableRun && !["finished", "eliminated"].includes(availableRun.status))} />
      : null}
  </section>;
}
