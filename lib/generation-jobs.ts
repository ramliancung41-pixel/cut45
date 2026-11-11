"use client";

import { useSyncExternalStore } from "react";

export type ActiveGeneration = { id: string; label: string };

let jobs: ActiveGeneration[] = [];
const controllers = new Map<string, AbortController>();
const listeners = new Set<() => void>();
const STALL_MS = 45_000;
const timers = new Map<string, number>();
const stopListeners = new Set<(id: string, reason: "cancel" | "timeout") => void>();

function emit() {
  jobs = [...controllers.keys()].map((id) => jobs.find((job) => job.id === id) ?? { id, label: "Generating clip in background..." });
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function beginGeneration(id: string, label: string) {
  const controller = new AbortController();
  jobs = [...jobs.filter((job) => job.id !== id), { id, label }];
  controllers.set(id, controller);
  emit();
  return controller;
}

export function noteGenerationProgress(id: string) {
  if (!controllers.has(id)) return;
  const existing = timers.get(id);
  if (existing) window.clearTimeout(existing);
  timers.set(
    id,
    window.setTimeout(() => {
      cancelGeneration(id, "timeout");
    }, STALL_MS),
  );
}

export function onGenerationStop(listener: (id: string, reason: "cancel" | "timeout") => void) {
  stopListeners.add(listener);
  return () => stopListeners.delete(listener);
}

export function finishGeneration(id: string) {
  const timer = timers.get(id);
  if (timer) window.clearTimeout(timer);
  timers.delete(id);
  jobs = jobs.filter((job) => job.id !== id);
  controllers.delete(id);
  emit();
}

export function cancelGeneration(id: string, reason: "cancel" | "timeout" = "cancel") {
  const controller = controllers.get(id);
  finishGeneration(id);
  if (controller && !controller.signal.aborted) controller.abort(reason);
  stopListeners.forEach((listener) => listener(id, reason));
}

export function useActiveGenerations() {
  return useSyncExternalStore(
    subscribe,
    () => jobs,
    () => [],
  );
}
