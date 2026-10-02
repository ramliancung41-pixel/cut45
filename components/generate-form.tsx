"use client";

import { useEffect, useRef, useState } from "react";
import {
  FRAME_COUNT,
  GENERATE_STEPS,
  VIDEO_DURATION_SEC,
  buildStoryboard,
  countWords,
  isGenerateEvent,
  previewScript,
  type GenerateEvent,
  type GenerateResult,
  type GenerateStepId,
} from "@/lib/generate";
import { VOICES, getVoice, isVoiceId, type VoiceId } from "@/lib/voices";
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

const VOICE_NOTE: Record<VoiceId, string> = {
  "warm-narrator": "Steady, close narration",
  "energetic-host": "Bright pace for quick claims",
  "calm-documentary": "Low, dry documentary tone",
  "deep-cinematic": "Wide, low cinematic read",
  "friendly-explainer": "Conversational walkthrough",
};

const ENGINE_NOTE: Record<VisualEngineId, string> = {
  stock: "Free stock loops",
  premium: "Synthetic motion graphics",
};

const FALLBACK_NOTICE =
  "The free-tier limit was reached. A browser preview is ready with stock frames, so you can keep testing.";

function isRecoverableFailure(message: string) {
  return /429|quota|rate.?limit|resource exhausted|free tier|could not reach|elevenlabs|gemini|unexpected response|progress stream/i.test(
    message,
  );
}

