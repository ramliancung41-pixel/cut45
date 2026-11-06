"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AgentPlayer } from "@/components/agent-media";
import { useCredits } from "@/components/credit-provider";
import { PromptEditor } from "@/components/prompt-editor";
import { lumenFonts } from "@/lib/lumen-fonts";
import {
  DEFAULT_PACK_ID,
  DEFAULT_SCENE_COUNT,
  DEFAULT_SCENE_SECONDS,
  DEFAULT_TIER_ID,
  MUSIC_TRACK_AVAILABLE,
  MUSIC_TRACK_CREDITS,
  SCENE_SECONDS_OPTIONS,
  STORY_SECONDS,
  TIERS,
  approxPrice,
  formatCredits,
  packById,
  sceneCost,
  storyCost,
  tierById,
  type SceneSeconds,
  type TierId,
} from "@/lib/pricing.config";
import {
  StoryRenderError,
  generateScene,
  splitStoryIdea,
  stitchScenes,
  type SceneRender,
  type StoryCut,
} from "@/lib/story-placeholders";
import { INSUFFICIENT_CREDITS_MESSAGE, videoModelEngine } from "@/lib/video-models";

type SceneStatus = "pending" | "generating" | "done" | "failed";

type StoryScene = {
  id: string;
  prompt: string;
  seconds: SceneSeconds;
  status: SceneStatus;
  progress: number;
  render?: SceneRender;
  error?: string;
};

const IDEA_TARGET = "idea";
const RENDER_CONCURRENCY = 3;

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function isAbort(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function failureMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message : "This scene could not be generated.";
}

