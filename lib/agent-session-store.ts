"use client";

import { useSyncExternalStore } from "react";
import {
  AGENT_SESSION_LIMIT,
  mergeAgentSessions,
  parseAgentSessions,
  sortAgentSessions,
  type AgentSession,
} from "@/lib/agent-sessions";

type Snapshot = { ready: boolean; sessions: AgentSession[] };

const STORAGE_PREFIX = "cut45.agent.sessions.";
const LAST_USER_KEY = "cut45.agent.user";
const SAVE_DELAY_MS = 900;
const EMPTY: Snapshot = { ready: false, sessions: [] };

let snapshot: Snapshot = EMPTY;
let userId: string | null = null;
let started = false;
const listeners = new Set<() => void>();
const pendingSaves = new Map<string, number>();

function emit(next: Snapshot) {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

function readLocal(owner: string) {
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${owner}`);
    return raw ? parseAgentSessions(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

function writeLocal(sessions: AgentSession[]) {
  if (!userId) return;
  const key = `${STORAGE_PREFIX}${userId}`;
  for (const count of [AGENT_SESSION_LIMIT, 10, 3]) {
    try {
      window.localStorage.setItem(key, JSON.stringify(sessions.slice(0, count)));
      return;
    } catch {
      // Storage is full; retry with fewer sessions so the newest ones survive a refresh.
    }
  }
}

export function startAgentSessions() {
  if (started || typeof window === "undefined") return;
  started = true;
  const lastUser = window.localStorage.getItem(LAST_USER_KEY);
  if (lastUser) {
    userId = lastUser;
    emit({ ready: false, sessions: readLocal(lastUser) });
  }
  void fetch("/api/agent/sessions")
    .then((response) => (response.ok ? response.json() : null))
    .then((payload: { userId?: string; sessions?: unknown } | null) => {
      if (!payload?.userId) {
        emit({ ...snapshot, ready: true });
        return;
      }
      const local = payload.userId === userId ? snapshot.sessions : readLocal(payload.userId);
      userId = payload.userId;
      window.localStorage.setItem(LAST_USER_KEY, payload.userId);
      const merged = mergeAgentSessions(local, parseAgentSessions(payload.sessions));
      writeLocal(merged);
      emit({ ready: true, sessions: merged });
    })
    .catch(() => emit({ ...snapshot, ready: true }));
}

function storeSession(session: AgentSession) {
  const sessions = sortAgentSessions([session, ...snapshot.sessions.filter((item) => item.id !== session.id)]).slice(
    0,
    AGENT_SESSION_LIMIT,
  );
  writeLocal(sessions);
  emit({ ...snapshot, sessions });

  const queued = pendingSaves.get(session.id);
  if (queued) window.clearTimeout(queued);
  pendingSaves.set(
    session.id,
    window.setTimeout(() => {
      pendingSaves.delete(session.id);
      const latest = snapshot.sessions.find((item) => item.id === session.id);
      if (!latest) return;
      void fetch("/api/agent/sessions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session: latest }),
      }).catch(() => undefined);
    }, SAVE_DELAY_MS),
  );
}

export function saveAgentSession(session: Omit<AgentSession, "pinned">) {
  const pinned = snapshot.sessions.find((item) => item.id === session.id)?.pinned ?? false;
  storeSession({ ...session, pinned });
}

export function setAgentSessionPinned(id: string, pinned: boolean) {
  const current = snapshot.sessions.find((item) => item.id === id);
  if (!current || current.pinned === pinned) return;
  storeSession({ ...current, pinned });
}

export function deleteAgentSession(id: string) {
  const queued = pendingSaves.get(id);
  if (queued) window.clearTimeout(queued);
  pendingSaves.delete(id);
  const sessions = snapshot.sessions.filter((item) => item.id !== id);
  writeLocal(sessions);
  emit({ ...snapshot, sessions });
  void fetch(`/api/agent/sessions?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => undefined);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAgentSessions() {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => EMPTY,
  );
}
