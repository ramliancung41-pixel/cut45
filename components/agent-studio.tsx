"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { AgentChatPanel, Glyph, Spinner, type CardStatus } from "@/components/agent-chat";
import { AgentPlayer } from "@/components/agent-media";
import { useCredits } from "@/components/credit-provider";
import { UpgradeModal } from "@/components/upgrade-modal";
import { useDefaultVoice } from "@/components/use-default-voice";
import {
  peekAgentDraft,
  peekAgentHandoff,
  takeAgentDraft,
  takeAgentHandoff,
  type AgentDraft,
  type AgentHandoff,
  type AgentRunExtras,
} from "@/lib/agent-handoff";
import { brandBrief, brandStore, pluginStore } from "@/lib/studio-prefs";
import { saveAgentSession, startAgentSessions, useAgentSessions } from "@/lib/agent-session-store";
import {
  UNTITLED_SESSION,
  agentSessionTitle,
  newAgentSessionId,
  type AgentGeneration as Generation,
  type AgentMessage,
  type AgentSession,
  type AgentStep,
} from "@/lib/agent-sessions";
import {
  parseAgentSuggestion,
  suggestionCreditCost,
  suggestionHasVoice,
  suggestionModelName,
  suggestionResolution,
  type AgentSuggestion,
} from "@/lib/agent-suggestion";
import { GENERATE_STEPS, countWords, isGenerateEvent, type GenerateResult } from "@/lib/generate";
import { imageStyleName } from "@/lib/image-styles";
import { PROMPT_MAX } from "@/lib/motion-styles";
import { imageThumbnail } from "@/lib/image-thumbnail";
import { prepareReferenceImage } from "@/lib/prepare-reference-image";
import { videoModelEngine } from "@/lib/video-models";

type Attachment = { full: string; thumb: string };

const RENDER_POLL_MS = 8 * 60 * 1000;
const THUMB_EDGE = 384;
const INTERRUPTED = "This render was interrupted. Finished clips still appear in the Gallery.";

function thumbnail(dataUrl: string) {
  return imageThumbnail(dataUrl, THUMB_EDGE);
}

function restoreGenerations(generations: Generation[]) {
  return generations.map((item) =>
    item.status === "running"
      ? {
          ...item,
          status: item.url ? ("done" as const) : ("error" as const),
          error: item.url ? undefined : INTERRUPTED,
          steps: item.steps?.map((step) => (step.status === "started" ? { ...step, status: "failed" as const } : step)),
        }
      : item,
  );
}

function persistable(generations: Generation[]) {
  return generations.map((item) =>
    item.audioUrl && !item.audioUrl.startsWith("https://") ? { ...item, audioUrl: undefined } : item,
  );
}

const IMAGE_STEPS = [
  { id: "prompt", label: "Preparing prompt" },
  { id: "style", label: "Applying model and ratio" },
  { id: "render", label: "Rendering image" },
];

function pendingSteps(steps: ReadonlyArray<{ id: string; label: string }>): AgentStep[] {
  return steps.map((step) => ({ id: step.id, label: step.label, status: "pending" }));
}

function handoffMessages(handoff: AgentHandoff): AgentMessage[] {
  const { suggestion } = handoff;
  return [
    { id: handoff.userMessageId, role: "user", text: suggestion.prompt },
    {
      id: handoff.assistantMessageId,
      role: "assistant",
      text: `Generating your ${suggestion.kind} based on prompt: "${suggestion.prompt}"...`,
      suggestion,
    },
  ];
}

function newId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function aspectStyle(aspect: string, maxHeight = "64dvh") {
  const [w, h] = aspect.split(":").map(Number);
  const ratio = w > 0 && h > 0 ? `${w} / ${h}` : "16 / 9";
  return { aspectRatio: ratio, maxWidth: `calc(${maxHeight} * ${ratio})` };
}

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

export function AgentStudioPage() {
  const params = useSearchParams();
  const router = useRouter();
  const chat = params.get("chat");
  const { ready, sessions } = useAgentSessions();

  useEffect(() => {
    startAgentSessions();
  }, []);

  useEffect(() => {
    if (chat || !ready) return;
    router.replace(`/agent?chat=${sessions[0]?.id ?? newAgentSessionId()}`);
  }, [chat, ready, sessions, router]);

  const session = chat ? sessions.find((item) => item.id === chat) ?? null : null;
  if (!chat || (!ready && !session)) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center gap-2 text-sm text-muted" role="status">
        <Spinner light />
        Loading chat…
      </div>
    );
  }
  return <AgentStudio key={chat} sessionId={chat} initial={session} />;
}