export function StoryBuilder({
  mockMode,
  onMockModeChange,
}: {
  mockMode: boolean;
  onMockModeChange: (next: boolean) => void;
}) {
  const { credits, balanceReady, setAccountBalance } = useCredits();
  const [idea, setIdea] = useState("");
  const [tier, setTier] = useState<TierId>(DEFAULT_TIER_ID);
  const [scenes, setScenes] = useState<StoryScene[]>([]);
  const [running, setRunning] = useState(false);
  const [stitching, setStitching] = useState(false);
  const [result, setResult] = useState<StoryCut | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<string>(IDEA_TARGET);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [redoId, setRedoId] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const scenesRef = useRef<StoryScene[]>([]);
  const seqRef = useRef(0);
  const editorRef = useRef<HTMLElement>(null);
  const timelineRef = useRef<HTMLOListElement>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    if (!sheetOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setSheetOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sheetOpen]);

  const pack = packById(DEFAULT_PACK_ID);
  const totalSeconds = scenes.reduce((sum, scene) => sum + scene.seconds, 0);
  const secondsOk = totalSeconds === STORY_SECONDS;
  const total = scenes.length > 0 ? storyCost(tier, false, scenes.map((scene) => scene.seconds)) : storyCost(tier, false);
  const due = scenes
    .filter((scene) => scene.status !== "done")
    .reduce((sum, scene) => sum + sceneCost(tier, scene.seconds), 0);
  const lowBalance = !mockMode && balanceReady && credits < due;
  const busy = running || stitching;
  const allPrompts = scenes.length > 0 && scenes.every((scene) => scene.prompt.trim().length > 0);
  const canGenerate = !busy && secondsOk && allPrompts;
  const targetScene = scenes.find((scene) => scene.id === target);
  const targetIndex = targetScene ? scenes.indexOf(targetScene) : -1;
  const targetLabel = targetScene ? `Scene ${targetIndex + 1}` : "Story idea";

  function newSceneId() {
    seqRef.current += 1;
    return `scene_${seqRef.current}`;
  }

  function updateScenes(updater: (current: StoryScene[]) => StoryScene[]) {
    const next = updater(scenesRef.current);
    scenesRef.current = next;
    setScenes(next);
  }

  function patchScene(id: string, patch: Partial<StoryScene>) {
    updateScenes((current) => current.map((scene) => (scene.id === id ? { ...scene, ...patch } : scene)));
  }

  function staleScene(id: string, patch: Partial<StoryScene>) {
    patchScene(id, { ...patch, status: "pending", progress: 0, render: undefined, error: undefined });
    setResult(null);
  }

  async function syncBalance() {
    try {
      const response = await fetch("/api/auth/session");
      const payload = (await response.json()) as { user?: { credits?: number; tokens?: number } | null };
      const amount = payload.user?.credits ?? payload.user?.tokens;
      if (typeof amount === "number") setAccountBalance(amount);
    } catch {
      // The header keeps the last balance until the next session read.
    }
  }

  function saveToGallery(cut: StoryCut, charged: number) {
    if (!cut.joined || charged <= 0) return;
    const prompts = scenesRef.current.map((scene, index) => `Scene ${index + 1}: ${scene.prompt.trim()}`);
    void fetch("/api/gallery", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: `story_${Date.now().toString(36)}`,
        prompt: idea.trim() || prompts[0],
        script: prompts.join("\n"),
        engine: videoModelEngine(tierById(tier).modelId),
        voiceName: "No voiceover",
        videoUrl: cut.videoUrl,
        credits: charged,
      }),
    }).catch(() => undefined);
  }

  function split() {
    if (idea.trim().length < 3 || busy) return;
    const prompts = splitStoryIdea(idea, DEFAULT_SCENE_COUNT);
    updateScenes(() =>
      prompts.map((prompt) => ({
        id: newSceneId(),
        prompt,
        seconds: DEFAULT_SCENE_SECONDS,
        status: "pending",
        progress: 0,
      })),
    );
    setResult(null);
    setError(null);
    setTarget(IDEA_TARGET);
    window.requestAnimationFrame(() => timelineRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function addScene() {
    updateScenes((current) => [
      ...current,
      { id: newSceneId(), prompt: "", seconds: DEFAULT_SCENE_SECONDS, status: "pending", progress: 0 },
    ]);
    setResult(null);
  }

  function removeScene(id: string) {
    updateScenes((current) => current.filter((scene) => scene.id !== id));
    if (target === id) setTarget(IDEA_TARGET);
    setResult(null);
  }

  function selectTier(next: TierId) {
    if (busy || next === tier) return;
    setTier(next);
    updateScenes((current) =>
      current.map((scene) => ({ ...scene, status: "pending", progress: 0, render: undefined, error: undefined })),
    );
    setResult(null);
  }

  function openEditor(nextTarget: string) {
    setTarget(nextTarget);
    if (window.matchMedia("(max-width: 699px)").matches) {
      setSheetOpen(true);
    } else if (window.matchMedia("(max-width: 1099px)").matches) {
      editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function applyPrompt(text: string) {
    if (targetScene) {
      staleScene(targetScene.id, { prompt: text });
    } else {
      setIdea(text);
    }
    setSheetOpen(false);
  }

  async function renderScene(id: string, controller: AbortController): Promise<SceneRender | null> {
    const scene = scenesRef.current.find((item) => item.id === id);
    if (!scene) return null;
    patchScene(id, { status: "generating", progress: 0, render: undefined, error: undefined });
    try {
      const render = await generateScene(
        { prompt: scene.prompt.trim(), seconds: scene.seconds, tier, mock: mockMode },
        { signal: controller.signal, onProgress: (progress) => patchScene(id, { progress }) },
      );
      patchScene(id, { status: "done", progress: 100, render });
      return render;
    } catch (failure) {
      if (isAbort(failure)) {
        patchScene(id, { status: "pending", progress: 0 });
        throw failure;
      }
      const message = failureMessage(failure);
      patchScene(id, { status: "failed", progress: 0, error: message });
      if (failure instanceof StoryRenderError && failure.insufficientCredits) controller.abort();
      return null;
    }
  }

  async function stitch(signal: AbortSignal) {
    const clips = scenesRef.current.map((scene) => scene.render);
    if (clips.length === 0 || clips.some((clip) => !clip)) return;
    const rendered = clips as SceneRender[];
    setStitching(true);
    try {
      const cut = await stitchScenes(rendered, { signal });
      setResult(cut);
      saveToGallery(cut, rendered.reduce((sum, clip) => sum + clip.creditsCharged, 0));
    } finally {
      setStitching(false);
    }
  }

  function reportFailures() {
    const failed = scenesRef.current.filter((scene) => scene.status === "failed");
    if (failed.some((scene) => scene.error === INSUFFICIENT_CREDITS_MESSAGE || /insufficient credits/i.test(scene.error ?? ""))) {
      setError(`${INSUFFICIENT_CREDITS_MESSAGE}. Scenes that finished were charged; buy credits to render the rest.`);
    } else if (failed.length > 0) {
      setError(
        `${failed.length} scene${failed.length === 1 ? "" : "s"} failed (${failed[0].error}). Failed scenes are not charged — regenerate them, then generate again.`,
      );
    }
  }

  async function generateAll() {
    if (!canGenerate || lowBalance) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    setError(null);
    setResult(null);
    const queue = scenesRef.current.filter((scene) => scene.status !== "done").map((scene) => scene.id);
    try {
      async function worker() {
        while (queue.length > 0 && !controller.signal.aborted) {
          const id = queue.shift();
          if (id) await renderScene(id, controller);
        }
      }
      await Promise.all(Array.from({ length: Math.min(RENDER_CONCURRENCY, queue.length) }, worker));
      if (scenesRef.current.some((scene) => scene.status !== "done")) {
        reportFailures();
        return;
      }
      await stitch(controller.signal);
    } catch (failure) {
      if (!isAbort(failure)) setError(failureMessage(failure));
      else reportFailures();
    } finally {
      setRunning(false);
      abortRef.current = null;
      if (!mockMode) void syncBalance();
    }
  }

  async function regenerate(id: string) {
    if (busy) return;
    const scene = scenesRef.current.find((item) => item.id === id);
    if (!scene || !scene.prompt.trim()) return;
    if (!mockMode && balanceReady && credits < sceneCost(tier, scene.seconds)) {
      setError(`${INSUFFICIENT_CREDITS_MESSAGE}. Buy credits to regenerate this scene.`);
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    setError(null);
    try {
      const render = await renderScene(id, controller);
      if (!render) {
        reportFailures();
        return;
      }
      if (result || scenesRef.current.every((item) => item.status === "done")) await stitch(controller.signal);
    } catch (failure) {
      if (!isAbort(failure)) setError(failureMessage(failure));
    } finally {
      setRunning(false);
      abortRef.current = null;
      if (!mockMode) void syncBalance();
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  return (
    <div className={cn(lumenFonts, "lumen grid items-start gap-5 min-[1100px]:grid-cols-[minmax(0,1fr)_360px]")}>
      <section aria-labelledby="story-heading" className="flex min-w-0 flex-col gap-5">
        <div className="lumen-card p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="story-heading" className="text-lg font-semibold">
                45-second Story
              </h2>
              <p className="mt-1 text-sm text-(--l-muted)">
                Describe the whole story. We split it into {DEFAULT_SCENE_COUNT} scenes you can edit one by one.
              </p>
            </div>
            <button type="button" onClick={() => openEditor(IDEA_TARGET)} className="lumen-btn min-[700px]:hidden">
              <SlidersGlyph />
              Prompt editor
            </button>
          </div>

          <label htmlFor="story-idea" className="mt-4 mb-2 block text-xs font-medium tracking-wide text-(--l-muted) uppercase">
            Story idea
          </label>
          <textarea
            id="story-idea"
            rows={4}
            value={idea}
            disabled={busy}
            onChange={(event) => setIdea(event.target.value)}
            onFocus={() => setTarget(IDEA_TARGET)}
            placeholder="A street-food vendor in a neon-lit night market prepares one perfect bowl of noodles for a lonely traveler."
            className="lumen-input resize-y"
          />

          <fieldset className="mt-4">
            <legend className="mb-2 text-xs font-medium tracking-wide text-(--l-muted) uppercase">Quality tier</legend>
            <div role="radiogroup" aria-label="Quality tier" className="grid gap-2 sm:grid-cols-3">
              {TIERS.map((item) => {
                const on = item.id === tier;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    disabled={busy}
                    onClick={() => selectTier(item.id)}
                    className={cn(
                      "flex min-h-11 flex-col items-start gap-0.5 rounded-xl border px-3 py-2.5 text-left transition",
                      on
                        ? "border-(--l-accent) bg-(--l-selected)"
                        : "border-(--l-input) hover:bg-(--l-raised) disabled:opacity-50",
                    )}
                  >
                    <span className={cn("lumen-display text-sm font-semibold", on ? "text-(--l-accent)" : "text-(--l-text)")}>
                      {item.label}
                    </span>
                    <span className="text-xs text-(--l-muted)">
                      {item.modelLabel} · {item.resolution}
                    </span>
                    <span className="text-xs text-(--l-muted) tabular-nums">
                      {formatCredits(sceneCost(item.id, DEFAULT_SCENE_SECONDS))} per {DEFAULT_SCENE_SECONDS}s scene
                    </span>
                    <span className="mt-1 text-xs font-medium text-(--l-text) tabular-nums">
                      {STORY_SECONDS}s = {formatCredits(storyCost(item.id, false))}
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <button
            type="button"
            onClick={split}
            disabled={idea.trim().length < 3 || busy}
            className="lumen-btn mt-4 w-full sm:w-auto"
          >
            <ScissorsGlyph />
            {scenes.length > 0 ? "Split again" : "Split into scenes"}
          </button>
        </div>

        {scenes.length > 0 ? (
          <div className="lumen-card p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-base font-semibold">Scenes</h3>
              <DurationMeter seconds={totalSeconds} />
            </div>

            <ol
              ref={timelineRef}
              aria-label="Scene timeline"
              className="mt-4 grid scroll-mt-24 gap-3 min-[700px]:grid-cols-2 min-[1100px]:grid-cols-1"
            >
              {scenes.map((scene, index) => (
                <SceneCard
                  key={scene.id}
                  scene={scene}
                  index={index}
                  cost={mockMode ? 0 : sceneCost(tier, scene.seconds)}
                  busy={busy}
                  editing={target === scene.id}
                  onPrompt={(prompt) => staleScene(scene.id, { prompt })}
                  onSeconds={(seconds) => staleScene(scene.id, { seconds })}
                  onFocus={() => setTarget(scene.id)}
                  onEdit={() => openEditor(scene.id)}
                  onRegenerate={() => void regenerate(scene.id)}
                  onRemove={() => removeScene(scene.id)}
                />
              ))}
            </ol>

            <button type="button" onClick={addScene} disabled={busy} className="lumen-btn mt-3 w-full">
              <PlusGlyph />
              Add scene
            </button>

            <div className="mt-4 flex flex-col gap-3 rounded-xl border border-(--l-border) bg-(--l-bg) p-3 sm:flex-row sm:items-center">
              <button
                type="button"
                role="switch"
                aria-checked={false}
                disabled={!MUSIC_TRACK_AVAILABLE}
                className="flex min-h-11 shrink-0 items-center gap-3 rounded-xl pr-2 text-left disabled:opacity-50"
              >
                <span className="lumen-switch" aria-hidden />
                <span>
                  <span className="block text-sm font-medium">Background music</span>
                  <span className="block text-xs text-(--l-muted)">
                    {MUSIC_TRACK_AVAILABLE ? `+${formatCredits(MUSIC_TRACK_CREDITS)}` : "Coming soon · not charged"}
                  </span>
                </span>
              </button>
              <label className="flex min-h-11 flex-1 items-center justify-end gap-2 text-sm text-(--l-muted) sm:justify-end">
                <input
                  type="checkbox"
                  checked={mockMode}
                  disabled={busy}
                  onChange={(event) => onMockModeChange(event.target.checked)}
                  className="h-4 w-4 accent-(--l-accent)"
                />
                Mock mode (free stock clips)
              </label>
            </div>

            <p className="mt-3 flex items-start gap-2 text-xs text-(--l-muted)">
              <InfoGlyph />
              Characters may look slightly different between scenes.
            </p>
          </div>
        ) : null}

        {result || stitching ? (
          <div className="lumen-card p-4 sm:p-5" aria-live="polite">
            <h3 className="text-base font-semibold">Your 45s video</h3>
            {stitching ? (
              <p role="status" className="mt-3 text-sm text-(--l-muted)">
                Joining {scenes.length} scenes into one video…
              </p>
            ) : result ? (
              <div className="mt-4 grid gap-4 min-[700px]:grid-cols-[minmax(0,260px)_1fr]">
                <div className="mx-auto w-full max-w-[260px]">
                  <AgentPlayer src={result.videoUrl} aspect="9:16" captions={false} />
                </div>
                <div className="flex flex-col gap-3">
                  <p className="text-sm text-(--l-muted)">
                    {scenes.length} scenes · {totalSeconds}s · {tierById(tier).label}
                  </p>
                  {result.joined ? null : (
                    <p className="text-xs text-(--l-muted)">
                      Mock mode doesn&apos;t join scenes. The player shows scene 1; each card shows its own clip.
                    </p>
                  )}
                  <a href={result.videoUrl} download="cut45-story.mp4" className="lumen-btn-primary">
                    <DownloadGlyph />
                    Download MP4
                  </a>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <label htmlFor="redo-scene" className="sr-only">
                      Scene to regenerate
                    </label>
                    <select
                      id="redo-scene"
                      value={redoId || scenes[0]?.id || ""}
                      onChange={(event) => setRedoId(event.target.value)}
                      className="lumen-input sm:w-40"
                    >
                      {scenes.map((scene, index) => (
                        <option key={scene.id} value={scene.id}>
                          Scene {index + 1}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => void regenerate(redoId || scenes[0]?.id || "")}
                      disabled={busy}
                      className="lumen-btn flex-1"
                    >
                      <RefreshGlyph />
                      Regenerate a scene
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {scenes.length > 0 ? (
          <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 min-[700px]:bottom-3">
            <div className="flex flex-col gap-3 rounded-2xl border border-(--l-border) bg-(--l-sidebar)/95 p-3 shadow-[0_-12px_40px_rgba(0,0,0,0.45)] backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:p-4">
              <dl className="grid grid-cols-3 gap-3 text-xs sm:flex sm:gap-6">
                <div>
                  <dt className="text-(--l-muted)">{mockMode ? "Mock mode" : due === total ? "Total" : "Remaining"}</dt>
                  <dd className="lumen-display mt-0.5 text-sm font-semibold tabular-nums">
                    {mockMode ? "Free" : formatCredits(due)}
                  </dd>
                </div>
                <div>
                  <dt className="text-(--l-muted)">Approx.</dt>
                  <dd className="mt-0.5 text-sm tabular-nums">
                    {approxPrice(mockMode ? 0 : due, pack.id)}
                    <span className="sr-only"> at the {pack.name} pack rate</span>
                    <span aria-hidden className="hidden text-(--l-muted) sm:inline"> · {pack.name} rate</span>
                  </dd>
                </div>
                <div>
                  <dt className="text-(--l-muted)">Balance</dt>
                  <dd className={cn("mt-0.5 text-sm tabular-nums", lowBalance && "text-(--l-danger)")}>
                    {balanceReady ? formatCredits(credits) : "—"}
                  </dd>
                </div>
              </dl>
              {running ? (
                <button type="button" onClick={stop} className="lumen-btn min-h-12 sm:min-w-52">
                  <StopGlyph />
                  Stop
                </button>
              ) : lowBalance ? (
                <Link href="/pricing" className="lumen-btn-primary sm:min-w-52">
                  <CoinGlyph />
                  Buy credits
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => void generateAll()}
                  disabled={!canGenerate}
                  className="lumen-btn-primary sm:min-w-52"
                >
                  <SparkGlyph />
                  Generate {STORY_SECONDS}s video
                </button>
              )}
            </div>
            {error ? (
              <p role="alert" className="mt-2 rounded-xl border border-(--l-danger)/40 bg-(--l-bg) px-3 py-2 text-sm text-(--l-danger)">
                {error}
              </p>
            ) : !secondsOk ? (
              <p className="mt-2 px-1 text-xs text-(--l-danger)">
                Scenes must add up to exactly {STORY_SECONDS}s before you can generate.
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      {sheetOpen ? (
        <button
          type="button"
          aria-label="Close prompt editor"
          onClick={() => setSheetOpen(false)}
          className="fixed inset-0 z-[60] bg-black/60 min-[700px]:hidden"
        />
      ) : null}
      <aside
        ref={editorRef}
        aria-label="Prompt editor"
        className={cn(
          "lumen-card scroll-mt-20 p-4 sm:p-5",
          sheetOpen
            ? "fixed inset-x-0 bottom-0 z-[61] max-h-[85dvh] overflow-y-auto rounded-b-none pb-[calc(1rem+env(safe-area-inset-bottom))]"
            : "hidden",
          "min-[700px]:static min-[700px]:block min-[700px]:max-h-none min-[700px]:rounded-2xl min-[700px]:pb-5",
          "min-[1100px]:sticky min-[1100px]:top-4 min-[1100px]:max-h-[calc(100dvh-2rem)] min-[1100px]:overflow-y-auto",
        )}
      >
        <PromptEditor
          targetLabel={targetLabel}
          text={targetScene ? targetScene.prompt : idea}
          onApply={applyPrompt}
          onClose={() => setSheetOpen(false)}
        />
      </aside>
    </div>
  );
}

function DurationMeter({ seconds }: { seconds: number }) {
  const ok = seconds === STORY_SECONDS;
  const fill = Math.min(100, (seconds / STORY_SECONDS) * 100);
  return (
    <div className="flex min-w-40 items-center gap-3">
      <div
        role="meter"
        aria-label="Story length"
        aria-valuemin={0}
        aria-valuemax={STORY_SECONDS}
        aria-valuenow={seconds}
        className="h-2 flex-1 overflow-hidden rounded-full bg-(--l-raised)"
      >
        <div
          className={cn("h-full rounded-full transition-[width]", ok ? "bg-(--l-accent)" : "bg-(--l-danger)")}
          style={{ width: `${fill}%` }}
        />
      </div>
      <span className={cn("lumen-display text-sm font-semibold tabular-nums", ok ? "text-(--l-accent)" : "text-(--l-danger)")}>
        {seconds}s / {STORY_SECONDS}s
      </span>
    </div>
  );
}

const STATUS_LABEL: Record<SceneStatus, string> = {
  pending: "Pending",
  generating: "Generating",
  done: "Done",
  failed: "Failed",
};

function SceneCard({
  scene,
  index,
  cost,
  busy,
  editing,
  onPrompt,
  onSeconds,
  onFocus,
  onEdit,
  onRegenerate,
  onRemove,
}: {
  scene: StoryScene;
  index: number;
  cost: number;
  busy: boolean;
  editing: boolean;
  onPrompt: (prompt: string) => void;
  onSeconds: (seconds: SceneSeconds) => void;
  onFocus: () => void;
  onEdit: () => void;
  onRegenerate: () => void;
  onRemove: () => void;
}) {
  const number = index + 1;
  const statusText = scene.status === "generating" ? `Generating ${scene.progress}%` : STATUS_LABEL[scene.status];
  return (
    <li
      className={cn(
        "flex min-w-0 gap-3 rounded-2xl border bg-(--l-bg) p-3",
        editing ? "border-(--l-accent)/60" : "border-(--l-border)",
      )}
    >
      <div className="relative aspect-[9/16] w-20 shrink-0 overflow-hidden rounded-xl bg-(--l-raised) sm:w-24">
        {scene.render ? (
          <video
            src={`${scene.render.videoUrl}#t=0.1`}
            aria-label={`Scene ${number} clip`}
            muted
            playsInline
            loop
            preload="metadata"
            onMouseEnter={(event) => void event.currentTarget.play().catch(() => undefined)}
            onMouseLeave={(event) => event.currentTarget.pause()}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="grid h-full w-full place-items-center text-(--l-muted)">
            <FilmGlyph />
          </div>
        )}
        {scene.status === "generating" ? (
          <div className="absolute inset-x-1.5 bottom-7 h-1 overflow-hidden rounded-full bg-black/50">
            <div className="h-full bg-(--l-accent) transition-[width]" style={{ width: `${scene.progress}%` }} />
          </div>
        ) : null}
        <span className="absolute right-1.5 bottom-1.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-medium text-white tabular-nums">
          0:{String(scene.seconds).padStart(2, "0")}
        </span>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="lumen-display text-sm font-semibold">Scene {number}</span>
          <StatusPill status={scene.status} label={statusText} />
          <div role="radiogroup" aria-label={`Scene ${number} duration`} className="ml-auto flex gap-1">
            {SCENE_SECONDS_OPTIONS.map((seconds) => (
              <button
                key={seconds}
                type="button"
                role="radio"
                aria-checked={scene.seconds === seconds}
                disabled={busy}
                onClick={() => scene.seconds !== seconds && onSeconds(seconds)}
                className="lumen-chip min-h-9 px-2.5 text-xs"
              >
                {seconds}s
              </button>
            ))}
          </div>
        </div>
        <label htmlFor={`scene-${scene.id}`} className="sr-only">
          Scene {number} prompt
        </label>
        <textarea
          id={`scene-${scene.id}`}
          rows={3}
          value={scene.prompt}
          disabled={busy}
          onFocus={onFocus}
          onChange={(event) => onPrompt(event.target.value)}
          placeholder="What happens in this scene?"
          className="lumen-input resize-y text-[13px]"
        />
        {scene.status === "failed" && scene.error ? (
          <p className="text-xs text-(--l-danger)">{scene.error}</p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onRegenerate} disabled={busy || !scene.prompt.trim()} className="lumen-btn min-w-0 flex-1 px-3 text-xs">
            <RefreshGlyph />
            Regenerate scene · {cost > 0 ? formatCredits(cost) : "free"}
          </button>
          <button type="button" onClick={onEdit} disabled={busy} className="lumen-btn px-3" aria-label={`Open scene ${number} in prompt editor`}>
            <SlidersGlyph />
          </button>
          <button type="button" onClick={onRemove} disabled={busy} className="lumen-btn px-3" aria-label={`Remove scene ${number}`}>
            <TrashGlyph />
          </button>
        </div>
      </div>
    </li>
  );
}

function StatusPill({ status, label }: { status: SceneStatus; label: string }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums",
        status === "done" && "bg-(--l-selected) text-(--l-accent)",
        status === "generating" && "bg-(--l-raised) text-(--l-text)",
        status === "failed" && "bg-(--l-danger)/15 text-(--l-danger)",
        status === "pending" && "bg-(--l-raised) text-(--l-muted)",
      )}
    >
      {label}
    </span>
  );
}

function Glyph({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className="h-4 w-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

function SparkGlyph() {
  return (
    <Glyph>
      <path d="M10 3c.4 3 1.9 4.6 5 5-3.1.4-4.6 2-5 5-.4-3-1.9-4.6-5-5 3.1-.4 4.6-2 5-5Z" />
    </Glyph>
  );
}

function ScissorsGlyph() {
  return (
    <Glyph>
      <circle cx="5.5" cy="6" r="2" />
      <circle cx="5.5" cy="14" r="2" />
      <path d="m7.2 7.2 9.3 7.3M7.2 12.8l9.3-7.3" />
    </Glyph>
  );
}

function SlidersGlyph() {
  return (
    <Glyph>
      <path d="M4 6h7M15 6h1M4 14h1M9 14h7" />
      <circle cx="13" cy="6" r="2" />
      <circle cx="7" cy="14" r="2" />
    </Glyph>
  );
}

function RefreshGlyph() {
  return (
    <Glyph>
      <path d="M15.5 8A6 6 0 0 0 4.7 6.5M4.5 12a6 6 0 0 0 10.8 1.5" />
      <path d="M4.5 3.5v3h3M15.5 16.5v-3h-3" />
    </Glyph>
  );
}

function TrashGlyph() {
  return (
    <Glyph>
      <path d="M4 6h12M8 6V4.5h4V6M6 6l.7 9.5h6.6L14 6" />
    </Glyph>
  );
}

function PlusGlyph() {
  return (
    <Glyph>
      <path d="M10 4.5v11M4.5 10h11" />
    </Glyph>
  );
}

function FilmGlyph() {
  return (
    <Glyph>
      <rect x="3.5" y="3" width="13" height="14" rx="2" />
      <path d="M3.5 7h13M3.5 13h13M7 3v4M13 3v4M7 13v4M13 13v4" />
    </Glyph>
  );
}

function DownloadGlyph() {
  return (
    <Glyph>
      <path d="M10 3.5v9M6 9l4 4 4-4M4 16.5h12" />
    </Glyph>
  );
}

function StopGlyph() {
  return (
    <Glyph>
      <rect x="5" y="5" width="10" height="10" rx="1.5" />
    </Glyph>
  );
}

function CoinGlyph() {
  return (
    <Glyph>
      <circle cx="10" cy="10" r="7" />
      <circle cx="10" cy="10" r="3" />
    </Glyph>
  );
}

function InfoGlyph() {
  return (
    <Glyph>
      <circle cx="10" cy="10" r="7" />
      <path d="M10 9v4.5M10 6.5h.01" />
    </Glyph>
  );
}
