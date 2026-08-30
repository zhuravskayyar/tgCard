import { useEffect, useRef, useState } from "react";
import type { DungeonCompleteResponse, DungeonStartResponse } from "@cardastika/shared";
import { AppIcon } from "../components/AppIcon";
import { DungeonGlyph } from "../components/DungeonGlyph";
import { getTelegramInitData } from "../telegram";
import { completeDungeon, DungeonApiError, startDungeon } from "../telegram/dungeon";

interface DungeonScreenProps {
  onBack: () => void;
}

const dungeonTileAsset = "/assets/dungeon/dungeon-floor-tile-v1.webp";

function starsLabel(stars: number) {
  return `${"★".repeat(stars)}${"☆".repeat(Math.max(0, 3 - stars))}`;
}

function DungeonResult({ result, onBack, onRetry }: { result: DungeonCompleteResponse; onBack: () => void; onRetry: () => void }) {
  const success = result.success;
  return (
    <div className="dungeon-result" role="dialog" aria-modal="true" aria-labelledby="dungeon-result-title">
      <div className="dungeon-result__panel">
        <span className="dungeon-result__eyebrow">{success ? "ПІДЗЕМЕЛЛЯ ОЧИЩЕНО" : "СПРОБУ НЕ ЗАВЕРШЕНО"}</span>
        <h2 id="dungeon-result-title">{success ? "Руни підкорено" : "Кімната ще чекає"}</h2>
        {success ? <strong className="dungeon-result__stars" aria-label={`${result.stars} зірки`}>{starsLabel(result.stars)}</strong> : null}
        <p>{success ? `${result.movesUsed} / ${result.maxMoves} ходів` : `${result.matchedPairs} / 8 пар`}</p>
        <div className="dungeon-result__reward">
          <DungeonGlyph assetKey="card_fragment" size={23} />
          <span>{success ? `+${result.shardsEarned} уламків карт` : "Нагорода: 0"}</span>
        </div>
        <div className="dungeon-result__actions">
          <button className="dungeon-primary-action" onClick={onRetry} type="button">{success ? "ЩЕ РАЗ" : "СПРОБУВАТИ ЩЕ"}</button>
          <button className="dungeon-secondary-action" onClick={onBack} type="button">ВИЙТИ</button>
        </div>
      </div>
    </div>
  );
}