function AgentStudio({ sessionId, initial }: { sessionId: string; initial: AgentSession | null }) {
  const router = useRouter();
  const { credits, balanceReady, deductImageCredits, archiveProject, setAccountBalance } = useCredits();
  const { voice } = useDefaultVoice();
  const [handoff] = useState(() => peekAgentHandoff(sessionId));
  const [draft] = useState(() => peekAgentDraft(sessionId));
  const [messages, setMessages] = useState<AgentMessage[]>(() => [
    ...(initial?.messages ?? []),
    ...(handoff ? handoffMessages(handoff) : []),
    ...(draft ? [{ id: draft.messageId, role: "user" as const, text: draft.message }] : []),
  ]);
  const [sending, setSending] = useState(false);
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [attachmentPending, setAttachmentPending] = useState(false);
  const [generations, setGenerations] = useState<Generation[]>(() => restoreGenerations(initial?.generations ?? []));
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const plugins = pluginStore.useValue();
  const chatAbortRef = useRef<AbortController | null>(null);
  const renderAbortRef = useRef(new Set<AbortController>());
  const attachIdRef = useRef(0);
  const extrasRef = useRef(new Map<string, AgentRunExtras>());
  const createdAtRef = useRef(initial?.createdAt ?? "");
  const loadedRef = useRef({ messages, generations });
  const title = messages.length > 0 ? agentSessionTitle(messages) : UNTITLED_SESSION;

  useEffect(() => {
    const renders = renderAbortRef.current;
    return () => {
      chatAbortRef.current?.abort();
      renders.forEach((controller) => controller.abort());
    };
  }, []);

  useEffect(() => {
    if (messages.length === 0) return;
    if (messages === loadedRef.current.messages && generations === loadedRef.current.generations) return;
    const now = new Date().toISOString();
    if (!createdAtRef.current) createdAtRef.current = now;
    saveAgentSession({
      id: sessionId,
      title,
      createdAt: createdAtRef.current,
      updatedAt: now,
      messages,
      generations: persistable(generations),
    });
  }, [messages, generations, sessionId, title]);

  const startHandoff = useEffectEvent((next: AgentHandoff) => {
    extrasRef.current.set(next.assistantMessageId, next.extras);
    const [, assistant] = handoffMessages(next);
    void generate(assistant);
    const reference = next.extras.referenceImage;
    if (reference) {
      void thumbnail(reference).then((thumb) => {
        if (!thumb) return;
        setMessages((current) =>
          current.map((message) => (message.id === next.userMessageId ? { ...message, image: thumb } : message)),
        );
      });
    }
  });

  const startDraft = useEffectEvent((draft: AgentDraft) => {
    void askCopilot(draft.message, draft.image ?? null, []);
    if (draft.image) {
      void thumbnail(draft.image).then((thumb) => {
        if (!thumb) return;
        setMessages((current) =>
          current.map((message) => (message.id === draft.messageId ? { ...message, image: thumb } : message)),
        );
      });
    }
  });

  useEffect(() => {
    const next = takeAgentHandoff(sessionId);
    if (next) startHandoff(next);
    const draft = takeAgentDraft(sessionId);
    if (draft) startDraft(draft);
  }, [sessionId]);

  async function attach(file: File) {
    const attachId = ++attachIdRef.current;
    setAttachment(null);
    setAttachmentPending(true);
    try {
      const full = await prepareReferenceImage(file);
      const thumb = await thumbnail(full);
      if (attachIdRef.current === attachId) setAttachment({ full, thumb: thumb || full });
    } catch (caught) {
      if (attachIdRef.current !== attachId) return;
      const message = caught instanceof Error ? caught.message : "Could not prepare that image.";
      setMessages((current) => [...current, { id: newId("msg"), role: "assistant", text: message, failed: true }]);
    } finally {
      if (attachIdRef.current === attachId) setAttachmentPending(false);
    }
  }

  function clearAttachment() {
    attachIdRef.current += 1;
    setAttachment(null);
    setAttachmentPending(false);
  }

  function send(raw: string) {
    const text = raw.trim();
    if (sending || attachmentPending || (!text && !attachment)) return false;
    const image = attachment;
    const history = messages
      .filter((message) => message.text && !message.failed)
      .slice(-12)
      .map((message) => ({ role: message.role, text: message.text }));
    setMessages((current) => [...current, { id: newId("msg"), role: "user", text, image: image?.thumb }]);
    clearAttachment();
    void askCopilot(text, image?.full ?? null, history);
    return true;
  }

  async function askCopilot(text: string, image: string | null, history: Array<{ role: string; text: string }>) {
    chatAbortRef.current?.abort();
    const controller = new AbortController();
    chatAbortRef.current = controller;
    setSending(true);
    try {
      const response = await fetch("/api/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          kind: "agent",
          prompt: text,
          image: image ?? undefined,
          messages: history,
          brand: brandBrief(brandStore.read()) || undefined,
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        reply?: string;
        reasoning?: string;
        suggestion?: unknown;
        error?: string;
      } | null;
      if (!response.ok || typeof payload?.reply !== "string") {
        throw new Error(payload?.error ?? "The Co-Pilot could not answer. Try again.");
      }
      const assistantId = newId("msg");
      if (image) extrasRef.current.set(assistantId, { referenceImage: image });
      setMessages((current) => [
        ...current,
        {
          id: assistantId,
          role: "assistant",
          text: payload.reply ?? "",
          reasoning: payload.reasoning || undefined,
          suggestion: parseAgentSuggestion(payload.suggestion, PROMPT_MAX),
        },
      ]);
    } catch (caught) {
      if (controller.signal.aborted) return;
      const message = caught instanceof Error ? caught.message : "The Co-Pilot could not answer. Try again.";
      setMessages((current) => [...current, { id: newId("msg"), role: "assistant", text: message, failed: true }]);
    } finally {
      if (chatAbortRef.current === controller) {
        chatAbortRef.current = null;
        setSending(false);
      }
    }
  }

  function cardStatus(messageId: string): CardStatus {
    const latest = generations.find((generation) => generation.sourceId === messageId);
    return latest ? latest.status : "idle";
  }

  async function continueScene(message: AgentMessage) {
    const suggestion = message.suggestion;
    if (!suggestion || suggestion.kind !== "video") return;
    const previous = generations.find((item) => item.sourceId === message.id && item.kind === "video" && item.url);
    if (!previous?.url) return;
    if (balanceReady && credits < 15) {
      setUpgradeOpen(true);
      return;
    }
    const extras = extrasRef.current.get(message.id);
    const savedStill =
      extras?.referenceImage &&
      !/\.mp4(\?|#|$)/i.test(extras.referenceImage) &&
      (extras.referenceImage.startsWith("https://") || extras.referenceImage.startsWith("data:image/"))
        ? extras.referenceImage
        : "";
    const id = newId("gen");
    setGenerations((current) => [
      {
        id,
        sourceId: message.id,
        kind: "video",
        title: `${previous.title} · continued`,
        prompt: suggestion.prompt,
        modelName: "Wan 2.1",
        aspect: "16:9",
        status: "running",
        durationSec: 5,
      },
      ...current,
    ]);
    setSelectedId(id);
    try {
      const response = await fetch("/api/generate-scene", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionPrompt: suggestion.prompt.slice(0, 2000),
          ...(savedStill ? { characterImageUrl: savedStill } : { continueFromVideoUrl: previous.url }),
        }),
      });
      const payload = (await response.json().catch(() => null)) as { success?: boolean; videoUrl?: string; error?: string } | null;
      if (!response.ok || !payload?.success || !payload.videoUrl) {
        if (response.status === 402) setUpgradeOpen(true);
        throw new Error(payload?.error ?? "The scene could not be continued.");
      }
      updateGeneration(id, { status: "done", url: payload.videoUrl });
      void syncBalance();
    } catch (caught) {
      const text = caught instanceof Error ? caught.message : "The scene could not be continued.";
      updateGeneration(id, { status: "error", error: text });
    }
  }

  async function syncBalance() {
    try {
      const response = await fetch("/api/auth/session");
      const payload = (await response.json()) as { user?: { credits?: number; tokens?: number } | null };
      const amount = payload.user?.credits ?? payload.user?.tokens;
      if (typeof amount === "number") setAccountBalance(amount);
    } catch {
      // The badge keeps the last balance until the next session read.
    }
  }

  function updateGeneration(id: string, patch: Partial<Generation>) {
    setGenerations((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function patchStep(id: string, stepId: string, patch: Partial<AgentStep>) {
    setGenerations((current) =>
      current.map((item) =>
        item.id === id
          ? { ...item, steps: item.steps?.map((step) => (step.id === stepId ? { ...step, ...patch } : step)) }
          : item,
      ),
    );
  }

  function failOpenSteps(id: string) {
    setGenerations((current) =>
      current.map((item) =>
        item.id === id
          ? { ...item, steps: item.steps?.map((step) => (step.status === "started" ? { ...step, status: "failed" } : step)) }
          : item,
      ),
    );
  }

  async function generate(message: AgentMessage) {
    const suggestion = message.suggestion;
    if (!suggestion) return;
    const cost = suggestionCreditCost(suggestion, pluginStore.read().voiceover);
    if (balanceReady && credits < cost) {
      setUpgradeOpen(true);
      return;
    }
    const id = newId("gen");
    setGenerations((current) => [
      {
        id,
        sourceId: message.id,
        kind: suggestion.kind,
        title: suggestion.title,
        prompt: suggestion.prompt,
        modelName: suggestionModelName(suggestion),
        aspect: suggestion.aspect,
        status: "running",
        steps: pendingSteps(suggestion.kind === "video" ? GENERATE_STEPS : IMAGE_STEPS),
        ...(suggestion.kind === "video" ? { durationSec: suggestion.durationSec } : {}),
      },
      ...current,
    ]);
    setSelectedId(id);
    const controller = new AbortController();
    renderAbortRef.current.add(controller);
    const extras = extrasRef.current.get(message.id) ?? {};
    try {
      const output =
        suggestion.kind === "image"
          ? { url: await renderImage(id, suggestion, cost, extras, controller.signal) }
          : await renderVideo(id, suggestion, extras, controller.signal);
      updateGeneration(id, { status: "done", ...output });
    } catch (caught) {
      if (controller.signal.aborted) return;
      const text = caught instanceof Error ? caught.message : "Generation failed.";
      failOpenSteps(id);
      updateGeneration(id, { status: "error", error: text });
    } finally {
      renderAbortRef.current.delete(controller);
    }
  }

  async function renderImage(
    id: string,
    suggestion: Extract<AgentSuggestion, { kind: "image" }>,
    cost: number,
    extras: AgentRunExtras,
    signal: AbortSignal,
  ) {
    const modelName = suggestionModelName(suggestion);
    const style = suggestion.style || brandStore.read().style || undefined;
    patchStep(id, "prompt", { status: "completed", detail: `${countWords(suggestion.prompt)} words ready` });
    patchStep(id, "style", {
      status: "completed",
      detail: [modelName, suggestion.aspect, style ? imageStyleName(style) : ""]
        .filter(Boolean)
        .join(" · "),
    });
    patchStep(id, "render", { status: "started", detail: "Fal.ai is rendering the image" });
    const response = await fetch("/api/image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        prompt: suggestion.prompt,
        model: suggestion.model,
        aspect: suggestion.aspect,
        ...(style ? { style } : {}),
        ...(extras.referenceImage ? { referenceImage: extras.referenceImage } : {}),
      }),
    });
    const payload = (await response.json().catch(() => null)) as { imageUrl?: string; prompt?: string; error?: string } | null;
    if (!response.ok || typeof payload?.imageUrl !== "string") {
      throw new Error(payload?.error ?? "Could not render that image.");
    }
    patchStep(id, "render", { status: "completed", detail: `Image ready · Fal.ai · ${modelName}` });
    const prompt = payload.prompt || suggestion.prompt;
    deductImageCredits(cost, suggestion.model);
    archiveProject({
      id,
      prompt,
      durationSec: 0,
      engine: "image",
      engineLabel: modelName,
      voiceName: "Co-Pilot",
      voiceId: "",
      script: prompt,
      imageSrc: payload.imageUrl,
      kind: "image",
      creditsCharged: cost,
      createdAt: new Date().toISOString(),
    });
    void fetch("/api/gallery", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "image", id, prompt, imageUrl: payload.imageUrl, styleName: "Co-Pilot", credits: cost }),
    }).catch(() => undefined);
    return payload.imageUrl;
  }

  async function renderVideo(
    id: string,
    suggestion: Extract<AgentSuggestion, { kind: "video" }>,
    extras: AgentRunExtras,
    signal: AbortSignal,
  ): Promise<Partial<Generation>> {
    const speaker =
      suggestionHasVoice(suggestion, pluginStore.read().voiceover) && extras.voice !== "none" ? extras.voice ?? voice : "none";
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      signal,
      body: JSON.stringify({
        topic: suggestion.prompt.slice(0, PROMPT_MAX),
        voice: speaker,
        ...(extras.language ? { language: extras.language } : {}),
        engine: videoModelEngine(suggestion.model),
        videoModel: suggestion.model,
        resolution: suggestionResolution(suggestion),
        durationSec: suggestion.durationSec,
        aspect: suggestion.aspect,
        ...(extras.referenceImage ? { referenceImage: extras.referenceImage } : {}),
        ...(extras.motionStyle ? { motionStyle: extras.motionStyle } : {}),
        ...(extras.mockMode ? { mockMode: true } : {}),
      }),
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (response.status === 402) setUpgradeOpen(true);
      throw new Error(payload?.error ?? "Could not start the video.");
    }

    let finished: GenerateResult | null = null;
    let pending: { statusUrl: string; responseUrl: string; ticket?: string; result: GenerateResult } | null = null;
    const reader = response.body?.getReader();
    if (!reader) throw new Error("The generator did not return a progress stream.");
    const decoder = new TextDecoder();
    let buffer = "";
    const consume = (chunk: string) => {
      const line = chunk
        .split("\n")
        .map((item) => item.trim())
        .find((item) => item.startsWith("data:"));
      if (!line) return;
      let event: unknown;
      try {
        event = JSON.parse(line.slice(5).trim());
      } catch {
        return;
      }
      if (!isGenerateEvent(event)) return;
      if (event.type === "error") throw new Error(event.message || "The video could not be generated.");
      if (event.type === "progress") {
        patchStep(id, event.step, {
          status: event.status,
          detail: event.detail ?? (event.status === "started" ? `${event.message}…` : event.message),
        });
      }
      if (event.type === "complete") finished = event.result;
      if (event.type === "rendering") {
        pending = event;
        patchStep(id, "frames", { status: "started", detail: "Fal.ai is rendering the clip" });
      }
    };
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const chunks = buffer.split("\n\n");
      buffer = chunks.pop() ?? "";
      chunks.forEach(consume);
      if (done) {
        if (buffer.trim()) consume(buffer);
        break;
      }
    }

    let result = finished as GenerateResult | null;
    let videoUrl = result?.videoUrl || result?.frames.find((frame) => frame.src.startsWith("https://"))?.src || "";
    const queued = pending as { statusUrl: string; responseUrl: string; ticket?: string; result: GenerateResult } | null;
    if (!videoUrl && queued) {
      const done = await pollRender(queued.statusUrl, queued.responseUrl, queued.ticket, signal);
      videoUrl = done.videoUrl;
      result = {
        ...queued.result,
        videoUrl: done.videoUrl,
        creditsCharged: done.creditsCharged ?? 0,
        ...(done.audioSrc ? { audioSrc: done.audioSrc } : {}),
        ...(done.audioLabel ? { audioLabel: done.audioLabel } : {}),
        narrationEmbedded: Boolean(done.narrationEmbedded),
      };
      if (speaker !== "none") {
        patchStep(id, "audio", {
          status: done.audioSrc ? "completed" : "failed",
          detail: done.audioSrc ? done.audioLabel ?? "Voiceover ready" : "The voiceover could not be recorded",
        });
      }
    }
    void syncBalance();
    if (!videoUrl || !result) throw new Error("The video finished without a playable clip.");
    patchStep(id, "frames", {
      status: "completed",
      detail: `${result.mock ? "Mock stock clip" : "Fal.ai clip ready"} · ${suggestion.durationSec}s · ${suggestion.aspect}`,
    });

    const output: Partial<Generation> = {
      url: videoUrl,
      script: result.script,
      ...(result.narrationEmbedded ? { voiceEmbedded: true } : {}),
      ...(result.audioSrc ? { audioUrl: result.audioSrc } : {}),
      ...(result.audioSrc && result.audioLabel ? { voiceLabel: result.audioLabel } : {}),
    };
    if (speaker === "none") {
      patchStep(id, "audio", { status: "completed", detail: "No voiceover selected" });
    }

    if (!result.mock && result.creditsCharged > 0) {
      const finalUrl = output.url ?? videoUrl;
      archiveProject({
        id,
        prompt: suggestion.prompt,
        durationSec: result.durationSec,
        engine: result.engine,
        engineLabel: suggestionModelName(suggestion),
        voiceName: result.voiceName,
        voiceId: result.voiceId,
        script: result.script,
        videoSrc: finalUrl,
        creditsCharged: result.creditsCharged,
        createdAt: new Date().toISOString(),
      });
      void fetch("/api/gallery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          prompt: suggestion.prompt,
          script: result.script,
          engine: result.engine,
          voiceName: result.voiceName,
          videoUrl: finalUrl,
          credits: result.creditsCharged,
        }),
      }).catch(() => undefined);
    }
    return output;
  }

  type FinishedRender = {
    videoUrl: string;
    creditsCharged?: number;
    audioSrc?: string;
    audioLabel?: string;
    narrationEmbedded?: boolean;
  };

  async function pollRender(
    statusUrl: string,
    responseUrl: string,
    ticket: string | undefined,
    signal: AbortSignal,
  ): Promise<FinishedRender> {
    const started = Date.now();
    while (Date.now() - started < RENDER_POLL_MS) {
      const response = await fetch("/api/video/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statusUrl, responseUrl, ticket }),
        signal,
      }).catch((error: unknown) => {
        if (signal.aborted) throw error;
        return null;
      });
      const payload = (await response?.json().catch(() => null)) as
        | (Partial<FinishedRender> & { pending?: boolean; error?: string })
        | null;
      if (typeof payload?.videoUrl === "string" && payload.videoUrl.startsWith("https://")) {
        return payload as FinishedRender;
      }
      if (payload?.error && response && response.status < 500) throw new Error(payload.error);
      await sleep(3000, signal);
    }
    throw new Error("Fal.ai is still rendering this clip. Check the Gallery in a moment.");
  }

  function newChat() {
    router.push(`/agent?chat=${newAgentSessionId()}`);
  }

  const featured = generations.find((item) => item.id === selectedId) ?? generations[0] ?? null;

  return (
    <div className="flex min-h-[100dvh] flex-col lg:flex-row">
      <section aria-label="Canvas" className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-white/[0.06] bg-black/20 px-5 backdrop-blur-xl">
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold tracking-tight text-zinc-100">{title}</h1>
            <p className="truncate text-[11px] text-zinc-500">Chat with the Co-Pilot. Generations land on this canvas.</p>
          </div>
          {balanceReady ? (
            <Link
              href="/credits"
              className="flex shrink-0 items-center gap-1.5 rounded-full border border-amber-300/20 bg-amber-300/10 px-2.5 py-1 text-xs font-semibold tabular-nums text-amber-200 hover:bg-amber-300/15"
            >
              <Glyph className="h-3.5 w-3.5">
                <circle cx="10" cy="10" r="7" />
                <circle cx="10" cy="10" r="3" />
              </Glyph>
              {credits.toLocaleString("en-US")}
            </Link>
          ) : null}
        </header>

        <div className="relative min-h-[48dvh] flex-1 overflow-y-auto p-5 lg:p-8">
          {!featured ? (
            <div className="flex h-full min-h-[40dvh] items-center justify-center">
              <div className="agent-glass flex w-full max-w-md flex-col items-center rounded-3xl px-8 py-12 text-center">
                <div className="grid grid-cols-2 gap-1.5" aria-hidden>
                  <span className="h-9 w-12 animate-pulse rounded-lg bg-violet-400/20" />
                  <span className="h-9 w-9 animate-pulse rounded-lg bg-sky-400/20 [animation-delay:150ms]" />
                  <span className="h-9 w-9 animate-pulse rounded-lg bg-amber-300/20 [animation-delay:300ms]" />
                  <span className="h-9 w-12 animate-pulse rounded-lg bg-emerald-400/20 [animation-delay:450ms]" />
                </div>
                <p className="mt-5 text-base font-semibold tracking-tight text-zinc-100">Generations will show here</p>
                <p className="mt-1.5 text-sm leading-6 text-zinc-400">
                  Ask the Co-Pilot for an image or a short video, then press Generate on its card.
                </p>
              </div>
            </div>
          ) : (
            <div className="mx-auto flex max-w-6xl flex-col gap-8">
              <article className="mx-auto w-full max-w-3xl" aria-label="Selected generation">
                <div className="flex min-w-0 flex-col items-center justify-center">
                  {featured.url && featured.kind === "video" ? (
                    <AgentPlayer
                      key={`${featured.url}-${plugins.subtitles}`}
                      src={featured.url}
                      aspect={featured.aspect}
                      script={featured.script}
                      audioSrc={featured.voiceEmbedded ? undefined : featured.audioUrl}
                      voiceEmbedded={featured.voiceEmbedded}
                      voiceLabel={featured.voiceLabel}
                      captions={plugins.subtitles}
                    />
                  ) : featured.url ? (
                    <div
                      className="relative w-full overflow-hidden rounded-2xl border border-white/[0.08] bg-black"
                      style={aspectStyle(featured.aspect)}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={featured.url} alt={featured.prompt} className="absolute inset-0 h-full w-full object-contain" />
                    </div>
                  ) : (
                    <div
                      className="relative w-full overflow-hidden rounded-2xl border border-white/[0.08] bg-zinc-950"
                      style={aspectStyle(featured.aspect)}
                    >
                      {featured.status === "running" ? (
                        <div className="absolute inset-0 bg-[#09090b]">
                          <span className="absolute top-[28%] left-[22%] h-1.5 w-1.5 animate-pulse rounded-full bg-white/50" />
                          <span className="absolute top-[22%] left-[58%] h-1 w-1 animate-pulse rounded-full bg-white/35 [animation-delay:180ms]" />
                          <span className="absolute right-[26%] bottom-[36%] h-1.5 w-1.5 animate-pulse rounded-full bg-violet-200/50 [animation-delay:360ms]" />
                          <span className="absolute bottom-[30%] left-[42%] h-1 w-1 animate-pulse rounded-full bg-white/30 [animation-delay:540ms]" />
                          <span className="sr-only">Rendering video</span>
                        </div>
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-red-300">
                          {featured.error}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </article>

              {generations.length > 1 ? (
                <section aria-label="All generations">
                  <p className="mb-3 text-[11px] font-medium tracking-wide text-zinc-500 uppercase">Generations</p>
                  <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                    {generations.map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedId(item.id)}
                          aria-pressed={item.id === featured.id}
                          title={item.title}
                          className={`group relative block aspect-square w-full overflow-hidden rounded-xl border bg-zinc-950 transition ${
                            item.id === featured.id ? "border-white/60" : "border-white/[0.08] hover:border-white/25"
                          }`}
                        >
                          {item.url && item.kind === "video" ? (
                            <video src={item.url} className="h-full w-full object-cover" muted playsInline preload="metadata" />
                          ) : item.url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={item.url} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <span className="grid h-full w-full place-items-center text-[11px] text-zinc-500">
                              {item.status === "running" ? <Spinner light /> : "Failed"}
                            </span>
                          )}
                          <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/80 to-transparent px-2 pt-4 pb-1.5 text-left text-[10px] font-medium text-zinc-200">
                            {item.title}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </div>
          )}
        </div>
      </section>

      <AgentChatPanel
        messages={messages}
        sending={sending}
        attachment={attachment?.thumb ?? null}
        attachmentPending={attachmentPending}
        credits={credits}
        balanceReady={balanceReady}
        cardStatus={cardStatus}
        latestMediaUrl={(messageId) => generations.find((item) => item.sourceId === messageId && item.url)?.url ?? ""}
        onSend={send}
        onAttach={(file) => void attach(file)}
        onClearAttachment={clearAttachment}
        onGenerate={(message) => void generate(message)}
        onContinue={(message) => void continueScene(message)}
        onUpgrade={() => setUpgradeOpen(true)}
        onNewChat={newChat}
      />
      <UpgradeModal open={upgradeOpen} onClose={() => setUpgradeOpen(false)} />
    </div>
  );
}
