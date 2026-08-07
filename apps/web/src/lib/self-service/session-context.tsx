/* eslint-disable react-refresh/only-export-components */
import { useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { AccessStartResult, AccessVerifyResult, ChallengeRequestInput, ChallengeRequestResult, ChallengeResendInput, SelfServiceSessionState, SessionResult } from "./types";

export interface SelfServiceSessionController<LookupInput> {
  state: SelfServiceSessionState;
  startLookup: (input: LookupInput) => Promise<void>;
  requestCode: (channelId: string) => Promise<void>;
  resendCode: () => Promise<void>;
  verifyCode: (code: string) => Promise<boolean>;
  refreshSession: () => Promise<void>;
  endSession: () => Promise<void>;
  reset: () => void;
}

interface SessionProviderProps<LookupInput> {
  children: ReactNode;
  startAccess: (input: LookupInput) => Promise<AccessStartResult>;
  requestChallenge: (input: ChallengeRequestInput) => Promise<ChallengeRequestResult>;
  resendChallenge: (input: ChallengeResendInput) => Promise<ChallengeRequestResult>;
  verifyAccess: (input: { challengeId: string; code: string }) => Promise<AccessVerifyResult>;
  getSession: (signal?: AbortSignal) => Promise<SessionResult>;
  endSessionRequest: (csrfToken: string) => Promise<unknown>;
  storageKey: string;
  context: React.Context<SelfServiceSessionController<LookupInput> | null>;
}

const initialState: SelfServiceSessionState = { status: "lookup_pending" };

function stateFromStart(result: AccessStartResult): SelfServiceSessionState {
  if (result.status === "CHALLENGE_REQUIRED") {
    return {
      status: "challenge_required",
      providerReference: result.providerReference,
      channels: result.channels.map((channel) => ({ id: channel.providerReference, kind: channel.channel, maskedDestination: channel.maskedDestination, available: channel.availability === "AVAILABLE", enabled: channel.availability === "AVAILABLE", cooldownSeconds: channel.cooldownSeconds, providerReference: channel.providerReference })),
      expiresAt: result.expiresAt,
    };
  }
  if (result.status === "LOCKED") return { status: "locked", message: result.message };
  if (result.status === "EXPIRED") return { status: "expired", message: result.message };
  if (result.status === "NOT_CONFIGURED" || result.status === "UNAVAILABLE") return { status: "provider_unavailable", message: result.error.message };
  return { status: "anonymous" };
}

function stateFromVerify(result: AccessVerifyResult): SelfServiceSessionState {
  if (result.status === "VERIFIED") {
    return { status: "verified", expiresAt: result.expiresAt, scopes: result.scopes, csrfToken: result.csrfToken };
  }
  if (result.status === "LOCKED") return { status: "locked", message: result.message };
  if (result.status === "EXPIRED") return { status: "expired", message: result.message };
  if (result.status === "NOT_CONFIGURED" || result.status === "UNAVAILABLE") {
    const locked = result.error.code.includes("LOCKED");
    const expired = result.error.code.includes("EXPIRED");
    return { status: locked ? "locked" : expired ? "expired" : "provider_unavailable", message: result.error.message };
  }
  return { status: "anonymous" };
}

function stateFromSession(result: SessionResult, storedCsrfToken?: string): SelfServiceSessionState {
  if (result.status === "VERIFIED") return { status: "verified", expiresAt: result.expiresAt, scopes: result.scopes, csrfToken: result.csrfToken ?? storedCsrfToken };
  if (result.status === "ANONYMOUS") return { status: "anonymous", message: result.message };
  if (result.status === "EXPIRED") return { status: "expired", message: result.message };
  if (result.status === "LOCKED") return { status: "locked", message: result.message };
  if (result.status === "NOT_CONFIGURED" || result.status === "UNAVAILABLE") return { status: "provider_unavailable", message: result.error.message };
  return { status: "anonymous" };
}

export function SessionProvider<LookupInput>({ children, startAccess, requestChallenge, resendChallenge, verifyAccess, getSession, endSessionRequest, storageKey, context }: SessionProviderProps<LookupInput>) {
  const [state, setState] = useState<SelfServiceSessionState>(initialState);

  const refreshSession = useCallback(async () => {
    setState({ status: "lookup_pending" });
    try { setState(stateFromSession(await getSession(), sessionStorage.getItem(storageKey) ?? undefined)); }
    catch { setState({ status: "provider_unavailable", message: "El servicio de verificación no está disponible en este momento." }); }
  }, [getSession, storageKey]);

  useEffect(() => {
    const controller = new AbortController();
    void getSession(controller.signal).then((result) => setState(stateFromSession(result, sessionStorage.getItem(storageKey) ?? undefined))).catch(() => {
      if (!controller.signal.aborted) setState({ status: "anonymous" });
    });
    return () => controller.abort();
  }, [getSession, storageKey]);

  const startLookup = useCallback(async (input: LookupInput) => {
    setState({ status: "lookup_pending" });
    try { setState(stateFromStart(await startAccess(input))); }
    catch { setState({ status: "provider_unavailable", message: "No pudimos iniciar la verificación. Intenta nuevamente más tarde." }); }
  }, [startAccess]);

  const requestCode = useCallback(async (channelId: string) => {
    const providerReference = state.providerReference;
    const channel = state.channels?.find((candidate) => candidate.id === channelId && candidate.enabled && candidate.available);
    if (!providerReference || !channel) return;
    setState((current) => ({ ...current, status: "lookup_pending" }));
    try {
      const result = await requestChallenge({ providerReference, channelReference: channel.id });
      if (result.status === "CHALLENGE_REQUIRED") {
        setState({ ...state, status: "challenge_required", challengeId: result.challengeId, selectedChannelId: channelId, codeSent: true, expiresAt: result.expiresAt });
      } else if (result.status === "LOCKED") setState({ status: "locked", message: result.message });
      else if (result.status === "EXPIRED") setState({ status: "expired", message: result.message });
      else if (result.status === "NOT_CONFIGURED" || result.status === "UNAVAILABLE") setState({ ...state, status: "challenge_required", message: result.error.message });
    } catch {
      setState({ ...state, status: "challenge_required", message: "No pudimos enviar el código. Intenta nuevamente." });
    }
  }, [requestChallenge, state]);

  const resendCode = useCallback(async () => {
    const challengeId = state.challengeId;
    const channel = state.channels?.find((candidate) => candidate.id === state.selectedChannelId);
    if (!challengeId || !channel) return;
    try {
      const result = await resendChallenge({ challengeId });
      if (result.status === "CHALLENGE_REQUIRED") setState((current) => ({ ...current, message: "Enviamos un código nuevo al contacto seleccionado.", expiresAt: result.expiresAt }));
      else if (result.status === "LOCKED") setState({ status: "locked", message: result.message });
      else if (result.status === "EXPIRED") setState({ status: "expired", message: result.message });
      else if (result.status === "NOT_CONFIGURED" || result.status === "UNAVAILABLE") setState((current) => ({ ...current, message: result.error.message }));
    } catch { setState((current) => ({ ...current, message: "No pudimos reenviar el código todavía." })); }
  }, [resendChallenge, state]);

  const verifyCode = useCallback(async (code: string) => {
    const challengeId = state.challengeId;
    if (!challengeId) return false;
    const challenge = state;
    setState((current) => ({ ...current, status: "lookup_pending" }));
    try {
      const result = await verifyAccess({ challengeId, code });
      if (result.status === "VERIFIED") sessionStorage.setItem(storageKey, result.csrfToken);
      setState(stateFromVerify(result));
      return result.status === "VERIFIED";
    } catch {
      setState({ ...challenge, status: "challenge_required", message: "No pudimos validar el código. Revisa los datos e intenta nuevamente." });
      return false;
    }
  }, [state, storageKey, verifyAccess]);

  const reset = useCallback(() => { sessionStorage.removeItem(storageKey); setState({ status: "anonymous" }); }, [storageKey]);
  const endSession = useCallback(async () => {
    const token = state.csrfToken ?? sessionStorage.getItem(storageKey);
    try { if (token) await endSessionRequest(token); } finally { sessionStorage.removeItem(storageKey); setState({ status: "anonymous" }); }
  }, [endSessionRequest, state.csrfToken, storageKey]);
  const value = useMemo(() => ({ state, startLookup, requestCode, resendCode, verifyCode, refreshSession, endSession, reset }), [endSession, refreshSession, requestCode, resendCode, reset, startLookup, state, verifyCode]);
  return <context.Provider value={value}>{children}</context.Provider>;
}

export function useRequiredSession<LookupInput>(context: React.Context<SelfServiceSessionController<LookupInput> | null>, name: string) {
  const value = useContext(context);
  if (!value) throw new Error(`${name} must be used inside its provider`);
  return value;
}