function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("The operation was aborted.", "AbortError"));
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("The operation was aborted.", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

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
  const fallbackRef = useRef(false);
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
    fallbackRef.current = false;
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

    if (event.type === "notice") {
      setNotice((current) => (current ? `${current} ${event.message}` : event.message));
      setStatusMessage(event.message);
      return;
    }

    if (event.type === "complete") {
      outcomeRef.current = "complete";
      if (!(event.result.preview && event.result.creditsCharged === 0)) {
        deductForEngine(event.result.engine);
      }
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
        event.result.preview
          ? `Free-tier preview ready. ${event.result.creditsCharged} credits used.`
          : `Preview ready. ${event.result.creditsCharged} credits used.`,
      );
      return;
    }

    if (isRecoverableFailure(event.message)) {
      fallbackRef.current = true;
      outcomeRef.current = "idle";
      setError(null);
      setNotice(FALLBACK_NOTICE);
      setStatusMessage(FALLBACK_NOTICE);
      return;
    }

    outcomeRef.current = "error";
    setError(event.message);
    setStatusMessage(event.message);
  }

  async function runBrowserPreview(topicText: string, signal: AbortSignal) {
    const script = previewScript(topicText);
    const frames = buildStoryboard(script);
    const voiceStyle = getVoice(voice);
    setError(null);
    setNotice(FALLBACK_NOTICE);
    setStatusMessage(FALLBACK_NOTICE);

    for (const step of GENERATE_STEPS) {
      setSteps((current) =>
        current.map((item) =>
          item.id === step.id ? { ...item, status: "started", message: "Working…" } : item,
        ),
      );
      await wait(380, signal);
      setSteps((current) =>
        current.map((item) =>
          item.id === step.id
            ? {
                ...item,
                status: "completed",
                message: "Ready",
                detail: step.id === "frames" ? `${FRAME_COUNT} stock preview frames` : item.detail,
              }
            : item,
        ),
      );
    }

    outcomeRef.current = "complete";
    setPlayhead(0);
    setResult({
      id: `c45_${Date.now().toString(36)}`,
      topic: topicText,
      voiceId: voice,
      voiceName: voiceStyle?.name ?? "Voice",
      durationSec: VIDEO_DURATION_SEC,
      script,
      wordCount: countWords(script),
      audioLabel: `${voiceStyle?.name ?? "Voice"} · browser preview`,
      frames,
      engine,
      creditsCharged: 0,
      preview: true,
    });
    setStatusMessage("Browser preview ready.");
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
        const message = payload?.error ?? "Could not start generation.";
        if (response.status === 429 || response.status >= 500 || isRecoverableFailure(message)) {
          await runBrowserPreview(trimmed, controller.signal);
          return;
        }
        throw new Error(message);
      }

      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("text/event-stream")) {
        throw new Error("The generator returned an unexpected response.");
      }

      await readProgress(response, controller.signal);

      if (controller.signal.aborted) {
        setNotice("Generation stopped.");
        setStatusMessage("Generation stopped.");
      } else if (fallbackRef.current || outcomeRef.current === "idle") {
        await runBrowserPreview(trimmed, controller.signal);
      }
    } catch (caught) {
      if (controller.signal.aborted || (caught instanceof Error && caught.name === "AbortError")) {
        setNotice("Generation stopped.");
        setStatusMessage("Generation stopped.");
      } else {
        const message =
          caught instanceof Error ? caught.message : "Could not generate the video.";
        if (isRecoverableFailure(message) || caught instanceof TypeError) {
          try {
            await runBrowserPreview(trimmed, controller.signal);
          } catch {
            if (!controller.signal.aborted) {
              setNotice(FALLBACK_NOTICE);
              setStatusMessage(FALLBACK_NOTICE);
            }
          }
        } else {
          setError(message);
          setStatusMessage(message);
        }
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

  const activeStep = steps.find((step) => step.status === "started");

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
      <form onSubmit={onSubmit} className="gen-glass space-y-7 rounded-3xl p-5 sm:p-6">
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <label htmlFor="topic" className="text-sm font-medium tracking-tight">
              Video topic
            </label>
            <span className="font-mono text-[11px] text-muted">{topic.trim().length}/120</span>
          </div>
          <textarea
            id="topic"
            name="topic"
            rows={4}
            maxLength={120}
            value={topic}
            disabled={running}
            placeholder="Why night markets stay cheap"
            onChange={(event) => setTopic(event.target.value)}
            className="gen-field mt-3 w-full resize-y rounded-2xl px-4 py-3 text-base leading-7 text-foreground outline-none placeholder:text-muted/60"
          />
        </div>

        <fieldset disabled={running} className="space-y-3">
          <legend className="text-sm font-medium tracking-tight">Voice style</legend>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {VOICES.map((option) => {
              const selected = voice === option.id;
              return (
                <label key={option.id} className={cn("gen-pick", selected && "gen-pick-on")}>
                  <input
                    type="radio"
                    name="voice"
                    value={option.id}
                    checked={selected}
                    onChange={() => setVoiceOverride(option.id)}
                    className="sr-only"
                  />
                  <VoiceBadge id={option.id} selected={selected} />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium tracking-tight">{option.name}</span>
                    <span className="mt-1 block text-sm leading-6 text-muted">
                      {VOICE_NOTE[option.id]}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <fieldset disabled={running} className="space-y-3">
          <legend className="text-sm font-medium tracking-tight">Visual engine model</legend>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {VISUAL_ENGINES.map((option) => {
              const selected = engine === option.id;
              return (
                <label key={option.id} className={cn("gen-pick", selected && "gen-pick-on")}>
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
                    className="sr-only"
                  />
                  <EngineBadge id={option.id} selected={selected} />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium tracking-tight">{option.name}</span>
                    <span className="mt-1 block font-mono text-[11px] tracking-wide text-accent">
                      {option.rate}
                    </span>
                    <span className="mt-1 block text-sm leading-6 text-muted">
                      {ENGINE_NOTE[option.id]}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
          {engine === "premium" && credits < generationCreditCost("premium") ? (
            <p role="status" className="gen-alert">
              Premium AI generation costs 90 credits.
            </p>
          ) : null}
        </fieldset>

        {error ? (
          <p role="alert" className="gen-alert">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={
              running ||
              topic.trim().length < 3 ||
              credits < generationCreditCost(engine)
            }
            className="gen-cta"
          >
            {running ? "Generating…" : "Generate Video"}
          </button>
          {running ? (
            <button type="button" onClick={stop} className="gen-ghost">
              Stop
            </button>
          ) : null}
          <p className="text-xs text-muted">
            {generationCreditCost(engine) === 0
              ? "Free stock · 0 credits"
              : `${generationCreditCost(engine)} credits when the preview is ready`}
          </p>
        </div>
      </form>

      <section className="gen-glass rounded-3xl p-5 sm:p-6">
        <p className="sr-only" aria-live="polite">
          {statusMessage}
        </p>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent">Timeline</p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight">Run</h2>
          </div>
          <p className="rounded-full border border-white/10 px-3 py-1 font-mono text-[11px] text-muted">
            45s · 9:16 · no face
          </p>
        </div>

        <ol className="mt-6">
          {steps.map((step, index) => (
            <li key={step.id} className="relative flex gap-4 pb-6 last:pb-0">
              {index < steps.length - 1 ? (
                <span
                  aria-hidden
                  className={cn(
                    "gen-rail",
                    (step.status === "completed" || step.status === "started") && "gen-rail-on",
                  )}
                />
              ) : null}
              <span
                aria-hidden
                className={cn(
                  "gen-step",
                  step.status === "completed" && "gen-step-done",
                  step.status === "started" && "gen-step-live",
                )}
              >
                {step.status === "started" ? <Spinner /> : step.status === "completed" ? <Check /> : index + 1}
              </span>
              <div className="min-w-0 pt-1">
                <p className="text-sm font-medium tracking-tight">{step.label}</p>
                <p className={cn("mt-1 text-sm", step.status === "pending" ? "text-muted" : "text-foreground")}>
                  {step.status === "started" ? "Working…" : step.message}
                </p>
                {step.detail ? <p className="mt-1 text-sm leading-6 text-muted">{step.detail}</p> : null}
              </div>
            </li>
          ))}
        </ol>

        {notice ? (
          <p role="status" className="gen-notice mt-2">
            {notice}
          </p>
        ) : null}

        <div className="mt-6 border-t border-white/10 pt-6">
          {result ? (
            <div>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold tracking-tight">
                    {result.preview ? "Free-tier preview" : "Preview"} {result.id}
                  </h3>
                  <p className="mt-1 text-sm text-muted">
                    {result.durationSec}s · {result.voiceName} · {result.frames.length} clips ·{" "}
                    {result.creditsCharged} credits
                  </p>
                </div>
                {result.preview ? (
                  <span className="rounded-full border border-ok/30 bg-ok/10 px-3 py-1 text-xs text-ok">
                    Fallback player
                  </span>
                ) : null}
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button type="button" onClick={playNarration} className="gen-cta">
                  Play narration
                </button>
                <button type="button" onClick={haltNarration} className="gen-ghost">
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
              <h3 className="mt-5 text-sm font-medium tracking-tight">Script</h3>
              <p className="mt-2 text-sm leading-7 text-foreground/90">{result.script}</p>
            </div>
          ) : (
            <PreviewSkeleton running={running} label={activeStep?.label} />
          )}
        </div>
      </section>
    </div>
  );
}

function PreviewSkeleton({ running, label }: { running: boolean; label?: string }) {
  return (
    <div>
      <p className="text-sm text-muted">
        {running
          ? `${label ?? "Generation"} is in progress. The 9:16 frame fills in when the clips are ready.`
          : "The vertical preview waits in this frame."}
      </p>
      <div className="mt-4 flex items-end gap-5">
        <div className={cn("gen-frame w-36 shrink-0 sm:w-44", running && "gen-skeleton-live")}>
          <div className="gen-skeleton aspect-[9/16] rounded-[1.15rem]" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2 pb-2">
          <span className={cn("gen-skeleton h-2.5 w-2/3 rounded-full", running && "gen-skeleton-live")} />
          <span className={cn("gen-skeleton h-2.5 w-1/2 rounded-full", running && "gen-skeleton-live")} />
          <span className={cn("gen-skeleton h-2.5 w-3/4 rounded-full", running && "gen-skeleton-live")} />
        </div>
      </div>
    </div>
  );
}

function VoiceBadge({ id, selected }: { id: VoiceId; selected: boolean }) {
  return (
    <span className={cn("gen-badge", selected && "gen-badge-on")} aria-hidden>
      <VoiceGlyph id={id} />
    </span>
  );
}

function EngineBadge({ id, selected }: { id: VisualEngineId; selected: boolean }) {
  return (
    <span className={cn("gen-badge", selected && "gen-badge-on")} aria-hidden>
      {id === "premium" ? <SparkIcon /> : <LayersIcon />}
    </span>
  );
}

function VoiceGlyph({ id }: { id: VoiceId }) {
  if (id === "energetic-host") return <BoltIcon />;
  if (id === "calm-documentary") return <FilmIcon />;
  if (id === "deep-cinematic") return <MoonIcon />;
  if (id === "friendly-explainer") return <ChatIcon />;
  return <WaveIcon />;
}

function Spinner() {
  return (
    <svg viewBox="0 0 16 16" className="gen-spin h-3.5 w-3.5" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1.6" />
      <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function Check() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden>
      <path d="M3.5 8.2 6.4 11 12.5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function WaveIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" aria-hidden>
      <path d="M2 8h1.2M4.4 5.2v5.6M6.6 3.6v8.8M8.8 6v4M11 4.4v7.2M13.2 7h1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function BoltIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" aria-hidden>
      <path d="M9 1.5 3.5 9H8l-1 5.5L12.5 7H8l1-5.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}

function FilmIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" aria-hidden>
      <rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M5 3v10M11 3v10M2 6.5h3M11 6.5h3M2 9.5h3M11 9.5h3" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" aria-hidden>
      <path d="M10.2 2.2A5.6 5.6 0 1 0 13.8 9 4.4 4.4 0 0 1 10.2 2.2Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" aria-hidden>
      <path d="M3 3.5h10v7.2H6.2L3 13V3.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}

function LayersIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" aria-hidden>
      <path d="M8 2.5 13.5 5.5 8 8.5 2.5 5.5 8 2.5ZM2.5 8 8 11l5.5-3M2.5 10.5 8 13.5l5.5-3" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" aria-hidden>
      <path d="M8 1.5 9.2 6 13.5 8 9.2 10 8 14.5 6.8 10 2.5 8 6.8 6 8 1.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}
