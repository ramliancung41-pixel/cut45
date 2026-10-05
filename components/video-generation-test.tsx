"use client";

import { useRef, useState } from "react";
import { BUDGET_GENERATION_COST, ULTRA_GENERATION_COST } from "@/lib/credits";

const STYLES = [
  { id: "realistic", label: "Realistic" },
  { id: "cinematic", label: "Cinematic" },
  { id: "anime", label: "Anime" },
] as const;

type TestStyle = (typeof STYLES)[number]["id"];
type StepId = "script" | "voice" | "video";
type StepState = "waiting" | "running" | "done" | "error";

const STEPS: Array<{ id: StepId; label: string }> = [
  { id: "script", label: "Script" },
  { id: "voice", label: "Voice" },
  { id: "video", label: "Video" },
];

function creditCost(style: TestStyle) {
  return style === "cinematic" ? ULTRA_GENERATION_COST : BUDGET_GENERATION_COST;
}

export function VideoGenerationTest() {
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState<TestStyle>("realistic");
  const [steps, setSteps] = useState<Record<StepId, StepState>>({
    script: "waiting",
    voice: "waiting",
    video: "waiting",
  });
  const [script, setScript] = useState("");
  const [audioSrc, setAudioSrc] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [charged, setCharged] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  function mark(id: StepId, state: StepState) {
    setSteps((current) => ({ ...current, [id]: state }));
  }

  async function post(body: Record<string, unknown>) {
    const response = await fetch("/api/video-test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) {
      throw new Error(payload?.error || "The test step failed.");
    }
    return payload as Record<string, unknown>;
  }

  async function onGenerate() {
    if (running || prompt.trim().length < 3) return;
    setRunning(true);
    setError(null);
    setScript("");
    setAudioSrc("");
    setVideoUrl("");
    setCharged(null);
    setSteps({ script: "running", voice: "waiting", video: "waiting" });

    try {
      const planned = await post({ step: "script", prompt: prompt.trim(), style });
      const nextScript = String(planned.script ?? "");
      const visualPrompt = String(planned.visualPrompt ?? "");
      setScript(nextScript);
      mark("script", "done");
      mark("voice", "running");

      const voiced = await post({ step: "voice", prompt: prompt.trim(), style, script: nextScript });
      setAudioSrc(String(voiced.audioSrc ?? ""));
      mark("voice", "done");
      mark("video", "running");

      const filmed = await post({
        step: "video",
        prompt: prompt.trim(),
        style,
        visualPrompt,
      });
      const url = String(filmed.videoUrl ?? "");
      const credits = Number(filmed.credits);
      setVideoUrl(url);
      mark("video", "done");

      const spent = await fetch("/api/credits/spend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          engine: filmed.engine === "ultra" ? "ultra" : "budget",
        }),
      });
      const spendPayload = (await spent.json().catch(() => null)) as { charged?: number; error?: string } | null;
      if (spent.ok && typeof spendPayload?.charged === "number") {
        setCharged(spendPayload.charged);
      } else {
        setCharged(credits);
        setError(spendPayload?.error || "The clip is ready. The credit balance was not updated.");
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Generation failed.";
      setError(message);
      setSteps((current) => {
        const next = { ...current };
        (Object.keys(next) as StepId[]).forEach((id) => {
          if (next[id] === "running") next[id] = "error";
        });
        return next;
      });
    } finally {
      setRunning(false);
    }
  }

  async function onDownload() {
    if (!videoUrl) return;
    try {
      const response = await fetch(videoUrl);
      if (!response.ok) throw new Error("download failed");
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = "cut45-test.mp4";
      link.click();
      URL.revokeObjectURL(objectUrl);
    } catch {
      window.open(videoUrl, "_blank", "noopener,noreferrer");
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <header className="mb-8">
        <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-accent">Test</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Video generation test</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-muted">
          Gemini writes the script, ElevenLabs records the voice, then Fal renders the clip.
          Cinematic uses the Luma model and costs {ULTRA_GENERATION_COST} credits. Realistic and
          Anime cost {BUDGET_GENERATION_COST}.
        </p>
      </header>

      <label className="block text-sm font-medium" htmlFor="video-test-prompt">
        Prompt
      </label>
      <textarea
        id="video-test-prompt"
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        rows={4}
        placeholder="A night market cook discovers the stall lights remember every recipe."
        className="mt-2 w-full rounded-2xl border border-white/15 bg-background px-4 py-3 text-sm outline-none focus:border-white/40"
      />

      <p className="mt-5 text-sm font-medium">Style</p>
      <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Style">
        {STYLES.map((option) => {
          const selected = style === option.id;
          return (
            <label
              key={option.id}
              className={
                selected
                  ? "cursor-pointer rounded-full border border-white bg-white px-4 py-2 text-sm font-medium text-black"
                  : "cursor-pointer rounded-full border border-white/15 px-4 py-2 text-sm text-foreground"
              }
            >
              <input
                type="radio"
                name="style"
                value={option.id}
                checked={selected}
                onChange={() => setStyle(option.id)}
                className="sr-only"
              />
              {option.label}
            </label>
          );
        })}
      </div>

      <button
        type="button"
        disabled={running || prompt.trim().length < 3}
        onClick={() => void onGenerate()}
        className="mt-6 inline-flex h-12 items-center justify-center rounded-full bg-white px-6 text-sm font-medium text-black disabled:cursor-not-allowed disabled:opacity-50"
      >
        {running ? "Generating…" : `Generate Video · ${creditCost(style)} credits`}
      </button>

      <ol className="mt-6 flex flex-wrap gap-2" aria-label="Generation progress">
        {STEPS.map((step) => {
          const state = steps[step.id];
          const label =
            state === "running" ? "Working" : state === "done" ? "Done" : state === "error" ? "Failed" : "Waiting";
          return (
            <li
              key={step.id}
              className="rounded-full border border-white/15 px-3 py-1.5 text-xs font-medium"
            >
              {step.label}
              <span className="ml-2 text-muted">{label}</span>
            </li>
          );
        })}
      </ol>

      {error ? (
        <p role="alert" className="mt-4 text-sm text-[#ff9b8a]">
          {error}
        </p>
      ) : null}

      {script ? (
        <section className="mt-8">
          <h2 className="text-sm font-medium">Script</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted">{script}</p>
        </section>
      ) : null}

      {videoUrl ? (
        <section className="mt-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-medium">Output</h2>
            {charged != null ? (
              <p className="rounded-full border border-white/15 px-3 py-1 text-xs font-medium">
                −{charged} credits
              </p>
            ) : null}
          </div>
          <video
            ref={videoRef}
            src={videoUrl}
            controls
            playsInline
            className="mt-3 aspect-[9/16] w-full max-w-sm rounded-2xl bg-black"
            onPlay={() => void audioRef.current?.play()}
            onPause={() => audioRef.current?.pause()}
          />
          {audioSrc ? <audio ref={audioRef} src={audioSrc} /> : null}
          <button
            type="button"
            onClick={() => void onDownload()}
            className="mt-4 inline-flex h-11 items-center justify-center rounded-full border border-white/20 px-5 text-sm font-medium"
          >
            Download Video
          </button>
        </section>
      ) : null}
    </div>
  );
}