export function DungeonScreen({ onBack }: DungeonScreenProps) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<"loading" | "unavailable" | "error" | "ready">("loading");
  const [run, setRun] = useState<DungeonStartResponse | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [matchedIds, setMatchedIds] = useState<Set<string>>(new Set());
  const [wrongIds, setWrongIds] = useState<Set<string>>(new Set());
  const [movesUsed, setMovesUsed] = useState(0);
  const [moveSequence, setMoveSequence] = useState<string[]>([]);
  const [locked, setLocked] = useState(false);
  const [result, setResult] = useState<DungeonCompleteResponse | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const completeInFlightRef = useRef(false);

  useEffect(() => {
    const initData = getTelegramInitData();
    if (!initData) {
      setState("unavailable");
      return;
    }
    const controller = new AbortController();
    setState("loading");
    setRun(null);
    setResult(null);
    setSelectedIds([]);
    setMatchedIds(new Set());
    setWrongIds(new Set());
    setMovesUsed(0);
    setMoveSequence([]);
    setLocked(false);
    setErrorCode(null);
    completeInFlightRef.current = false;
    void startDungeon(initData, controller.signal)
      .then((nextRun) => {
        setRun(nextRun);
        setState("ready");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setErrorCode(error instanceof DungeonApiError ? error.code : "dungeon_request_failed");
        setState("error");
      });
    return () => controller.abort();
  }, [attempt]);

  async function submit(runId: string, moves: string[]) {
    if (completeInFlightRef.current) return;
    const initData = getTelegramInitData();
    if (!initData) return;
    completeInFlightRef.current = true;
    try {
      const response = await completeDungeon(initData, runId, moves, new AbortController().signal);
      setResult(response);
      setLocked(true);
    } catch (error: unknown) {
      setErrorCode(error instanceof DungeonApiError ? error.code : "dungeon_request_failed");
      setState("error");
      setLocked(false);
    } finally {
      completeInFlightRef.current = false;
    }
  }

  function handleTileClick(tileId: string) {
    if (!run || locked || result || selectedIds.includes(tileId) || matchedIds.has(tileId)) return;
    const tile = run.board.find((candidate) => candidate.id === tileId);
    if (!tile) return;
    if (selectedIds.length === 0) {
      setSelectedIds([tileId]);
      return;
    }
    const firstId = selectedIds[0];
    const firstTile = run.board.find((candidate) => candidate.id === firstId);
    if (!firstTile) return;
    const nextMoves = [...moveSequence, firstId, tileId];
    const nextMovesUsed = movesUsed + 1;
    setSelectedIds([firstId, tileId]);
    setMoveSequence(nextMoves);
    setMovesUsed(nextMovesUsed);
    setLocked(true);
    if (firstTile.pairId === tile.pairId) {
      const nextMatched = new Set(matchedIds);
      nextMatched.add(firstId);
      nextMatched.add(tileId);
      setMatchedIds(nextMatched);
      if (nextMatched.size === run.board.length) {
        void submit(run.runId, nextMoves);
      } else {
        window.setTimeout(() => {
          setSelectedIds([]);
          setLocked(false);
        }, 180);
      }
      return;
    }
    const nextWrong = new Set([firstId, tileId]);
    setWrongIds(nextWrong);
    window.setTimeout(() => {
      setWrongIds(new Set());
      setSelectedIds([]);
      if (nextMovesUsed >= run.maxMoves) {
        void submit(run.runId, nextMoves);
      } else {
        setLocked(false);
      }
    }, 700);
  }

  if (state === "unavailable") return <section className="dungeon-screen dungeon-state">Підземелля доступне після запуску через Telegram.</section>;
  if (state === "loading") return <section className="dungeon-screen dungeon-state">Відчиняємо підземелля…</section>;
  if (state === "error") return <section className="dungeon-screen dungeon-state dungeon-state--error"><span>Не вдалося завантажити підземелля.</span><small>{errorCode}</small><button onClick={() => setAttempt((value) => value + 1)} type="button">Повторити</button></section>;
  if (!run) return null;

  return (
    <section className="dungeon-screen">
      <header className="dungeon-heading">
        <button aria-label="Назад" className="dungeon-back" onClick={onBack} type="button"><AppIcon name="chevron" size={19} /></button>
        <div><span>Старі руни та уламки</span><h1>ПІДЗЕМЕЛЛЯ</h1></div>
      </header>
      <div className="dungeon-stats"><span>Пари <strong>{matchedIds.size / 2} / 8</strong></span><span>Ходи <strong>{movesUsed} / {run.maxMoves}</strong></span><span className="dungeon-stats__shards"><DungeonGlyph assetKey="card_fragment" size={16} /><strong>{result?.cardShards ?? run.cardShards}</strong></span></div>
      <div className="dungeon-board" aria-label="Поле пам'яті">
        {run.board.map((tile) => {
          const isOpen = selectedIds.includes(tile.id) || matchedIds.has(tile.id);
          const isWrong = wrongIds.has(tile.id);
          return (
            <button
              aria-label={isOpen ? `Плитка ${tile.assetKey}` : "Закрита плитка"}
              className={`dungeon-tile${isOpen ? " dungeon-tile--open" : ""}${matchedIds.has(tile.id) ? " dungeon-tile--matched" : ""}${isWrong ? " dungeon-tile--wrong" : ""}`}
              disabled={locked || matchedIds.has(tile.id)}
              key={tile.id}
              onClick={() => handleTileClick(tile.id)}
              type="button"
            >
              <span className="dungeon-tile__inner"><span className="dungeon-tile__back"><img alt="" src={dungeonTileAsset} /></span><span className="dungeon-tile__front"><DungeonGlyph assetKey={tile.assetKey} size={34} /></span></span>
            </button>
          );
        })}
      </div>
      <footer className="dungeon-progress"><div><span>Прогрес кімнати</span><strong>{matchedIds.size / 2} / 8 пар</strong></div><div className="dungeon-progress__track"><span style={{ width: `${(matchedIds.size / 16) * 100}%` }} /></div><small>Знайди всі пари до завершення ходів</small></footer>
      {result ? <DungeonResult onBack={onBack} onRetry={() => setAttempt((value) => value + 1)} result={result} /> : null}
    </section>
  );
}
