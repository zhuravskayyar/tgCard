import { useCallback, useEffect, useRef, useState } from "react";
import type { PlayerMailAction, PlayerMailActionResponse, PlayerMailClaimResponse, PlayerMailResponse } from "@cardastika/shared";
import { getTelegramInitData } from "../telegram";
import { claimPlayerMail, loadPlayerMail, MailApiError, resolvePlayerMailAction } from "../telegram/mail";

export type MailState =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "error"; message?: string }
  | { status: "ready"; data: PlayerMailResponse };

export function useMail() {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<MailState>({ status: "loading" });
  const claimControllerRef = useRef<AbortController | null>(null);
  const actionControllerRef = useRef<AbortController | null>(null);
  const claimInFlightRef = useRef(false);
  const actionInFlightRef = useRef(false);
  const authCredential = getTelegramInitData();

  const retry = useCallback(() => setAttempt((current) => current + 1), []);

  useEffect(() => {
    const initData = authCredential;
    if (!initData) {
      setState({ status: "unavailable" });
      return;
    }

    const controller = new AbortController();
    setState({ status: "loading" });
    void loadPlayerMail(initData, controller.signal)
      .then((data) => setState({ status: "ready", data }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({ status: "error", message: error instanceof MailApiError ? error.code : "mail_request_failed" });
      });

    return () => controller.abort();
  }, [attempt, authCredential]);

  useEffect(() => () => {
    claimControllerRef.current?.abort();
    actionControllerRef.current?.abort();
  }, []);

  const claim = useCallback(async (messageId: string): Promise<PlayerMailClaimResponse | null> => {
    const initData = getTelegramInitData();
    if (!initData || claimInFlightRef.current) return null;

    claimInFlightRef.current = true;
    const controller = new AbortController();
    claimControllerRef.current = controller;
    try {
      const result = await claimPlayerMail(initData, messageId, controller.signal);
      setState((current) => {
        if (current.status !== "ready") return current;
        const messages = current.data.messages.map((message) => (
          message.id === result.messageId ? { ...message, claimedAt: result.claimedAt } : message
        ));
        return {
          status: "ready",
          data: {
            ...current.data,
            messages,
            unreadCount: messages.filter((message) => message.claimedAt === null).length,
          },
        };
      });
      return result;
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === "AbortError") return null;
      return null;
    } finally {
      if (claimControllerRef.current === controller) claimControllerRef.current = null;
      claimInFlightRef.current = false;
    }
  }, []);

  const resolveAction = useCallback(async (messageId: string, action: PlayerMailAction): Promise<PlayerMailActionResponse | null> => {
    const initData = getTelegramInitData();
    if (!initData || actionInFlightRef.current) return null;

    actionInFlightRef.current = true;
    const controller = new AbortController();
    actionControllerRef.current = controller;
    try {
      const result = await resolvePlayerMailAction(initData, messageId, action, controller.signal);
      setState((current) => {
        if (current.status !== "ready") return current;
        const messages = current.data.messages.map((message) => (
          message.id === result.messageId
            ? { ...message, actionCompletedAt: result.actionCompletedAt }
            : message
        ));
        return {
          status: "ready",
          data: {
            ...current.data,
            messages,
            unreadCount: messages.filter((message) => message.actionType === "nickname_change"
              ? message.actionCompletedAt === null
              : message.claimedAt === null).length,
          },
        };
      });
      return result;
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === "AbortError") return null;
      return null;
    } finally {
      if (actionControllerRef.current === controller) actionControllerRef.current = null;
      actionInFlightRef.current = false;
    }
  }, []);

  return { claim, resolveAction, retry, state };
}
