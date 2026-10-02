"use client";

import { useEffect, useRef, useState } from "react";
import {
  FRAME_COUNT,
  GENERATE_STEPS,
  VIDEO_DURATION_SEC,
  buildStoryboard,
  chainVideoUrls,
  countWords,
  isGenerateEvent,
  previewScript,
  stitchExtension,
  type GenerateEvent,
  type GenerateResult,
  type GenerateStepId,
} from "@/lib/generate";
import { VOICES, getVoice, isVoiceId, type VoiceId } from "@/lib/voices";
import {
  VISUAL_ENGINES,
  type VisualEngineId,
} from "@/lib/visual-engines";
import { useCredits } from "@/components/credit-provider";
import { Storyboard } from "@/components/storyboard";
import { useDefaultVoice } from "@/components/use-default-voice";
import { EXTEND_VIDEO_COST, IMAGE_GENERATION_COST, generationCreditCost } from "@/lib/credits";
import { IMAGE_STYLES, imageStyleName, isImageStyleId, type ImageStyleId } from "@/lib/image-styles";
import { isMotionStyleId, MOTION_STYLES, PROMPT_MAX, type MotionStyleId } from "@/lib/motion-styles";
import { prepareReferenceImage } from "@/lib/prepare-reference-image";

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

function ImageIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0 text-cyan-200" fill="none" aria-hidden>
      <rect x="2" y="3" width="12" height="10" rx="1.6" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="6" cy="6.5" r="1" fill="currentColor" />
      <path d="M3.5 11.5 6.2 8.8l1.8 1.7 2-2.2L12.5 11" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
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
      rate: "60 credits",
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

