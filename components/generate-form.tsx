"use client";

import { useEffect, useRef, useState } from "react";
import {
  GENERATE_STEPS,
  chainVideoUrls,
  isGenerateEvent,
  stitchExtension,
  type GenerateEvent,
  type GenerateResult,
  type GenerateStepId,
} from "@/lib/generate";
import { useRouter, useSearchParams } from "next/navigation";
import { stashAgentHandoff, type AgentRunExtras } from "@/lib/agent-handoff";
import { newAgentSessionId } from "@/lib/agent-sessions";
import type { AgentSuggestion } from "@/lib/agent-suggestion";
import { threadTitleFromPrompt } from "@/lib/copilot-history";
import { FRAME_ASPECTS, frameCue, type AspectRatio } from "@/lib/frame";
import { NARRATION_LANGUAGES, isNarrationLanguageId, type NarrationLanguageId } from "@/lib/narration";
import { VOICES, getVoice, voicesForGender, type VoiceGender, type VoiceId } from "@/lib/voices";
import {
  VISUAL_ENGINES,
  type VisualEngineId,
} from "@/lib/visual-engines";
import { useCredits } from "@/components/credit-provider";
import { Storyboard } from "@/components/storyboard";
import { useDefaultVoice } from "@/components/use-default-voice";
import { EXTEND_VIDEO_COST, IMAGE_GENERATION_COST } from "@/lib/credits";
import { DEFAULT_IMAGE_ASPECT, imageAspectFrameClass, type ImageAspectId } from "@/lib/image-aspects";
import { DEFAULT_IMAGE_MODEL, getImageModel, imageModelCreditCost, type ImageModelId } from "@/lib/image-models";
import { imageStyleName, type ImageStyleId } from "@/lib/image-styles";
import { ImageAspectMenu } from "@/components/image-aspect-menu";
import { ImageModelMenu } from "@/components/image-model-menu";
import { StyleMenu } from "@/components/style-menu";
import { VideoDurationMenu, VideoModelMenu } from "@/components/video-bar-menus";
import {
  DEFAULT_VIDEO_MODEL,
  DEFAULT_VIDEO_RESOLUTION,
  getVideoModel,
  INSUFFICIENT_CREDITS_MESSAGE,
  videoClipCreditCost,
  videoModelEngine,
  type VideoModelId,
  type VideoResolution,
} from "@/lib/video-models";
import { MOTION_STYLES, PROMPT_MAX, type MotionStyleId } from "@/lib/motion-styles";
import { prepareReferenceImage } from "@/lib/prepare-reference-image";
import { CopilotPanel } from "@/components/copilot-panel";
import { type SavedCharacter } from "@/lib/saved-characters";
import {
  CLIP_DURATION_SEC,
  movieCreditCost,
  sceneCountForDuration,
  type MovieScene,
  type VideoDurationSec,
} from "@/lib/scenes";
import { saveGeneratedFile } from "@/lib/save-media";
import { UpgradeModal } from "@/components/upgrade-modal";

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
  adam: "Male character voice",
  marcus: "Male character voice",
  rachel: "Female character voice",
  bella: "Female character voice",
};

const ENGINE_NOTE: Record<VisualEngineId, string> = {
  stock: "Free preview",
  budget: "High quality render",
  ultra: "Cinematic motion",
};

const FALLBACK_NOTICE =
  "The free-tier limit was reached. A browser preview is ready with stock frames, so you can keep testing.";

function isRecoverableFailure(message: string) {
  return /429|quota|rate.?limit|resource exhausted|free tier|could not reach|elevenlabs|gemini|unexpected response|progress stream/i.test(
    message,
  );
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10_240 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function engineOffer(id: VisualEngineId, imageToVideo: boolean) {
  if (imageToVideo && id === "budget") {
    return {
      name: "Studio Fast Motion",
      rate: "3 credits / second",
      note: "High quality render",
    };
  }
  if (imageToVideo && id === "ultra") {
    return {
      name: "Ultra Cinematic AI",
      rate: "200 credits",
      note: "Cinematic motion",
    };
  }
  const option = VISUAL_ENGINES.find((item) => item.id === id);
  return {
    name: option?.name ?? id,
    rate: option?.rate ?? "",
    note: ENGINE_NOTE[id],
  };
}

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

type StudioPicker =
  | "voice"
  | "motion"
  | "model"
  | "aspect"
  | "duration"
  | "resolution"
  | "style"
  | "imageModel"
  | "imageAspect";

const PICKER_TITLE: Record<StudioPicker, string> = {
  voice: "Voice selection",
  motion: "Motion style",
  model: "Video model",
  aspect: "Aspect ratio",
  duration: "Duration",
  resolution: "Resolution",
  style: "Style preset",
  imageModel: "Image model",
  imageAspect: "Aspect ratio",
};

const FLOATING_PICKERS: StudioPicker[] = [
  "style",
  "imageModel",
  "imageAspect",
  "model",
  "duration",
  "resolution",
];

type SpeechLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

function Glyph({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className ?? "h-4 w-4 shrink-0"}
    >
      {children}
    </svg>
  );
}

function motionPillLabel(id: MotionStyleId | "") {
  if (!id) return "Motion Style";
  if (id === "slowmo") return "Motion: Slow-Mo";
  const name = MOTION_STYLES.find((style) => style.id === id)?.name ?? "Motion";
  return `Motion: ${name.split(" ")[0]}`;
}

