"use client";

import { useEffect, useRef, useState } from "react";
import {
  GENERATE_STEPS,
  isGenerateEvent,
  type GenerateEvent,
  type GenerateResult,
  type GenerateStepId,
} from "@/lib/generate";
import { VOICES, isVoiceId, type VoiceId } from "@/lib/voices";
import {
  VISUAL_ENGINES,
  type VisualEngineId,
} from "@/lib/visual-engines";
import { speakNarration, stopNarration } from "@/lib/browser-speech";
import { useCredits } from "@/components/credit-provider";
import { Storyboard } from "@/components/storyboard";
import { useDefaultVoice } from "@/components/use-default-voice";
import { generationCreditCost } from "@/lib/credits";

type StepStatus = "pending" | "started" | "completed";

type StepView = {
  id: GenerateStepId;
  label: string;
  status: StepStatus;
  message: string;
  detail?: string;
};

const INITIAL_STEPS: StepView[] = GENERATE_STEPS.map((step) => ({
  id: step.id,
  label: step.label,
  status: "pending",
  message: "Waiting",
}));

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function GenerateForm() {
  const { voice: storedVoice } = useDefaultVoice();
  const { credits, deductForEngine, archiveProject } = useCredits();
  const [topic, setTopic] = useState("");
  const [voiceOverride, setVoiceOverride] = useState<VoiceId | null>(null);
  const [engine, setEngine] = useState<VisualEngineId>("stock");
  const [steps, setSteps] = useState<StepView[]>(INITIAL_STEPS);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("Waiting for a topic.");
  const [running, setRunning] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const [narrating, setNarrating] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const outcomeRef = useRef<"idle" | "complete" | "error">("idle");
  const trackRef = useRef<HTMLAudioElement | null>(null);
  const voice = voiceOverride ?? storedVoice;

  function stopTrack() {
    const track = trackRef.current;
    if (!track) return;
    track.pause();
    track.removeAttribute("src");
    track.load();
    trackRef.current = null;
  }

  function playTrack(src: string) {
    stopNarration();
    stopTrack();
    const track = new Audio(src);
    trackRef.current = track;
    track.onplay = () => setNarrating(true);
    track.ontimeupdate = () => {
      if (!Number.isFinite(track.duration) || track.duration <= 0) return;
      setPlayhead(Math.min(1, track.currentTime / track.duration));
    };
    track.onended = () => {
      setPlayhead(1);
      setNarrating(false);
    };
    track.onerror = () => setNarrating(false);
    void track.play();
  }

  useEffect(() => {
    if (!result || !isVoiceId(result.voiceId)) return;
    if (result.audioSrc) {
      playTrack(result.audioSrc);
      return () => stopTrack();
    }
    speakNarration(result.script, result.voiceId, {
      onStart: () => setNarrating(true),
      onProgress: setPlayhead,
      onEnd: () => setNarrating(false),
    });
    return () => stopNarration();
  }, [result]);

  function resetRun() {
    outcomeRef.current = "idle";
    setSteps(INITIAL_STEPS.map((step) => ({ ...step })));
    setResult(null);
    setError(null);
    setNotice(null);
    setPlayhead(0);
    setNarrating(false);
  }

  function playNarration() {
    if (!result || !isVoiceId(result.voiceId)) return;
    setPlayhead(0);
    if (result.audioSrc) {
      playTrack(result.audioSrc);
      return;
    }
    stopTrack();
    speakNarration(result.script, result.voiceId, {
      onStart: () => setNarrating(true),
      onProgress: setPlayhead,
      onEnd: () => setNarrating(false),
    });
  }

  function haltNarration() {
    stopNarration();
    stopTrack();
    setNarrating(false);
  }

  function applyEvent(event: GenerateEvent) {
    if (event.type === "progress") {
      setStatusMessage(
        event.detail ? `${event.message}. ${event.detail}` : event.message,
      );
      setSteps((current) =>
        current.map((step) =>
          step.id === event.step
            ? {
                ...step,
                status: event.status,
                message: event.message,
                detail: event.detail ?? step.detail,
              }
            : step,
        ),
      );
      return;
    }

    if (event.type === "complete") {
      outcomeRef.current = "complete";
      deductForEngine(event.result.engine);
      archiveProject({
        id: event.result.id,
        prompt: event.result.topic,
        durationSec: event.result.durationSec,
        engine: event.result.engine,
        engineLabel:
          VISUAL_ENGINES.find((option) => option.id === event.result.engine)?.name ??
          event.result.engine,
        voiceName: event.result.voiceName,
        voiceId: event.result.voiceId,
        script: event.result.script,
        audioSrc: event.result.audioSrc,
        createdAt: new Date().toISOString(),
      });
      setPlayhead(0);
      setResult(event.result);
      setStatusMessage(
        `Preview ready. ${event.result.creditsCharged} credits used.`,
      );
      return;
    }

    outcomeRef.current = "error";
    setError(event.message);
    setStatusMessage(event.message);
  }

  function consumeChunk(chunk: string) {
    const dataLine = chunk
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.startsWith("data:"));
    if (!dataLine) return;

    try {
      const payload: unknown = JSON.parse(
        dataLine.slice(dataLine.indexOf(":") + 1).trim(),
      );
      if (isGenerateEvent(payload)) {
        applyEvent(payload);
      }
    } catch {
      // Ignore a truncated or non-JSON event and keep reading.
    }
  }

  async function readProgress(response: Response, signal: AbortSignal) {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("The generator did not return a progress stream.");
    }

    const decoder = new TextDecoder();
    let buffer = "";

    while (!signal.aborted) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const chunks = buffer.split("\n\n");
      buffer = chunks.pop() ?? "";

      for (const chunk of chunks) {
        consumeChunk(chunk);
      }

      if (done) {
        if (buffer.trim()) consumeChunk(buffer);
        break;
      }
    }
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = topic.trim();

    if (trimmed.length < 3) {
      setError("Use at least 3 characters for the topic.");
      return;
    }

    if (trimmed.length > 120) {
      setError("Keep the topic under 120 characters.");
      return;
    }

    if (!isVoiceId(voice)) {
      setError("Select a voice style.");
      return;
    }

    const cost = generationCreditCost(engine);
    if (credits < cost) {
      setError(`Premium AI generation costs ${cost} credits.`);
      return;
    }

    abortRef.current?.abort();
    haltNarration();
    const controller = new AbortController();
    abortRef.current = controller;

    resetRun();
    setRunning(true);
    setStatusMessage("Starting generation.");

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({ topic: trimmed, voice, engine }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(payload?.error ?? "Could not start generation.");
      }

      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("text/event-stream")) {
        throw new Error("The generator returned an unexpected response.");
      }

      await readProgress(response, controller.signal);

      if (controller.signal.aborted) {
        setNotice("Generation stopped.");
        setStatusMessage("Generation stopped.");
      } else if (outcomeRef.current === "idle") {
        setNotice("The generator stopped before the preview was ready.");
        setStatusMessage("The generator stopped before the preview was ready.");
      }
    } catch (caught) {
      if (controller.signal.aborted) {
        setNotice("Generation stopped.");
        setStatusMessage("Generation stopped.");
      } else {
        const message =
          caught instanceof Error ? caught.message : "Could not generate the video.";
        setError(message);
        setStatusMessage(message);
      }
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      setRunning(false);
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <form onSubmit={onSubmit} className="space-y-6">
        <div>
          <label htmlFor="topic" className="block text-sm font-medium">
            Video topic
          </label>
          <textarea
            id="topic"
            name="topic"
            rows={4}
            maxLength={120}
            value={topic}
            disabled={running}
            placeholder="Why night markets stay cheap"
            onChange={(event) => setTopic(event.target.value)}
            className="mt-2 w-full resize-y rounded-xl border border-line bg-panel px-4 py-3 text-base text-foreground outline-none placeholder:text-muted/70 focus-visible:border-accent"
          />
          <p className="mt-2 text-xs text-muted">{topic.trim().length}/120</p>
        </div>

        <fieldset disabled={running} className="space-y-3">
          <legend className="text-sm font-medium">Voice style</legend>
          <div className="grid gap-2">
            {VOICES.map((option) => {
              const selected = voice === option.id;
              return (
                <label
                  key={option.id}
                  className={cn(
                    "flex cursor-pointer gap-3 rounded-xl border px-4 py-3 transition-colors",
                    selected
                      ? "border-accent bg-accent/10"
                      : "border-line bg-panel hover:border-foreground/20",
                  )}
                >
                  <input
                    type="radio"
                    name="voice"
                    value={option.id}
                    checked={selected}
                    onChange={() => setVoiceOverride(option.id)}
                    className="mt-1 accent-[var(--accent)]"
                  />
                  <span>
                    <span className="block text-sm font-medium">{option.name}</span>
                    <span className="mt-1 block text-sm leading-6 text-muted">
                      {option.description}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <fieldset disabled={running} className="space-y-3">
          <legend className="text-sm font-medium">Visual engine model</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {VISUAL_ENGINES.map((option) => {
              const selected = engine === option.id;
              return (
                <label
                  key={option.id}
                  className={cn(
                    "flex cursor-pointer gap-3 rounded-xl border px-4 py-3 transition-colors",
                    selected
                      ? "border-accent bg-accent/10"
                      : "border-line bg-panel hover:border-foreground/20",
                  )}
                >
                  <input
                    type="radio"
                    name="visual-engine"
                    value={option.id}
                    checked={selected}
                    onChange={() => {
                      setEngine(option.id);
                      if (option.id === "stock") {
                        setError((current) =>
                          current?.startsWith("Premium AI generation costs") ? null : current,
                        );
                      }
                    }}
                    className="mt-1 accent-[var(--accent)]"
                  />
                  <span>
                    <span className="block text-sm font-medium">{option.name}</span>
                    <span className="mt-1 block font-mono text-xs text-accent">
                      {option.rate}
                    </span>
                    <span className="mt-1 block text-sm leading-6 text-muted">
                      {option.description}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
          {engine === "premium" && credits < generationCreditCost("premium") ? (
            <p
              role="status"
              className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm leading-6 text-danger"
            >
              Premium AI generation costs 90 credits.
            </p>
          ) : null}
        </fieldset>

        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={
              running ||
              topic.trim().length < 3 ||
              credits < generationCreditCost(engine)
            }
            className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-accent-ink transition-opacity enabled:hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {running ? "Generating…" : "Generate Video"}
          </button>
          {running ? (
            <button
              type="button"
              onClick={stop}
              className="rounded-full border border-line px-5 py-2.5 text-sm text-foreground hover:bg-panel-raised"
            >
              Stop
            </button>
          ) : null}
        </div>
      </form>

      <section className="rounded-2xl border border-line bg-panel p-5 sm:p-6">
        <p className="sr-only" aria-live="polite">
          {statusMessage}
        </p>
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight">Run</h2>
          <p className="font-mono text-xs text-muted">45s · 9:16 · no face</p>
        </div>

        <ol className="mt-6">
          {steps.map((step, index) => (
            <li key={step.id} className="relative flex gap-4 pb-6 last:pb-0">
              {index < steps.length - 1 ? (
                <span
                  aria-hidden
                  className="absolute top-8 left-[15px] h-[calc(100%-1.25rem)] w-px bg-line"
                />
              ) : null}
              <span
                aria-hidden
                className={cn(
                  "relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border font-mono text-xs",
                  step.status === "completed" && "border-ok bg-ok/15 text-ok",
                  step.status === "started" &&
                    "border-accent bg-accent/15 text-accent",
                  step.status === "pending" && "border-line text-muted",
                )}
              >
                {index + 1}
              </span>
              <div className="min-w-0 pt-1">
                <p className="text-sm font-medium">{step.label}</p>
                <p
                  className={cn(
                    "mt-1 text-sm",
                    step.status === "pending" ? "text-muted" : "text-foreground",
                  )}
                >
                  {step.status === "started" ? "Working…" : step.message}
                </p>
                {step.detail ? (
                  <p className="mt-1 text-sm leading-6 text-muted">{step.detail}</p>
                ) : null}
              </div>
            </li>
          ))}
        </ol>

        {notice ? <p className="mt-4 text-sm text-muted">{notice}</p> : null}

        {result ? (
          <div className="mt-6 border-t border-line pt-6">
            <h3 className="text-base font-semibold tracking-tight">
              Preview {result.id}
            </h3>
            <p className="mt-1 text-sm text-muted">
              {result.durationSec}s · {result.voiceName} · {result.frames.length} clips ·{" "}
              {result.creditsCharged} credits
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={playNarration}
                className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:opacity-90"
              >
                Play narration
              </button>
              <button
                type="button"
                onClick={haltNarration}
                className="rounded-full border border-line px-4 py-2 text-sm text-foreground hover:bg-panel-raised"
              >
                Stop
              </button>
              <p className="text-sm text-muted">{result.audioLabel}</p>
            </div>
            <Storyboard
              frames={result.frames}
              script={result.script}
              playhead={playhead}
              narrating={narrating}
            />
            <h3 className="mt-5 text-sm font-medium">Script</h3>
            <p className="mt-2 text-sm leading-7 text-foreground/90">{result.script}</p>
          </div>
        ) : (
          <p className="mt-2 text-sm leading-6 text-muted">
            Progress lands here while the script is written, the voice reads it,
            and matching clips fill the five-second blocks.
          </p>
        )}
      </section>
    </div>
  );
}