export function GenerateForm() {
  const { voice: storedVoice } = useDefaultVoice();
  const { credits, deductForEngine, deductImageCredits, deductExtendCredits, archiveProject } = useCredits();
  const [mode, setMode] = useState<"video" | "image">("video");
  const [imageStyle, setImageStyle] = useState<ImageStyleId | "">("");
  const [imageResult, setImageResult] = useState<{ id: string; imageUrl: string; prompt: string } | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [topic, setTopic] = useState("");
  const [voiceOverride, setVoiceOverride] = useState<VoiceId | null>(null);
  const [engine, setEngine] = useState<VisualEngineId>("stock");
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const [referencePreview, setReferencePreview] = useState<string | null>(null);
  const [referenceName, setReferenceName] = useState<string | null>(null);
  const [referenceBytes, setReferenceBytes] = useState<number | null>(null);
  const [draggingImage, setDraggingImage] = useState(false);
  const [motionStyle, setMotionStyle] = useState<MotionStyleId | "">("");
  const [enhancing, setEnhancing] = useState(false);
  const [steps, setSteps] = useState<StepView[]>(INITIAL_STEPS);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("Waiting for a topic.");
  const [running, setRunning] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const imageRunRef = useRef(false);
  const extendRunRef = useRef(false);
  const previewRef = useRef<string | null>(null);
  const acceptIdRef = useRef(0);
  const referenceInputRef = useRef<HTMLInputElement>(null);
  const outcomeRef = useRef<"idle" | "complete" | "error">("idle");
  const fallbackRef = useRef(false);
  const voice = voiceOverride ?? storedVoice;

  function resetRun() {
    outcomeRef.current = "idle";
    fallbackRef.current = false;
    setSteps(INITIAL_STEPS.map((step) => ({ ...step })));
    setResult(null);
    setError(null);
    setNotice(null);
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
      if (extendRunRef.current) {
        extendRunRef.current = false;
        const stitched = result ? stitchExtension(result, event.result) : event.result;
        deductExtendCredits();
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
        setResult(stitched);
        setStatusMessage(`Extended to ${stitched.durationSec}s. ${EXTEND_VIDEO_COST} credits used.`);
        return;
      }
      const imageRun =
        imageRunRef.current &&
        !event.result.preview &&
        event.result.creditsCharged > 0 &&
        event.result.engine !== "stock";
      if (!(event.result.preview && event.result.creditsCharged === 0)) {
        deductForEngine(event.result.engine, imageRun);
      }
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

  async function submitImage() {
    const trimmed = topic.trim();
    if (!referencePreview && !referenceImage) {
      setError("Upload an input image.");
      return;
    }
    if (!referenceImage) {
      setError("The input image is still loading.");
      return;
    }
    if (trimmed.length < 3 && !imageStyle) {
      setError("Write a style prompt or pick a preset.");
      return;
    }
    if (trimmed.length > PROMPT_MAX) {
      setError(`Keep the prompt under ${PROMPT_MAX} characters.`);
      return;
    }
    if (credits < IMAGE_GENERATION_COST) {
      setError("Image generation costs 10 credits.");
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    setError(null);
    setDownloadError(null);
    setImageResult(null);
    setStatusMessage("Rendering the image.");

    try {
      const response = await fetch("/api/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          prompt: trimmed,
          style: imageStyle || undefined,
          referenceImage,
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
      deductImageCredits();
      setImageResult({ id, imageUrl: payload.imageUrl, prompt });
      archiveProject({
        id,
        prompt,
        durationSec: 0,
        engine: "image",
        engineLabel: "Image-to-Image / Avatar Studio",
        voiceName: styleLabel,
        voiceId: "",
        script: prompt,
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
          prompt,
          imageUrl: payload.imageUrl,
          styleName: styleLabel,
          credits: IMAGE_GENERATION_COST,
        }),
      }).catch(() => undefined);
      setStatusMessage("Image ready. 10 credits used.");
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
    const response = await fetch("/api/image/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageUrl }),
    });
    if (!response.ok) throw new Error("Could not download that image.");
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "cut45-image.png";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function extendVideo() {
    if (!result || running) return;
    const urls = chainVideoUrls(result.frames);
    if (urls.length === 0) {
      setError("Extend a finished Studio Fast Motion video.");
      return;
    }
    if (credits < EXTEND_VIDEO_COST) {
      setError("Extend Video costs 45 credits.");
      return;
    }

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
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Could not extend that video.");
      }
      await readProgress(response, controller.signal);
      if (outcomeRef.current === "idle") {
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
    }
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

    if (!isVoiceId(voice)) {
      setError("Select a voice style.");
      return;
    }

    if (referencePreview && !referenceImage) {
      setError("The reference image is still preparing.");
      return;
    }

    const imageToVideo = Boolean(referenceImage) && engine !== "stock";
    imageRunRef.current = imageToVideo;
    const cost = generationCreditCost(engine, imageToVideo);
    if (credits < cost) {
      setError(`${engineOffer(engine, imageToVideo).name} costs ${cost} credits.`);
      return;
    }

    abortRef.current?.abort();
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
        body: JSON.stringify({
          topic: trimmed,
          voice,
          engine,
          ...(referenceImage ? { referenceImage } : {}),
          ...(motionStyle ? { motionStyle } : {}),
        }),
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

  function replacePreview(next: string | null) {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = next;
    setReferencePreview(next);
  }

  useEffect(() => {
    return () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    };
  }, []);

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
    setEngine("budget");
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

  const activeStep = steps.find((step) => step.status === "started");
  const imageMode = mode === "image";
  const previewSrc = referencePreview ?? referenceImage;
  const imageReady = Boolean(previewSrc) && (topic.trim().length >= 3 || Boolean(imageStyle));
  const referenceAttached = !imageMode && Boolean(previewSrc);
  const referencePreparing = referenceAttached && !referenceImage;
  const imageToVideo = referenceAttached && engine !== "stock";
  const runCost = generationCreditCost(engine, imageToVideo);
  const engineChoices = (referenceAttached
    ? VISUAL_ENGINES.filter((option) => option.id !== "stock")
    : VISUAL_ENGINES
  ).filter((option) => option.id !== "ultra");
  const videoCostLabel = referenceAttached
    ? `Reference image · ${runCost} credits`
    : runCost === 0
      ? "Free preview · 0 credits"
      : `Text-only · ${runCost} credits`;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
      <form onSubmit={onSubmit} className="gen-glass space-y-7 rounded-3xl p-5 sm:p-6">
        <div role="tablist" aria-label="Generation mode" className="grid gap-2.5 sm:grid-cols-2">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "video"}
            disabled={running}
            onClick={() => {
              setMode("video");
              setError(null);
            }}
            className={cn("gen-pick text-left", mode === "video" && "gen-pick-on")}
          >
            <span className="min-w-0">
              <span className="block text-sm font-medium tracking-tight">Video Generator</span>
              <span className="mt-1 block text-sm leading-6 text-muted">45-second faceless short</span>
            </span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "image"}
            disabled={running}
            onClick={() => {
              setMode("image");
              setError(null);
            }}
            className={cn("gen-pick text-left", mode === "image" && "gen-pick-on")}
          >
            <span className="min-w-0">
              <span className="block text-sm font-medium tracking-tight">Image-to-Image / Avatar Studio</span>
              <span className="mt-1 block text-sm leading-6 text-muted">10 credits per still</span>
            </span>
          </button>
        </div>
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label htmlFor="topic" className="text-sm font-medium tracking-tight">
              {imageMode ? "Style prompt" : "Video topic"}
            </label>
            <div className="flex items-center gap-2">
              {imageMode ? null : (
              <button
                type="button"
                onClick={() => void enhancePrompt()}
                disabled={running || enhancing || topic.trim().length < 3}
                className="gen-enhance"
              >
                {enhancing ? "Enhancing…" : "✨ Auto-Enhance Prompt"}
              </button>
              )}
              <span className="font-mono text-[11px] text-muted">
                {topic.trim().length}/{PROMPT_MAX}
              </span>
            </div>
          </div>
          <div
            className={cn("gen-prompt mt-3", draggingImage && "gen-prompt-hot")}
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
            <textarea
              id="topic"
              name="topic"
              rows={4}
              maxLength={PROMPT_MAX}
              value={topic}
              disabled={running}
              placeholder={imageMode ? "Transform into a 3D Pixar character" : "Why night markets stay cheap"}
              onChange={(event) => setTopic(event.target.value)}
              className="w-full resize-y bg-transparent px-4 py-3 text-base leading-7 text-foreground outline-none placeholder:text-muted/60"
            />
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
            {imageMode && previewSrc ? (
              <div className="border-t border-white/10 px-3 py-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewSrc}
                  alt=""
                  className="max-h-64 w-full rounded-2xl bg-black object-contain ring-1 ring-cyan-300/40"
                />
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium tracking-tight">{referenceName}</p>
                    <p className="mt-0.5 font-mono text-[11px] text-muted">
                      {referenceBytes == null ? "Input image" : formatFileSize(referenceBytes)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => referenceInputRef.current?.click()}
                      disabled={running}
                      className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-foreground transition hover:border-cyan-300/70 hover:text-cyan-100"
                    >
                      Change Image
                    </button>
                    <button
                      type="button"
                      onClick={clearReference}
                      disabled={running}
                      className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-foreground transition hover:border-cyan-300/70 hover:text-cyan-100"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ) : imageMode ? (
              <button
                type="button"
                disabled={running}
                onClick={() => referenceInputRef.current?.click()}
                title="Best stills are sharp 9:16 or 3:4, at least 720×1280, with the subject fully in frame and evenly lit."
                className="gen-attach"
              >
                <ImageIcon />
                <span className="min-w-0">
                  <span className="block text-sm font-medium tracking-tight text-foreground">
                    Upload Input Image
                  </span>
                  <span className="mt-0.5 block text-xs text-muted">
                    Drop a JPEG, PNG, or WebP · sharp 9:16 or 3:4
                  </span>
                </span>
              </button>
            ) : null}
          </div>
        </div>

        {imageMode ? null : (
          <div>
            <div className="flex flex-wrap items-end justify-between gap-2">
              <p className="text-sm font-medium tracking-tight">Reference image</p>
              <p className="font-mono text-[11px] tracking-wide text-accent">{videoCostLabel}</p>
            </div>
            <div
              className={cn("gen-reference mt-3", draggingImage && "gen-prompt-hot")}
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
                <div className="flex flex-col gap-4 p-3 sm:flex-row sm:items-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewSrc}
                    alt=""
                    className="h-40 w-full rounded-2xl bg-black object-cover ring-1 ring-cyan-300/40 sm:h-28 sm:w-24"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium tracking-tight">{referenceName}</p>
                    <p className="mt-1 font-mono text-[11px] text-muted">
                      {referenceBytes == null ? "Reference image" : formatFileSize(referenceBytes)}
                      {referencePreparing ? " · Preparing" : " · Ready"}
                    </p>
                    <p className="mt-2 text-xs leading-5 text-muted">
                      Studio Fast Motion keeps this still as the subject.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => referenceInputRef.current?.click()}
                        disabled={running}
                        className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-foreground transition hover:border-cyan-300/70 hover:text-cyan-100"
                      >
                        Change Image
                      </button>
                      <button
                        type="button"
                        onClick={clearReference}
                        disabled={running}
                        className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-foreground transition hover:border-cyan-300/70 hover:text-cyan-100"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={running}
                  onClick={() => referenceInputRef.current?.click()}
                  className="gen-reference-empty"
                >
                  <ImageIcon />
                  <span className="min-w-0 text-left">
                    <span className="block text-sm font-medium tracking-tight text-foreground">
                      Upload Reference Image / Character
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-muted">
                      Drop a JPEG, PNG, or WebP. A sharp 9:16 or 3:4 still, subject fully in frame.
                    </span>
                  </span>
                </button>
              )}
            </div>
          </div>
        )}

        {imageMode ? (
          <div>
            <p className="text-sm font-medium tracking-tight">Style presets</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {IMAGE_STYLES.map((style) => {
                const selected = imageStyle === style.id;
                return (
                  <button
                    key={style.id}
                    type="button"
                    disabled={running}
                    aria-pressed={selected}
                    onClick={() => setImageStyle(selected ? "" : style.id)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-sm transition",
                      selected
                        ? "border-cyan-300/70 bg-cyan-300/15 text-cyan-50"
                        : "border-white/10 bg-black/30 text-foreground hover:border-cyan-300/40",
                    )}
                  >
                    {style.name}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {imageMode ? null : (
        <div>
          <label htmlFor="motion-style" className="text-sm font-medium tracking-tight">
            Motion style
          </label>
          <select
            id="motion-style"
            name="motion-style"
            value={motionStyle}
            disabled={running}
            onChange={(event) => {
              const value = event.target.value;
              setMotionStyle(isMotionStyleId(value) ? value : "");
            }}
            className="gen-field gen-select mt-3 w-full rounded-2xl px-4 py-3 text-sm text-foreground outline-none"
          >
            <option value="">Optional</option>
            {MOTION_STYLES.map((style) => (
              <option key={style.id} value={style.id}>
                {style.name}
              </option>
            ))}
          </select>
          <p className="mt-2 text-xs leading-5 text-muted">
            Added to the motion prompt. Leave it optional for the default look.
          </p>
        </div>
        )}

        {imageMode ? null : (
        <>
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
          <legend className="flex flex-wrap items-center gap-2 text-sm font-medium tracking-tight">
            {imageToVideo ? "Image-to-Video" : "Visual engine model"}
            {imageToVideo ? (
              <span className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-2.5 py-1 font-mono text-[11px] tracking-wide text-cyan-100">
                Reference attached
              </span>
            ) : null}
          </legend>
          <div className="grid gap-2.5">
            {engineChoices.map((option) => {
              const selected = engine === option.id;
              const offer = engineOffer(option.id, imageToVideo);
              return (
                <label key={option.id} className={cn("gen-pick", selected && "gen-pick-on")}>
                  <input
                    type="radio"
                    name="visual-engine"
                    value={option.id}
                    checked={selected}
                    onChange={() => {
                      setEngine(option.id);
                      setError((current) => (current?.endsWith("credits.") ? null : current));
                    }}
                    className="sr-only"
                  />
                  <EngineBadge id={option.id} selected={selected} />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium tracking-tight">{offer.name}</span>
                    <span className="mt-1 block font-mono text-[11px] tracking-wide text-accent">
                      {offer.rate}
                    </span>
                    <span className="mt-1 block text-sm leading-6 text-muted">{offer.note}</span>
                  </span>
                </label>
              );
            })}
          </div>
          {runCost > 0 && credits < runCost ? (
            <p role="status" className="gen-alert">
              {engineOffer(engine, imageToVideo).name} costs {runCost} credits.
            </p>
          ) : null}
        </fieldset>
        </>
        )}

        {error ? (
          <p role="alert" className="gen-alert">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={running || referencePreparing || (imageMode ? !imageReady || credits < IMAGE_GENERATION_COST : topic.trim().length < 3 || credits < runCost)}
            className="gen-cta"
          >
            {running ? "Generating…" : imageMode ? "Generate image" : "Generate Video"}
          </button>
          {running ? (
            <button type="button" onClick={stop} className="gen-ghost">
              Stop
            </button>
          ) : null}
          <p className="text-xs text-muted">
            {imageMode
              ? "10 credits per image"
              : referencePreparing
                ? "Preparing the reference image"
                : videoCostLabel}
          </p>
        </div>
      </form>

      {imageMode ? (
        <ImageResultPanel
          running={running}
          source={previewSrc}
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
        />
      ) : (
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
            {result ? `${result.durationSec}s` : "45s"} · 9:16 · no face
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
              <Storyboard
                frames={result.frames}
                script={result.script}
                voiceId={result.voiceId}
                audioSrc={result.audioSrc}
                audioLabel={result.audioLabel}
                durationSec={result.durationSec}
              />
              {chainVideoUrls(result.frames).length > 0 ? (
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => void extendVideo()}
                    disabled={running || credits < EXTEND_VIDEO_COST}
                    className="gen-cta"
                  >
                    Extend Video (+45s)
                  </button>
                  <p className="text-xs text-muted">45 credits</p>
                </div>
              ) : null}
              <h3 className="mt-5 text-sm font-medium tracking-tight">Script</h3>
              <p className="mt-2 text-sm leading-7 text-foreground/90">{result.script}</p>
            </div>
          ) : (
            <PreviewSkeleton running={running} label={activeStep?.label} />
          )}
        </div>
      </section>
      )}
    </div>
  );
}

function ImageResultPanel({
  running,
  source,
  result,
  statusMessage,
  downloadError,
  onChange,
  onRemove,
  onDownload,
}: {
  running: boolean;
  source: string | null;
  result: { id: string; imageUrl: string; prompt: string } | null;
  statusMessage: string;
  downloadError: string | null;
  onChange: () => void;
  onRemove: () => void;
  onDownload: (imageUrl: string) => void;
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
        <p className="rounded-full border border-white/10 px-3 py-1 font-mono text-[11px] text-muted">
          Flux · 10 credits
        </p>
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <figure>
          <figcaption className="mb-2 text-xs uppercase tracking-[0.16em] text-muted">Input</figcaption>
          {source ? (
            <div className="overflow-hidden rounded-2xl bg-black ring-1 ring-white/10">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={source} alt="" className="aspect-square w-full object-contain" />
              <div className="flex gap-2 border-t border-white/10 p-2">
                <button
                  type="button"
                  onClick={onChange}
                  disabled={running}
                  className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-foreground transition hover:border-cyan-300/70 hover:text-cyan-100"
                >
                  Change Image
                </button>
                <button
                  type="button"
                  onClick={onRemove}
                  disabled={running}
                  className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-foreground transition hover:border-cyan-300/70 hover:text-cyan-100"
                >
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <div className="grid aspect-square place-items-center rounded-2xl border border-dashed border-white/15 px-4 text-center text-sm text-muted">
              Upload an image
            </div>
          )}
        </figure>
        <figure>
          <figcaption className="mb-2 text-xs uppercase tracking-[0.16em] text-muted">Output</figcaption>
          <div className="relative aspect-square overflow-hidden rounded-2xl bg-black ring-1 ring-cyan-300/20">
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
                aria-label="Rendering image"
                className="gen-skeleton gen-skeleton-live absolute inset-0 grid place-items-center"
              >
                <span className="grid h-12 w-12 place-items-center rounded-full border border-white/15 bg-black/50 text-cyan-100">
                  <Spinner />
                </span>
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
            Download HD Image
          </button>
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
      {id === "ultra" ? <FilmIcon /> : id === "budget" ? <BoltIcon /> : <LayersIcon />}
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