export function GenerateForm() {
  const { voice: storedVoice } = useDefaultVoice();
  const { credits, balanceReady, deductImageCredits, archiveProject, setAccountBalance } = useCredits();
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [mode, setMode] = useState<"video" | "image">("video");
  const [imageStyle, setImageStyle] = useState<ImageStyleId | "">("");
  const [imageModel, setImageModel] = useState<ImageModelId>(DEFAULT_IMAGE_MODEL);
  const [imageAspect, setImageAspect] = useState<ImageAspectId>(DEFAULT_IMAGE_ASPECT);
  const [imageResult, setImageResult] = useState<{ id: string; imageUrl: string; prompt: string } | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [topic, setTopic] = useState("");
  const [voiceOverride, setVoiceOverride] = useState<VoiceId | null>(null);
  const [narrationLanguage, setNarrationLanguage] = useState<NarrationLanguageId>("auto");
  const [engine, setEngine] = useState<VisualEngineId>("budget");
  const [videoModel, setVideoModel] = useState<VideoModelId>(DEFAULT_VIDEO_MODEL);
  const [videoResolution, setVideoResolution] = useState<VideoResolution>(DEFAULT_VIDEO_RESOLUTION);
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const [referencePreview, setReferencePreview] = useState<string | null>(null);
  const [referenceName, setReferenceName] = useState<string | null>(null);
  const [referenceBytes, setReferenceBytes] = useState<number | null>(null);
  const [characters, setCharacters] = useState<SavedCharacter[]>([]);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveUrl, setSaveUrl] = useState("");
  const [savingCharacter, setSavingCharacter] = useState(false);
  const [draggingImage, setDraggingImage] = useState(false);
  const [motionStyle, setMotionStyle] = useState<MotionStyleId | "">("");
  const [enhancing, setEnhancing] = useState(false);
  const [steps, setSteps] = useState<StepView[]>(INITIAL_STEPS);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("Waiting for a topic.");
  const [running, setRunning] = useState(false);
  const [mockMode, setMockMode] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const imageRunRef = useRef(false);
  const extendRunRef = useRef(false);
  const filmRunRef = useRef(false);
  const filmRef = useRef<GenerateResult | null>(null);
  const [scenes, setScenes] = useState<MovieScene[]>([]);
  const [durationSec, setDurationSec] = useState<VideoDurationSec>(5);
  const [aspect, setAspect] = useState<AspectRatio>("16:9");
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [picker, setPicker] = useState<StudioPicker | null>(null);
  const [planning, setPlanning] = useState(false);
  const plannedTopicRef = useRef("");
  const previewRef = useRef<string | null>(null);
  const acceptIdRef = useRef(0);
  const referenceInputRef = useRef<HTMLInputElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<SpeechLike | null>(null);
  const [listening, setListening] = useState(false);
  const params = useSearchParams();
  const query = params.toString();
  const [seenQuery, setSeenQuery] = useState<string | null>(null);
  const outcomeRef = useRef<"idle" | "complete" | "error">("idle");
  const pendingRenderRef = useRef<{ statusUrl: string; responseUrl: string; result: GenerateResult } | null>(null);
  const finishedRef = useRef<GenerateResult | null>(null);
  const fallbackRef = useRef(false);
  const voice = voiceOverride ?? storedVoice;
  const router = useRouter();

  function handOffToAgent(suggestion: AgentSuggestion, extras: AgentRunExtras) {
    const sessionId = newAgentSessionId();
    const stamp = Date.now().toString(36);
    stashAgentHandoff({
      sessionId,
      userMessageId: `msg_${stamp}u`,
      assistantMessageId: `msg_${stamp}a`,
      suggestion,
      extras,
    });
    router.push(`/agent?chat=${sessionId}`);
  }

  function promptTitle(prompt: string, fallback: string) {
    const title = threadTitleFromPrompt(prompt);
    return title === "New chat" ? fallback : title;
  }

  function requireCredits(cost: number, message: string) {
    if (!balanceReady) return false;
    if (credits >= cost) return true;
    setError(message);
    setUpgradeOpen(true);
    return false;
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

  async function readGenerateResponse(response: Response) {
    if (response.status === 402) {
      setUpgradeOpen(true);
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(payload?.error ?? "Insufficient credits");
    }
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(payload?.error ?? "Could not start generation.");
    }
  }

  function selectGender(gender: VoiceGender) {
    if (getVoice(voice)?.gender === gender) return;
    const next = voicesForGender(gender)[0];
    if (next) setVoiceOverride(next.id);
  }

  async function attachNarration(current: GenerateResult, signal: AbortSignal) {
    if (current.preview || current.script.trim().length < 8) return current;
    const direct = current.videoUrl?.startsWith("https://") ? current.videoUrl : null;
    const sources = [
      ...new Set(current.frames.map((frame) => frame.src).filter((src) => src.startsWith("https://"))),
    ];
    const videoUrl = direct ?? (sources.length === 1 ? sources[0] : null);
    setStatusMessage("Recording character dialogue and lip-syncing.");
    try {
      const response = await fetch("/api/video/narrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          script: current.script,
          voice,
          language: narrationLanguage,
          ...(videoUrl ? { videoUrl } : {}),
          ...(current.mock ? { mock: true } : {}),
          aspect,
        }),
        signal,
      });
      const payload = (await response.json().catch(() => null)) as {
        videoUrl?: string;
        audioSrc?: string;
        audioLabel?: string;
        embedded?: boolean;
        notice?: string;
        error?: string;
      } | null;
      if (!response.ok || !payload) {
        setNotice(payload?.error ?? "Character dialogue could not be recorded.");
        return current;
      }
      if (payload.notice) setNotice(payload.notice);
      const nextUrl = payload.embedded && payload.videoUrl?.startsWith("https://") ? payload.videoUrl : null;
      const voiceStyle = getVoice(voice);
      return {
        ...current,
        voiceId: voice,
        voiceName: voiceStyle?.name ?? current.voiceName,
        audioSrc: payload.audioSrc ?? current.audioSrc,
        audioLabel: payload.audioLabel ?? current.audioLabel,
        narrationEmbedded: Boolean(nextUrl),
        videoUrl: nextUrl ?? current.videoUrl,
        frames: nextUrl
          ? current.frames.map((frame) => (frame.src === videoUrl ? { ...frame, src: nextUrl } : frame))
          : current.frames,
      };
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      setNotice("Character dialogue could not be recorded.");
      return current;
    }
  }

  function publishNarration(spoken: GenerateResult, creditsCharged: number, engineLabel: string) {
    const videoSrc = spoken.videoUrl || spoken.frames.find((frame) => frame.src.startsWith("https://"))?.src;
    archiveProject({
      id: spoken.id,
      prompt: spoken.topic,
      durationSec: spoken.durationSec,
      engine: spoken.engine,
      engineLabel,
      voiceName: spoken.voiceName,
      voiceId: spoken.voiceId,
      script: spoken.script,
      audioSrc: spoken.audioSrc,
      videoSrc,
      creditsCharged,
      createdAt: new Date().toISOString(),
    });
    if (!videoSrc) return;
    void fetch("/api/gallery", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: spoken.id,
        prompt: spoken.topic,
        script: spoken.script,
        engine: spoken.engine,
        voiceName: spoken.voiceName,
        videoUrl: videoSrc,
        credits: creditsCharged,
      }),
    }).catch(() => undefined);
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

    if (event.type === "rendering") {
      pendingRenderRef.current = {
        statusUrl: event.statusUrl,
        responseUrl: event.responseUrl,
        result: event.result,
      };
      setError(null);
      setStatusMessage("Fal.ai is still rendering this clip.");
      console.info("Fal.ai queue is still rendering this clip.");
      return;
    }

    if (event.type === "complete") {
      outcomeRef.current = "complete";
      if (filmRunRef.current) {
        filmRef.current = event.result;
        return;
      }
      if (extendRunRef.current) {
        extendRunRef.current = false;
        const stitched = result ? stitchExtension(result, event.result) : event.result;
        const urls = chainVideoUrls(stitched.frames);
        const videoSrc = stitched.videoUrl || urls[urls.length - 1];
        archiveProject({
          id: stitched.id,
          prompt: stitched.topic,
          durationSec: stitched.durationSec,
          engine: stitched.engine,
          engineLabel: "Extend Video",
          voiceName: stitched.voiceName,
          voiceId: stitched.voiceId,
          script: stitched.script,
          audioSrc: stitched.audioSrc,
          videoSrc,
          creditsCharged: EXTEND_VIDEO_COST,
          createdAt: new Date().toISOString(),
        });
        if (videoSrc) {
          void fetch("/api/gallery", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: stitched.id,
              prompt: stitched.topic,
              script: stitched.script,
              engine: stitched.engine,
              voiceName: stitched.voiceName,
              videoUrl: videoSrc,
              credits: EXTEND_VIDEO_COST,
            }),
          }).catch(() => undefined);
        }
        finishedRef.current = stitched;
        setResult(stitched);
        setStatusMessage(`Extended to ${stitched.durationSec}s. ${EXTEND_VIDEO_COST} credits used.`);
        return;
      }
      const imageRun =
        imageRunRef.current &&
        !event.result.preview &&
        event.result.creditsCharged > 0 &&
        event.result.engine !== "stock";
      const videoSrc = event.result.frames.find((frame) => frame.src.startsWith("https://"))?.src;
      const offer = engineOffer(event.result.engine, imageRun);
      archiveProject({
        id: event.result.id,
        prompt: event.result.topic,
        durationSec: event.result.durationSec,
        engine: event.result.engine,
        engineLabel: offer.name,
        voiceName: event.result.voiceName,
        voiceId: event.result.voiceId,
        script: event.result.script,
        audioSrc: event.result.audioSrc,
        videoSrc: imageRun ? videoSrc : undefined,
        creditsCharged: event.result.creditsCharged,
        createdAt: new Date().toISOString(),
      });
      if (imageRun && videoSrc) {
        void fetch("/api/gallery", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: event.result.id,
            prompt: event.result.topic,
            script: event.result.script,
            engine: event.result.engine,
            voiceName: event.result.voiceName,
            videoUrl: videoSrc,
            credits: event.result.creditsCharged,
          }),
        }).catch(() => undefined);
      }
      finishedRef.current = event.result;
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
    console.error("Video generation failed", event.message);
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
    if (pendingRenderRef.current && !signal.aborted) {
      await finishPendingRender(signal);
    }
  }

  async function finishPendingRender(signal: AbortSignal) {
    const pending = pendingRenderRef.current;
    if (!pending) return;
    pendingRenderRef.current = null;
    setError(null);
    setStatusMessage("Fal.ai is still rendering this clip.");
    const started = Date.now();
    while (Date.now() - started < 8 * 60 * 1000) {
      if (signal.aborted) return;
      let response: Response;
      try {
        response = await fetch("/api/video/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ statusUrl: pending.statusUrl, responseUrl: pending.responseUrl }),
          signal,
        });
      } catch (error) {
        if (signal.aborted) return;
        console.error("Fal video status failed", error instanceof Error ? error.message : error);
        continue;
      }
      const payload = (await response.json().catch(() => null)) as {
        videoUrl?: string;
        pending?: boolean;
        error?: string;
      } | null;
      if (typeof payload?.videoUrl === "string" && payload.videoUrl.startsWith("https://")) {
        console.info("Fal.ai finished rendering this clip.");
        applyEvent({
          type: "complete",
          result: {
            ...pending.result,
            videoUrl: payload.videoUrl,
            frames: [
              {
                time: "0:00",
                caption: pending.result.frames[0]?.caption || pending.result.script.slice(0, 80),
                term: "",
                src: payload.videoUrl,
              },
            ],
          },
        });
        return;
      }
      if (payload?.pending || (response.status >= 500 && !payload?.error)) {
        setStatusMessage("Fal.ai is still rendering this clip.");
        console.info("Fal.ai queue is still rendering this clip.");
        continue;
      }
      const message = payload?.error || "Fal.ai could not finish this clip.";
      console.error("Fal video status failed", message);
      applyEvent({ type: "error", message });
      return;
    }
    console.error("Fal video status timed out while the queue was still rendering.");
    applyEvent({ type: "error", message: "Fal.ai is still rendering this clip. Try again in a moment." });
  }

  async function submitImage() {
    const trimmed = topic.trim();
    if (referencePreview && !referenceImage) {
      setError("The input image is still loading.");
      return;
    }
    if (trimmed.length < 1) {
      setError("Write a style prompt.");
      return;
    }
    if (trimmed.length > PROMPT_MAX) {
      setError(`Keep the prompt under ${PROMPT_MAX} characters.`);
      return;
    }
    const imageCost = imageModelCreditCost(imageModel);
    if (!requireCredits(imageCost, `${getImageModel(imageModel).name} costs ${imageCost} credits.`)) return;
    if (trimmed.length >= 3) {
      handOffToAgent(
        {
          kind: "image",
          title: promptTitle(trimmed, "Generate Image"),
          prompt: trimmed,
          model: imageModel,
          aspect: imageAspect,
          ...(imageStyle ? { style: imageStyle } : {}),
        },
        referenceImage ? { referenceImage } : {},
      );
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    setError(null);
    setDownloadError(null);
    setImageResult(null);
    setStatusMessage(referenceImage ? "Rendering from your image." : "Rendering from your prompt.");

    try {
      const response = await fetch("/api/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          prompt: trimmed,
          model: imageModel,
          aspect: imageAspect,
          style: imageStyle || undefined,
          ...(referenceImage ? { referenceImage } : {}),
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        id?: string;
        imageUrl?: string;
        prompt?: string;
        error?: string;
      } | null;
      if (!response.ok || typeof payload?.imageUrl !== "string") {
        throw new Error(payload?.error ?? "Could not render that image.");
      }
      const id = payload.id || `img_${Date.now().toString(36)}`;
      const prompt = payload.prompt || trimmed;
      const styleLabel = imageStyle ? imageStyleName(imageStyle) : "Avatar Studio";
      deductImageCredits(imageCost, imageModel);
      setImageResult({ id, imageUrl: payload.imageUrl, prompt });
      archiveProject({
        id,
        prompt,
        durationSec: 0,
        engine: "image",
        engineLabel: getImageModel(imageModel).name,
        voiceName: styleLabel,
        voiceId: "",
        script: prompt,
        imageSrc: payload.imageUrl,
        kind: "image",
        creditsCharged: imageCost,
        createdAt: new Date().toISOString(),
      });
      void fetch("/api/gallery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "image",
          id,
          prompt,
          imageUrl: payload.imageUrl,
          styleName: styleLabel,
          credits: imageCost,
        }),
      }).catch(() => undefined);
      setStatusMessage(`Image ready. ${imageCost} credits used.`);
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") {
        setStatusMessage("Stopped.");
        return;
      }
      const message = caught instanceof Error ? caught.message : "Could not render that image.";
      setError(message);
      setStatusMessage(message);
    } finally {
      setRunning(false);
    }
  }

  async function downloadImage(imageUrl: string) {
    setDownloadError(null);
    await saveGeneratedFile(imageUrl, "cut45-image.png");
  }

  async function downloadVideo(videoUrl: string, filename = "cut45-video.mp4") {
    setDownloadError(null);
    await saveGeneratedFile(videoUrl, filename);
  }

  function planKey(value: string, seconds: VideoDurationSec) {
    return `${value.trim()}|${seconds}`;
  }

  async function planScenes(nextTopic = topic, seconds: VideoDurationSec = durationSec) {
    const trimmed = nextTopic.trim();
    const count = sceneCountForDuration(seconds);
    if (trimmed.length < 3 || planning || mode === "image" || count < 2) return null;
    const key = planKey(trimmed, seconds);
    if (plannedTopicRef.current === key && scenes.length === count) return scenes;
    setPlanning(true);
    setError(null);
    setStatusMessage(`Writing ${count} scenes for a ${seconds}s video.`);
    try {
      const response = await fetch("/api/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "plan", topic: trimmed, scenes, sceneCount: count }),
      });
      const payload = (await response.json().catch(() => null)) as {
        scenes?: MovieScene[];
        error?: string;
      } | null;
      if (!response.ok || !payload?.scenes || payload.scenes.length !== count) {
        throw new Error(payload?.error ?? "Could not break that topic into scenes.");
      }
      plannedTopicRef.current = key;
      setScenes(payload.scenes);
      setCopilotOpen(true);
      setStatusMessage(`${count} scenes are ready for a ${seconds}s video.`);
      return payload.scenes;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not break that topic into scenes.");
      return null;
    } finally {
      setPlanning(false);
    }
  }

  async function renderFilm(
    sceneList: MovieScene[] = scenes,
    options?: { referenceDataUrl?: string | null; forceBudget?: boolean },
  ) {
    if (running || sceneList.length === 0) return;
    if (!options?.forceBudget && engine !== "budget") {
      setError("Switch to Studio Fast Motion to render the scene chain.");
      return;
    }
    const attachedReference = options?.referenceDataUrl ?? referenceImage;
    const firstHasImage = Boolean(attachedReference);
    const cost = movieCreditCost(sceneList.length, firstHasImage);
    if (!requireCredits(cost, `This short costs ${cost} credits.`)) return;
    if (!options?.referenceDataUrl && referencePreview && !referenceImage) {
      setError("The reference image is still preparing.");
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    imageRunRef.current = false;
    extendRunRef.current = false;
    filmRunRef.current = true;
    setRunning(true);
    setError(null);
    setNotice(null);
    setResult(null);
    setSteps(INITIAL_STEPS.map((step) => ({ ...step })));

    let accumulated: GenerateResult | null = null;
    try {
      for (let index = 0; index < sceneList.length; index += 1) {
        const scene = sceneList[index];
        const priorVideoUrls = accumulated ? chainVideoUrls(accumulated.frames) : [];
        setStatusMessage(`Rendering scene ${index + 1} of ${sceneList.length}.`);
        outcomeRef.current = "idle";
        filmRef.current = null;
        const movieTopic = topic.trim().length >= 3 ? topic.trim() : sceneList.map((item) => item.title).join(". ");
        const response = await fetch("/api/generate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
          },
          body: JSON.stringify({
            scene: true,
            topic: movieTopic,
            voice,
            engine: "budget",
            narration: scene.narration,
            visualPrompt: [scene.visualPrompt, scene.motionPrompt, scene.referenceNote, "Keep the same character, face, costume, and colors in every scene."]
              .filter(Boolean)
              .join(" ")
              .trim(),
            ...(index === 0 && attachedReference ? { referenceImage: attachedReference } : {}),
            ...(priorVideoUrls.length > 0 ? { priorVideoUrls } : {}),
            ...(motionStyle ? { motionStyle } : {}),
            ...(mockMode ? { mockMode: true } : {}),
            durationSec,
            aspect,
          }),
          signal: controller.signal,
        });
        await readGenerateResponse(response);
        await readProgress(response, controller.signal);
        let piece = (filmRef as { current: GenerateResult | null }).current;
        const sceneStatus = outcomeRef.current as "idle" | "complete" | "error";
        if (!piece || sceneStatus !== "complete") {
          throw new Error(`Scene ${index + 1} stopped before a clip was ready.`);
        }
        setStatusMessage(`Recording dialogue for scene ${index + 1}.`);
        piece = await attachNarration(piece, controller.signal);
        filmRef.current = piece;
        accumulated = accumulated ? stitchExtension(accumulated, piece) : piece;
        setResult(accumulated);
        await syncBalance();
      }
      if (accumulated) {
        const clipUrls = chainVideoUrls(accumulated.frames);
        if (!mockMode && !accumulated.videoUrl && clipUrls.length >= 2) {
          setStatusMessage("Stitching the final movie.");
          const mergeResponse = await fetch("/api/video/merge", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ videoUrls: clipUrls, aspect }),
            signal: controller.signal,
          });
          const merged = (await mergeResponse.json().catch(() => null)) as { videoUrl?: string; error?: string } | null;
          if (mergeResponse.ok && merged?.videoUrl) {
            accumulated = {
              ...accumulated,
              videoUrl: merged.videoUrl,
              narrationEmbedded: true,
              audioSrc: undefined,
            };
            setResult(accumulated);
          } else {
            setError(merged?.error ?? "The clips rendered, but the final movie could not be joined.");
          }
        } else if (accumulated.videoUrl && !accumulated.narrationEmbedded) {
          accumulated = await attachNarration(accumulated, controller.signal);
        }
        setResult(accumulated);
        const urls = chainVideoUrls(accumulated.frames);
        const videoSrc = accumulated.videoUrl || urls[urls.length - 1];
        archiveProject({
          id: accumulated.id,
          prompt: topic.trim(),
          durationSec: accumulated.durationSec,
          engine: "budget",
          engineLabel: "Short film",
          voiceName: accumulated.voiceName,
          voiceId: accumulated.voiceId,
          script: accumulated.script,
          audioSrc: accumulated.audioSrc,
          videoSrc,
          creditsCharged: movieCreditCost(sceneList.length, firstHasImage),
          createdAt: new Date().toISOString(),
        });
        if (videoSrc) {
          void fetch("/api/gallery", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: accumulated.id,
              prompt: topic.trim(),
              script: accumulated.script,
              engine: "budget",
              voiceName: accumulated.voiceName,
              videoUrl: videoSrc,
              credits: movieCreditCost(sceneList.length, firstHasImage),
            }),
          }).catch(() => undefined);
        }
        setStatusMessage(
          accumulated.narrationEmbedded
              ? `Final movie ready with character dialogue. ${accumulated.durationSec}s.`
              : accumulated.videoUrl
                ? `Final movie ready. ${accumulated.durationSec}s.`
                : `Short ready. ${accumulated.durationSec}s.`,
        );
      }
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") {
        setStatusMessage("Stopped.");
        return;
      }
      const message = caught instanceof Error ? caught.message : "Could not finish the short.";
      setError(message);
      setStatusMessage(message);
    } finally {
      filmRunRef.current = false;
      if (abortRef.current === controller) abortRef.current = null;
      setRunning(false);
      void syncBalance();
    }
  }

  async function extendVideo() {
    if (!result || running) return;
    const urls = chainVideoUrls(result.frames);
    if (urls.length === 0) {
      setError("Extend a finished Studio Fast Motion video.");
      return;
    }
    if (!requireCredits(EXTEND_VIDEO_COST, "Extend Video costs 90 credits.")) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    extendRunRef.current = true;
    imageRunRef.current = false;
    outcomeRef.current = "idle";
    setRunning(true);
    setError(null);
    setNotice(null);
    setSteps(INITIAL_STEPS.map((step) => ({ ...step })));
    setStatusMessage("Extending the video.");

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({
          extend: true,
          topic: result.topic,
          voice: result.voiceId,
          engine: "budget",
          priorScript: result.script,
          priorVideoUrls: urls,
          ...(motionStyle ? { motionStyle } : {}),
          ...(mockMode ? { mockMode: true } : {}),
          aspect,
        }),
        signal: controller.signal,
      });
      await readGenerateResponse(response);
      await readProgress(response, controller.signal);
      const extendStatus = outcomeRef.current as "idle" | "complete" | "error";
      if (extendStatus === "complete" && finishedRef.current) {
        const spoken = await attachNarration(finishedRef.current, controller.signal);
        finishedRef.current = spoken;
        setResult(spoken);
        publishNarration(spoken, EXTEND_VIDEO_COST, "Extend Video");
        setStatusMessage(
          spoken.narrationEmbedded
            ? `Extended to ${spoken.durationSec}s with character dialogue. ${EXTEND_VIDEO_COST} credits used.`
            : `Extended to ${spoken.durationSec}s. ${EXTEND_VIDEO_COST} credits used.`,
        );
      } else if (extendStatus === "idle") {
        setError("The extension stopped before a video was ready.");
      }
    } catch (caught) {
      extendRunRef.current = false;
      if (caught instanceof DOMException && caught.name === "AbortError") {
        setStatusMessage("Stopped.");
        return;
      }
      const message = caught instanceof Error ? caught.message : "Could not extend that video.";
      setError(message);
      setStatusMessage(message);
    } finally {
      extendRunRef.current = false;
      if (abortRef.current === controller) abortRef.current = null;
      setRunning(false);
      void syncBalance();
    }
  }

  async function continueFiveSeconds() {
    if (!result || running) return;
    const clipUrl = result.videoUrl || chainVideoUrls(result.frames).at(-1);
    if (!clipUrl) {
      setError("Continue a finished video.");
      return;
    }
    setRunning(true);
    setError(null);
    try {
      const response = await fetch("/api/generate-scene", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ extractFrame: true, continueFromVideoUrl: clipUrl }),
      });
      const payload = (await response.json().catch(() => null)) as { success?: boolean; frameUrl?: string; error?: string } | null;
      if (!response.ok || !payload?.frameUrl) {
        throw new Error(payload?.error ?? "The last frame could not be read.");
      }
      setReferenceImage(payload.frameUrl);
      setReferencePreview(payload.frameUrl);
      setStatusMessage("Last frame attached. The next prompt continues this scene.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The last frame could not be read.");
    } finally {
      setRunning(false);
    }
  }

  async function generateLongVideo(trimmed: string) {
    if (engine !== "budget") {
      setError("Videos longer than 10 seconds use Studio Fast Motion. Each 5-second scene costs 10 credits.");
      return;
    }
    if (referencePreview && !referenceImage) {
      setError("The reference image is still preparing.");
      return;
    }
    const count = sceneCountForDuration(durationSec);
    const firstHasImage = Boolean(referenceImage);
    const cost = movieCreditCost(count, firstHasImage);
    if (!requireCredits(cost, `This ${durationSec}s video costs ${cost} credits.`)) return;
    const ready = await planScenes(trimmed, durationSec);
    if (!ready || ready.length !== count) return;
    await renderFilm(ready);
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mode === "image") {
      await submitImage();
      return;
    }
    const trimmed = topic.trim();

    if (trimmed.length < 3) {
      setError("Use at least 3 characters for the topic.");
      return;
    }

    if (trimmed.length > PROMPT_MAX) {
      setError(`Keep the prompt under ${PROMPT_MAX} characters.`);
      return;
    }

    if (durationSec > 10) {
      await generateLongVideo(trimmed);
      return;
    }

    if (referencePreview && !referenceImage) {
      setError("The reference image is still preparing.");
      return;
    }

    const imageToVideo = Boolean(referenceImage) && engine !== "stock";
    imageRunRef.current = imageToVideo;
    const cost = videoClipCreditCost(videoModel, videoResolution, durationSec);
    if (!requireCredits(cost, INSUFFICIENT_CREDITS_MESSAGE)) return;
    handOffToAgent(
      {
        kind: "video",
        title: promptTitle(trimmed, "Generate Video"),
        prompt: trimmed,
        model: videoModel,
        aspect,
        durationSec: durationSec >= 10 ? 10 : 5,
        resolution: videoResolution,
      },
      {
        ...(referenceImage ? { referenceImage } : {}),
        voice,
        ...(motionStyle ? { motionStyle } : {}),
        language: narrationLanguage,
        ...(mockMode ? { mockMode: true } : {}),
      },
    );
  }

  function stop() {
    abortRef.current?.abort();
  }

  function replacePreview(next: string | null) {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = next;
    setReferencePreview(next);
  }

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/characters")
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { characters?: SavedCharacter[] } | null) => {
        if (!cancelled && payload?.characters) setCharacters(payload.characters);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (previewRef.current?.startsWith("blob:")) URL.revokeObjectURL(previewRef.current);
    };
  }, []);

  function openCharacterSave(url: string) {
    if (!url) return;
    setSaveUrl(url);
    setSaveName(referenceName?.replace(/\.[a-z0-9]+$/i, "") || "");
    setSaveOpen(true);
  }

  async function saveCharacter() {
    const characterName = saveName.trim();
    if (!characterName || !saveUrl || savingCharacter) return;
    setSavingCharacter(true);
    setError(null);
    try {
      const response = await fetch("/api/characters/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterName, tempFalUrl: saveUrl }),
      });
      const payload = (await response.json().catch(() => null)) as {
        success?: boolean;
        character?: SavedCharacter;
        error?: string;
      } | null;
      if (!response.ok || !payload?.success || !payload.character) {
        throw new Error(payload?.error ?? "The character could not be saved.");
      }
      setCharacters((current) => [payload.character!, ...current.filter((item) => item.id !== payload.character?.id)]);
      setReferenceImage(payload.character.characterImageUrl);
      setReferencePreview(payload.character.characterImageUrl);
      setReferenceName(payload.character.name);
      setSaveOpen(false);
      setStatusMessage(`${payload.character.name} is in the character library.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The character could not be saved.");
    } finally {
      setSavingCharacter(false);
    }
  }

  async function acceptReference(file: File) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      setError("Use a JPEG, PNG, or WebP reference image.");
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setError("Use an image under 25 MB.");
      return;
    }
    replacePreview(URL.createObjectURL(file));
    setReferenceName(file.name);
    setReferenceBytes(file.size);
    setReferenceImage(null);
    setEngine(videoModelEngine(videoModel));
    const acceptId = ++acceptIdRef.current;
    setError(null);
    try {
      const dataUrl = await prepareReferenceImage(file);
      if (acceptIdRef.current !== acceptId) return;
      setReferenceImage(dataUrl);
    } catch (caught) {
      if (acceptIdRef.current !== acceptId) return;
      const message = caught instanceof Error ? caught.message : "Could not prepare that image.";
      setError(message);
      clearReference();
    }
  }

  async function renderCharacterSheet(prompt: string) {
    if (!requireCredits(IMAGE_GENERATION_COST, "A character sheet costs 10 credits.")) {
      throw new Error("A character sheet costs 10 credits.");
    }
    const response = await fetch("/api/image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });
    const payload = (await response.json().catch(() => null)) as {
      id?: string;
      imageUrl?: string;
      prompt?: string;
      error?: string;
    } | null;
    if (!response.ok || typeof payload?.imageUrl !== "string") {
      throw new Error(payload?.error ?? "Could not render the character sheet.");
    }
    deductImageCredits(IMAGE_GENERATION_COST, DEFAULT_IMAGE_MODEL);
    const id = payload.id || `img_${Date.now().toString(36)}`;
    const sheetPrompt = payload.prompt || prompt;
    archiveProject({
      id,
      prompt: sheetPrompt,
      durationSec: 0,
      engine: "image",
      engineLabel: "Character reference sheet",
      voiceName: "Co-Pilot",
      voiceId: "",
      script: sheetPrompt,
      imageSrc: payload.imageUrl,
      kind: "image",
      creditsCharged: IMAGE_GENERATION_COST,
      createdAt: new Date().toISOString(),
    });
    void fetch("/api/gallery", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "image",
        id,
        prompt: sheetPrompt,
        imageUrl: payload.imageUrl,
        styleName: "Character reference sheet",
        credits: IMAGE_GENERATION_COST,
      }),
    }).catch(() => undefined);
    return payload.imageUrl;
  }

  async function attachCharacterSheet(imageUrl: string) {
    const response = await fetch("/api/image/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageUrl }),
    });
    if (!response.ok) {
      setError("Sign in to attach the character sheet to Video Generator.");
      return null;
    }
    const blob = await response.blob();
    const type = /^image\/(jpeg|png|webp)$/.test(blob.type) ? blob.type : "image/png";
    const file = new File([blob], "character-sheet.png", { type });
    replacePreview(URL.createObjectURL(file));
    setReferenceName(file.name);
    setReferenceBytes(file.size);
    setEngine(videoModelEngine(videoModel));
    const dataUrl = await prepareReferenceImage(file);
    setReferenceImage(dataUrl);
    return dataUrl;
  }

  function clearReference() {
    acceptIdRef.current += 1;
    replacePreview(null);
    setReferenceImage(null);
    setReferenceName(null);
    setReferenceBytes(null);
  }

  function onReferenceImage(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) acceptReference(file);
  }

  async function enhancePrompt() {
    const trimmed = topic.trim();
    if (trimmed.length < 3 || enhancing || running) return;
    setEnhancing(true);
    setError(null);
    try {
      const response = await fetch("/api/prompt/enhance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: trimmed }),
      });
      const payload = (await response.json().catch(() => null)) as { prompt?: string; error?: string } | null;
      if (!response.ok || typeof payload?.prompt !== "string") {
        throw new Error(payload?.error ?? "Could not enhance the prompt.");
      }
      setTopic(payload.prompt.slice(0, PROMPT_MAX));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not enhance the prompt.");
    } finally {
      setEnhancing(false);
    }
  }

  function closeStyleMenu() {
    setPicker((current) => (current === "style" ? null : current));
  }

  function closeImageModelMenu() {
    setPicker((current) => (current === "imageModel" ? null : current));
  }

  function closeImageAspectMenu() {
    setPicker((current) => (current === "imageAspect" ? null : current));
  }

  function closeVideoModelMenu() {
    setPicker((current) => (current === "model" ? null : current));
  }

  function closeVideoDurationMenu() {
    setPicker((current) => (current === "duration" ? null : current));
  }

  function selectVideoModel(next: VideoModelId) {
    setVideoModel(next);
    setEngine(videoModelEngine(next));
    setPicker(null);
    setError((current) => (current?.endsWith("credits.") ? null : current));
  }

  function switchMode(next: "video" | "image") {
    setMode(next);
    setPicker(null);
    setError(null);
  }

  function toggleDictation() {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const speechWindow = window as unknown as {
      SpeechRecognition?: new () => SpeechLike;
      webkitSpeechRecognition?: new () => SpeechLike;
    };
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setError("Dictation is not available in this browser.");
      return;
    }
    const recognition = new Recognition();
    recognition.lang = navigator.language || "en-US";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      const spoken = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? "")
        .join(" ")
        .trim();
      if (!spoken) return;
      setTopic((current) => `${current.trim()} ${spoken}`.trim().slice(0, PROMPT_MAX));
      plannedTopicRef.current = "";
    };
    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };
    recognition.onerror = () => {
      setListening(false);
      recognitionRef.current = null;
    };
    recognitionRef.current = recognition;
    setError(null);
    setListening(true);
    recognition.start();
  }

  useEffect(() => () => recognitionRef.current?.stop(), []);

  if (seenQuery !== query) {
    setSeenQuery(query);
    const next = new URLSearchParams(query);
    const requested = next.get("mode");
    if (next.get("copilot") === "1") {
      setMode("video");
      setPicker(null);
      setCopilotOpen(true);
    } else {
      if (requested === "video" || requested === "image") setMode(requested);
      setPicker(next.get("tool") === "filters" ? "style" : null);
    }
  }

  useEffect(() => {
    if (!picker) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setPicker(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [picker]);

  const activeStep = steps.find((step) => step.status === "started");
  const imageMode = mode === "image";
  const previewSrc = referencePreview ?? referenceImage;
  const imageReady = topic.trim().length >= 1;
  const imageInputPending = imageMode && Boolean(previewSrc) && !referenceImage;
  const referenceAttached = !imageMode && Boolean(previewSrc);
  const referencePreparing = referenceAttached && !referenceImage;
  const clipCount = sceneCountForDuration(durationSec);
  const longForm = !imageMode && durationSec > 10;
  const longCost = movieCreditCost(clipCount, Boolean(referenceImage));
  const runCost = videoClipCreditCost(videoModel, videoResolution, durationSec);
  const activeVideoCost = longForm ? longCost : runCost;
  const videoCostLabel = `${durationSec}s clip • ${activeVideoCost} credits`;

  const showVideoRun = !imageMode && (running || Boolean(result) || steps.some((step) => step.status !== "pending"));
  const showImageRun = imageMode && (running || Boolean(imageResult));
  const sendDisabled =
    !balanceReady ||
    running ||
    (!imageMode && credits < activeVideoCost) ||
    referencePreparing ||
    planning ||
    imageInputPending ||
    (imageMode ? !imageReady : topic.trim().length < 3);
  const voiceGender = getVoice(voice)?.gender ?? "female";

  function chip(id: StudioPicker, label: string, icon: React.ReactNode) {
    return (
      <button
        key={id}
        type="button"
        disabled={running}
        aria-expanded={picker === id}
        aria-haspopup="dialog"
        onClick={() => setPicker((current) => (current === id ? null : id))}
        className="home-chip"
      >
        {icon}
        <span className="truncate">{label}</span>
        <Glyph className="h-3 w-3 text-muted">
          <path d="m5 8 5 5 5-5" />
        </Glyph>
      </button>
    );
  }

  return (
    <div className="pb-10">
      <UpgradeModal open={upgradeOpen} onClose={() => setUpgradeOpen(false)} />
      <h1 className="mx-auto max-w-lg text-center text-[1.9rem] leading-[1.12] font-bold tracking-[-0.035em] sm:text-[2.35rem]">
        What would you like
        <br />
        to create today?
      </h1>

      <form onSubmit={onSubmit} className="mx-auto mt-6 w-full max-w-[640px]">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div role="tablist" aria-label="Generation mode" className="flex gap-0.5 rounded-lg border border-line bg-[var(--surface)] p-0.5">
            {(["image", "video"] as const).map((id) => {
              const selected = mode === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-label={id === "video" ? "Video Generator" : "Image Generator"}
                  title={id === "video" ? "Video" : "Image"}
                  disabled={running}
                  onClick={() => switchMode(id)}
                  className={cn(
                    "grid h-7 w-7 place-items-center rounded-md text-muted transition hover:text-foreground",
                    selected && "bg-panel-raised text-foreground",
                  )}
                >
                  {id === "video" ? (
                    <Glyph>
                      <rect x="2.5" y="5" width="11" height="10" rx="2" />
                      <path d="m13.5 8.5 4-2.5v8l-4-2.5" />
                    </Glyph>
                  ) : (
                    <Glyph>
                      <rect x="3" y="3.5" width="14" height="13" rx="2" />
                      <circle cx="7.5" cy="8" r="1.3" />
                      <path d="m3.5 14.5 4-4 3 3 2-2 4 3.5" />
                    </Glyph>
                  )}
                </button>
              );
            })}
          </div>
          <span className="flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs font-medium tabular-nums">
            <Glyph className="h-3.5 w-3.5">
              <circle cx="10" cy="10" r="7" />
              <circle cx="10" cy="10" r="3" />
            </Glyph>
            {imageMode ? imageModelCreditCost(imageModel) : activeVideoCost} credits
          </span>
        </div>

        <div
          className={cn("gen-prompt", draggingImage && "gen-prompt-hot")}
          onDragOver={(event) => {
            event.preventDefault();
            if (!running) setDraggingImage(true);
          }}
          onDragLeave={(event) => {
            if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
            setDraggingImage(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDraggingImage(false);
            if (running) return;
            const file = event.dataTransfer.files?.[0];
            if (file) acceptReference(file);
          }}
        >
          {previewSrc ? (
            <div className="flex items-center gap-3 px-4 pt-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previewSrc} alt="" className="h-14 w-11 shrink-0 rounded-lg object-cover ring-1 ring-line" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium">
                  {referenceName ?? (imageMode ? "Input image" : "Character reference")}
                </p>
                <p className="mt-0.5 text-[11px] text-muted">
                  {referenceBytes == null ? (imageMode ? "Input image" : "Character reference") : formatFileSize(referenceBytes)}
                  {referencePreparing || imageInputPending ? " · Preparing" : " · Ready"}
                </p>
              </div>
              <button type="button" onClick={() => referenceInputRef.current?.click()} disabled={running} className="home-chip">
                Change
              </button>
              <button type="button" onClick={clearReference} disabled={running} className="home-chip">
                Remove
              </button>
            </div>
          ) : null}
          <div className="relative">
            <label htmlFor="topic" className="sr-only">
              {imageMode ? "Style prompt" : "Movie topic"}
            </label>
            <textarea
              ref={promptRef}
              id="topic"
              name="topic"
              rows={3}
              maxLength={PROMPT_MAX}
              value={topic}
              disabled={running}
              placeholder={imageMode ? "Describe the image you're imagining" : "Describe the video you're imagining"}
              onChange={(event) => {
                setTopic(event.target.value);
                if (!plannedTopicRef.current.startsWith(`${event.target.value.trim()}|`)) {
                  plannedTopicRef.current = "";
                }
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
                event.preventDefault();
                if (!sendDisabled) event.currentTarget.form?.requestSubmit();
              }}
              onBlur={(event) => {
                const value = event.currentTarget.value;
                if (!imageMode && durationSec > 10 && value.trim().length >= 12) {
                  void planScenes(value, durationSec);
                }
              }}
              className="block min-h-[96px] w-full resize-none bg-transparent px-4 pt-3.5 pr-12 pb-2 text-sm leading-6 text-foreground outline-none placeholder:text-[#9a9aa1]"
            />
            {imageMode ? null : (
              <button
                type="button"
                title="Auto-enhance prompt"
                aria-label="Auto-enhance prompt"
                onClick={() => void enhancePrompt()}
                disabled={running || enhancing || topic.trim().length < 3}
                className="absolute top-3 right-3 grid h-7 w-7 place-items-center rounded-full text-muted transition hover:bg-panel hover:text-foreground disabled:opacity-40"
              >
                {enhancing ? (
                  <Spinner />
                ) : (
                  <Glyph>
                    <path d="M7.5 15h5M8 17.5h4" />
                    <path d="M10 2.5a5 5 0 0 0-3 9c.6.5 1 1.2 1 2V14h4v-.5c0-.8.4-1.5 1-2a5 5 0 0 0-3-9Z" />
                  </Glyph>
                )}
              </button>
            )}
          </div>
          <div className="flex items-end gap-2 px-3 pb-3">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
              <button
                type="button"
                aria-label={imageMode ? "Upload input image" : "Add character reference image"}
                title={imageMode ? "Upload input image" : "Add character reference image"}
                onClick={() => referenceInputRef.current?.click()}
                disabled={running}
                className="home-chip px-1.5"
              >
                <Glyph className="h-3.5 w-3.5">
                  <path d="M10 4v12M4 10h12" />
                </Glyph>
              </button>
              {imageMode ? (
                <>
                  <ImageModelMenu
                    open={picker === "imageModel"}
                    value={imageModel}
                    onSelect={(next) => {
                      setImageModel(next);
                      setPicker(null);
                      setError((current) => (current?.endsWith("credits.") ? null : current));
                    }}
                    onClose={closeImageModelMenu}
                    trigger={chip(
                      "imageModel",
                      getImageModel(imageModel).shortName,
                      <Glyph className="h-3.5 w-3.5">
                        <rect x="3.5" y="3.5" width="13" height="13" rx="3" />
                        <path d="M7.5 10h5M10 7.5v5" />
                      </Glyph>,
                    )}
                  />
                  <StyleMenu
                    open={picker === "style"}
                    value={imageStyle}
                    onSelect={(next) => {
                      setImageStyle(next);
                      setPicker(null);
                    }}
                    onClose={closeStyleMenu}
                    trigger={chip(
                      "style",
                      imageStyle ? imageStyleName(imageStyle) : "Style",
                      <Glyph className="h-3.5 w-3.5">
                        <path d="M10 2.5c.4 3.4 2.1 5.1 5.5 5.5-3.4.4-5.1 2.1-5.5 5.5-.4-3.4-2.1-5.1-5.5-5.5 3.4-.4 5.1-2.1 5.5-5.5Z" />
                      </Glyph>,
                    )}
                  />
                  <ImageAspectMenu
                    open={picker === "imageAspect"}
                    value={imageAspect}
                    onSelect={(next) => {
                      setImageAspect(next);
                      setPicker(null);
                    }}
                    onClose={closeImageAspectMenu}
                    trigger={chip(
                      "imageAspect",
                      imageAspect,
                      <Glyph className="h-3.5 w-3.5">
                        <rect x="3" y="5.5" width="14" height="9" rx="1.5" />
                      </Glyph>,
                    )}
                  />
                </>
              ) : (
                <>
                  <VideoModelMenu
                    open={picker === "model"}
                    value={videoModel}
                    resolution={videoResolution}
                    durationSec={durationSec >= 10 ? 10 : 5}
                    onSelect={selectVideoModel}
                    onClose={closeVideoModelMenu}
                    trigger={chip(
                      "model",
                      getVideoModel(videoModel).shortName,
                      <Glyph className="h-3.5 w-3.5">
                        <rect x="3.5" y="3.5" width="13" height="13" rx="3" />
                        <path d="M7.5 10h5M10 7.5v5" />
                      </Glyph>,
                    )}
                  />
                  {chip(
                    "aspect",
                    aspect,
                    <Glyph className="h-3.5 w-3.5">
                      <rect x="3" y="5.5" width="14" height="9" rx="1.5" />
                    </Glyph>,
                  )}
                  <VideoDurationMenu
                    open={picker === "duration"}
                    value={durationSec >= 10 ? 10 : 5}
                    model={videoModel}
                    resolution={videoResolution}
                    onSelect={(next) => {
                      setDurationSec(next);
                      plannedTopicRef.current = "";
                      setScenes([]);
                      setPicker(null);
                    }}
                    onClose={closeVideoDurationMenu}
                    trigger={chip(
                      "duration",
                      `${durationSec >= 10 ? 10 : 5}s`,
                      <Glyph className="h-3.5 w-3.5">
                        <circle cx="10" cy="10.5" r="6.5" />
                        <path d="M10 7v3.5l2.2 1.4M8 2.5h4" />
                      </Glyph>,
                    )}
                  />
                  <span className="home-chip pointer-events-none">
                    <Glyph className="h-3.5 w-3.5">
                      <rect x="2.5" y="4.5" width="15" height="11" rx="1.5" />
                      <path d="M6 15.5h8" />
                    </Glyph>
                    <span>720p HD</span>
                  </span>
                  {characters.length > 0 ? (
                    <label className="home-chip">
                      <span className="sr-only">Character library</span>
                      <select
                        className="bg-transparent text-xs outline-none"
                        defaultValue=""
                        onChange={(event) => {
                          const picked = characters.find((item) => item.id === event.target.value);
                          event.currentTarget.value = "";
                          if (!picked) return;
                          setReferenceImage(picked.characterImageUrl);
                          setReferencePreview(picked.characterImageUrl);
                          setReferenceName(picked.name);
                          setReferenceBytes(null);
                          setMode("video");
                        }}
                      >
                        <option value="">Character library</option>
                        {characters.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  {chip(
                    "motion",
                    motionStyle ? motionPillLabel(motionStyle).replace("Motion: ", "") : "Motion",
                    <Glyph className="h-3.5 w-3.5">
                      <path d="M3 13c3-6 5-6 7 0s4 6 7 0" />
                    </Glyph>,
                  )}
                </>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                aria-label={listening ? "Stop dictation" : "Dictate prompt"}
                aria-pressed={listening}
                title={listening ? "Stop dictation" : "Type the prompt by speaking"}
                onClick={toggleDictation}
                disabled={running}
                className={cn(
                  "grid h-8 w-8 place-items-center rounded-full text-muted transition hover:bg-panel hover:text-foreground disabled:opacity-40",
                  listening && "bg-red-500/15 text-red-500 hover:bg-red-500/15 hover:text-red-500",
                )}
              >
                <Glyph>
                  <rect x="7.5" y="2.5" width="5" height="9.5" rx="2.5" />
                  <path d="M4.5 9.5a5.5 5.5 0 0 0 11 0M10 15v2.5" />
                </Glyph>
              </button>
              {running ? (
                <button
                  type="button"
                  onClick={stop}
                  aria-label="Stop generation"
                  title="Stop"
                  className="grid h-8 w-8 place-items-center rounded-full bg-foreground text-background"
                >
                  <span aria-hidden className="h-2.5 w-2.5 rounded-[2px] bg-background" />
                </button>
              ) : (
                <button
                  type="submit"
                  aria-label={imageMode ? `Generate image, ${imageModelCreditCost(imageModel)} credits` : `Generate video, ${activeVideoCost} credits`}
                  title={imageMode ? `Generate image • ${imageModelCreditCost(imageModel)} credits` : `Generate ${durationSec}s • ${activeVideoCost} credits`}
                  disabled={sendDisabled}
                  className="grid h-8 w-8 place-items-center rounded-full bg-foreground text-background transition hover:opacity-90 disabled:opacity-25"
                >
                  {planning ? (
                    <Spinner />
                  ) : (
                    <Glyph>
                      <path d="M10 16V4M5 9l5-5 5 5" />
                    </Glyph>
                  )}
                </button>
              )}
            </div>
          </div>
          {picker && !FLOATING_PICKERS.includes(picker) ? (
            <div role="dialog" aria-label={PICKER_TITLE[picker]} className="border-t border-line px-3 py-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-sm font-medium">{PICKER_TITLE[picker]}</p>
                <button
                  type="button"
                  aria-label="Close"
                  onClick={() => setPicker(null)}
                  className="grid h-7 w-7 place-items-center rounded-full text-muted hover:bg-panel hover:text-foreground"
                >
                  <Glyph className="h-3.5 w-3.5">
                    <path d="m5 5 10 10M15 5 5 15" />
                  </Glyph>
                </button>
              </div>
              {picker === "motion" ? (
                <div className="grid gap-1.5 sm:grid-cols-2">
                  <button
                    type="button"
                    aria-pressed={motionStyle === ""}
                    onClick={() => {
                      setMotionStyle("");
                      setPicker(null);
                    }}
                    className="home-option"
                  >
                    Default look
                  </button>
                  {MOTION_STYLES.map((style) => (
                    <button
                      key={style.id}
                      type="button"
                      aria-pressed={motionStyle === style.id}
                      onClick={() => {
                        setMotionStyle(style.id);
                        setPicker(null);
                      }}
                      className="home-option"
                    >
                      {style.name}
                    </button>
                  ))}
                </div>
              ) : null}
              {picker === "aspect" ? (
                <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Aspect ratio">
                  {FRAME_ASPECTS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      role="radio"
                      aria-checked={aspect === option.id}
                      onClick={() => {
                        setAspect(option.id);
                        setPicker(null);
                      }}
                      className="home-option text-center"
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "mx-auto mb-1.5 block rounded-[3px] border-[1.5px] border-current",
                          option.id === "9:16" ? "h-6 w-3.5" : option.id === "1:1" ? "h-5 w-5" : "h-3.5 w-6",
                        )}
                      />
                      <span className="block font-medium">{option.label}</span>
                      <span className="block text-[11px] text-muted">{frameCue(option.id).split(" ")[0]}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
          <input
            ref={referenceInputRef}
            id="reference-image"
            name="reference-image"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={running}
            onChange={onReferenceImage}
            className="sr-only"
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 px-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {imageMode ? null : (
              <>
                <button
                  type="button"
                  aria-expanded={copilotOpen}
                  disabled={running}
                  onClick={() => setCopilotOpen(true)}
                  className="home-chip"
                >
                  <Glyph className="h-3.5 w-3.5 text-violet-600">
                    <path d="M10 2.5c.4 3.4 2.1 5.1 5.5 5.5-3.4.4-5.1 2.1-5.5 5.5-.4-3.4-2.1-5.1-5.5-5.5 3.4-.4 5.1-2.1 5.5-5.5Z" />
                  </Glyph>
                  AI Co-Pilot · Free
                </button>
                <label
                  className="home-chip cursor-pointer"
                  title="Skip Fal.ai and load a free 9:16 stock clip. Dialogue and captions still run."
                >
                  <input
                    type="checkbox"
                    className="h-3 w-3 accent-black"
                    checked={mockMode}
                    disabled={running}
                    onChange={(event) => setMockMode(event.target.checked)}
                  />
                  Use Mock Mode
                </label>
              </>
            )}
            {!imageMode && scenes.length > 0 ? (
              <button
                type="button"
                onClick={() => void renderFilm()}
                disabled={!balanceReady || running || planning || engine !== "budget"}
                className="home-chip"
              >
                {planning
                  ? "Planning scenes…"
                  : `Generate ${scenes.length * CLIP_DURATION_SEC}s film • ${movieCreditCost(scenes.length, Boolean(referenceImage))} credits`}
              </button>
            ) : null}
          </div>
          <p className="text-[11px] text-muted">
            {running
              ? statusMessage
              : imageMode
                ? `${imageModelCreditCost(imageModel)} credits per image`
                : referencePreparing
                  ? "Preparing the reference image"
                  : planning
                    ? "Writing scenes…"
                    : videoCostLabel}
          </p>
        </div>

        {balanceReady && !imageMode && activeVideoCost > 0 && credits < activeVideoCost ? (
          <p role="status" className="gen-alert mt-3">
            {longForm
              ? `This ${durationSec}s video costs ${longCost} credits.`
              : INSUFFICIENT_CREDITS_MESSAGE}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="gen-alert mt-3">
            {error}
          </p>
        ) : null}
      </form>

      {imageMode ? null : (
        <p className="sr-only" aria-live="polite">
          {statusMessage}
        </p>
      )}

      {showImageRun ? (
        <div className="mx-auto mt-8 max-w-3xl">
          <ImageResultPanel
            running={running}
            source={previewSrc}
            aspect={imageAspect}
            result={imageResult}
            statusMessage={statusMessage}
            downloadError={downloadError}
            onChange={() => referenceInputRef.current?.click()}
            onRemove={clearReference}
            onDownload={(imageUrl) => {
              void downloadImage(imageUrl).catch(() => {
                setDownloadError("Could not download that image.");
              });
            }}
            onSaveCharacter={openCharacterSave}
          />
        </div>
      ) : null}

      {showVideoRun ? (
        <section className="mx-auto mt-8 w-full max-w-3xl">
          {result ? null : (
            <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-white/10 bg-[#09090b]" aria-live="polite">
              <span className="absolute top-[28%] left-[22%] h-1.5 w-1.5 animate-pulse rounded-full bg-white/50" />
              <span className="absolute top-[22%] left-[58%] h-1 w-1 animate-pulse rounded-full bg-white/35 [animation-delay:180ms]" />
              <span className="absolute right-[26%] bottom-[36%] h-1.5 w-1.5 animate-pulse rounded-full bg-violet-200/50 [animation-delay:360ms]" />
              <span className="absolute bottom-[30%] left-[42%] h-1 w-1 animate-pulse rounded-full bg-white/30 [animation-delay:540ms]" />
              <span className="sr-only">{statusMessage || "Rendering video"}</span>
            </div>
          )}

          {result ? (
              <div>
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold tracking-tight">
                      {result.preview ? "Free-tier preview" : "Preview"} {result.id}
                    </h3>
                    <p className="mt-1 text-sm text-muted">
                      {result.durationSec}s · {result.voiceName} · {Math.max(1, new Set(result.frames.map((frame) => frame.src)).size)} scenes ·{" "}
                      {result.creditsCharged} credits
                    </p>
                  </div>
                  {result.preview ? (
                    <span className="rounded-full border border-ok/30 bg-ok/10 px-3 py-1 text-xs text-ok">
                      Fallback player
                    </span>
                  ) : null}
                </div>
                <Storyboard
                  frames={result.frames}
                  script={result.script}
                  voiceId={result.voiceId}
                  audioSrc={result.audioSrc}
                  audioLabel={result.audioLabel}
                  narrationEmbedded={result.narrationEmbedded}
                  durationSec={result.durationSec}
                  videoUrl={result.videoUrl}
                  aspect={aspect}
                />
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  {(() => {
                    const clipUrl = result.videoUrl || chainVideoUrls(result.frames).at(-1);
                    if (!clipUrl) return null;
                    const finalMovie = Boolean(result.videoUrl) && result.durationSec > CLIP_DURATION_SEC;
                    return (
                      <button
                        type="button"
                        onClick={() => {
                          void downloadVideo(clipUrl, finalMovie ? "cut45-movie.mp4" : "cut45-video.mp4").catch(() => {
                            setDownloadError("Could not download that video.");
                          });
                        }}
                        className="gen-cta"
                      >
                        {finalMovie ? "Download Final Movie" : "Download / Save"}
                      </button>
                    );
                  })()}
                  {previewSrc ? (
                    <button
                      type="button"
                      onClick={() => openCharacterSave(previewSrc)}
                      disabled={running || savingCharacter}
                      className="gen-ghost"
                    >
                      Save to Character Library
                    </button>
                  ) : null}
                  {result.videoUrl || chainVideoUrls(result.frames).length > 0 ? (
                    <button
                      type="button"
                      onClick={() => void continueFiveSeconds()}
                      disabled={!balanceReady || running}
                      className="gen-ghost"
                    >
                      Continue Scene
                    </button>
                  ) : null}
                  {chainVideoUrls(result.frames).length > 0 ? (
                    <>
                      <button
                        type="button"
                        onClick={() => void extendVideo()}
                        disabled={!balanceReady || running}
                        className="gen-ghost"
                      >
                        Extend Video (+45s)
                      </button>
                      <p className="text-xs text-muted">45s clip • {EXTEND_VIDEO_COST} credits</p>
                    </>
                  ) : null}
                </div>
                {downloadError ? (
                  <p role="alert" className="gen-alert mt-3">
                    {downloadError}
                  </p>
                ) : null}
              </div>
          ) : null}
        </section>
      ) : null}

      {saveOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-4" role="dialog" aria-modal="true" aria-labelledby="save-character-title">
          <form
            className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#111113] p-5"
            onSubmit={(event) => {
              event.preventDefault();
              void saveCharacter();
            }}
          >
            <h2 id="save-character-title" className="text-base font-semibold">Save to Character Library</h2>
            <p className="mt-1 text-sm text-muted">Name this character so the next video can keep the same look.</p>
            <input
              autoFocus
              value={saveName}
              onChange={(event) => setSaveName(event.target.value)}
              placeholder="Kai Renn"
              className="mt-4 w-full rounded-xl border border-white/10 bg-black px-3 py-2 text-sm outline-none"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="gen-ghost" onClick={() => setSaveOpen(false)} disabled={savingCharacter}>
                Cancel
              </button>
              <button type="submit" className="gen-cta" disabled={savingCharacter || saveName.trim().length < 1}>
                {savingCharacter ? "Saving…" : "Save character"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      <CopilotPanel
        open={copilotOpen}
        topic={topic}
        scenes={scenes}
        sceneCount={clipCount}
        busy={running || planning}
        onClose={() => setCopilotOpen(false)}
        onScenes={(next) => {
          plannedTopicRef.current = next.length === clipCount ? planKey(topic, durationSec) : "";
          setScenes(next);
        }}
        onRenderCharacterSheet={renderCharacterSheet}
        onUseInVideo={(visualPrompt, imageUrl) => {
          setMode("video");
          setPicker(null);
          plannedTopicRef.current = "";
          setTopic(visualPrompt.slice(0, PROMPT_MAX));
          setError(null);
          setCopilotOpen(false);
          if (imageUrl) void attachCharacterSheet(imageUrl);
        }}
        onGenerateMovie={async (sceneList, imageUrl) => {
          const movieScenes = sceneList.slice(0, 4);
          if (movieScenes.length < 2) {
            setError("Plan at least two scenes before generating the full movie.");
            return;
          }
          setMode("video");
          setVideoModel(DEFAULT_VIDEO_MODEL);
          setEngine("budget");
          setPicker(null);
          setCopilotOpen(false);
          let reference = referenceImage;
          if (imageUrl) {
            const loaded = await attachCharacterSheet(imageUrl);
            if (!loaded) return;
            reference = loaded;
          }
          const movieTopic =
            topic.trim().length >= 3 ? topic.trim() : movieScenes.map((scene) => scene.title).filter(Boolean).join(". ");
          if (movieTopic) setTopic(movieTopic.slice(0, PROMPT_MAX));
          await renderFilm(movieScenes, { referenceDataUrl: reference, forceBudget: true });
        }}
      />
    </div>
  );
}

function ImageResultPanel({
  running,
  source,
  aspect,
  result,
  statusMessage,
  downloadError,
  onChange,
  onRemove,
  onDownload,
  onSaveCharacter,
}: {
  running: boolean;
  source: string | null;
  aspect: ImageAspectId;
  result: { id: string; imageUrl: string; prompt: string } | null;
  statusMessage: string;
  downloadError: string | null;
  onChange: () => void;
  onRemove: () => void;
  onDownload: (imageUrl: string) => void;
  onSaveCharacter?: (imageUrl: string) => void;
}) {
  const [outputReady, setOutputReady] = useState(false);
  useEffect(() => {
    setOutputReady(false);
  }, [result?.imageUrl]);

  return (
    <section className="gen-glass rounded-3xl p-5 sm:p-6">
      <p className="sr-only" aria-live="polite">
        {statusMessage}
      </p>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent">Avatar Studio</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight">Image result</h2>
        </div>
        <p className="rounded-full border border-line px-3 py-1 font-mono text-[11px] text-muted">
          {aspect} · image
        </p>
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <figure>
          <figcaption className="mb-2 text-xs uppercase tracking-[0.16em] text-muted">Input</figcaption>
          {source ? (
            <div className="overflow-hidden rounded-2xl bg-black ring-1 ring-line">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={source} alt="" className="aspect-square w-full object-contain" />
              <div className="flex gap-2 border-t border-line p-2">
                <button
                  type="button"
                  onClick={onChange}
                  disabled={running}
                  className="rounded-full border border-line px-3 py-1.5 text-xs text-foreground transition hover:border-accent hover:text-accent"
                >
                  Change Image
                </button>
                <button
                  type="button"
                  onClick={onRemove}
                  disabled={running}
                  className="rounded-full border border-line px-3 py-1.5 text-xs text-foreground transition hover:border-accent hover:text-accent"
                >
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <div className="grid aspect-square place-items-center rounded-2xl border border-dashed border-line px-4 text-center text-sm text-muted">
              No input image. The prompt is used on its own.
            </div>
          )}
        </figure>
        <figure>
          <figcaption className="mb-2 text-xs uppercase tracking-[0.16em] text-muted">Output</figcaption>
          <div className={cn("relative overflow-hidden rounded-2xl bg-black ring-1 ring-line", imageAspectFrameClass(aspect))}>
            {result ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={result.imageUrl}
                alt={result.prompt}
                onLoad={() => setOutputReady(true)}
                className={cn(
                  "h-full w-full object-contain transition-opacity duration-300",
                  outputReady ? "opacity-100" : "opacity-0",
                )}
              />
            ) : null}
            {running || (result && !outputReady) ? (
              <div
                role="status"
                aria-live="polite"
                className="gen-skeleton gen-skeleton-live absolute inset-0 grid place-items-center gap-3 px-4 text-center"
              >
                <span className="grid h-12 w-12 place-items-center rounded-full border border-line bg-black/50 text-white">
                  <Spinner />
                </span>
                {running ? (
                  <p className="max-w-[16rem] text-sm text-foreground">{statusMessage || "Rendering the image."}</p>
                ) : null}
              </div>
            ) : null}
            {!running && !result ? (
              <div className="grid h-full place-items-center px-4 text-center text-sm text-muted">
                The styled image appears here
              </div>
            ) : null}
          </div>
        </figure>
      </div>
      {result ? (
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => onDownload(result.imageUrl)} className="gen-cta">
            Download / Save
          </button>
          {onSaveCharacter ? (
            <button type="button" onClick={() => onSaveCharacter(result.imageUrl)} className="gen-ghost">
              Save to Character Library
            </button>
          ) : null}
          <p className="text-sm text-muted">{result.prompt}</p>
        </div>
      ) : null}
      {downloadError ? (
        <p role="alert" className="gen-alert mt-4">
          {downloadError}
        </p>
      ) : null}
    </section>
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

