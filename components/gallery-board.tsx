"use client";

import { useEffect, useRef, useState } from "react";
import { useCredits, type ArchiveProject } from "@/components/credit-provider";
import { speakNarration, stopNarration } from "@/lib/browser-speech";
import type { SavedGalleryItem } from "@/lib/gallery-store";
import { saveGeneratedFile } from "@/lib/save-media";
import { resolveVoiceId } from "@/lib/voices";
import type { VisualEngineId } from "@/lib/visual-engines";

async function downloadProject(project: ArchiveProject) {
  if (project.imageSrc) {
    await saveGeneratedFile(project.imageSrc, `${project.id}.png`);
    return;
  }
  if (project.videoSrc) {
    await saveGeneratedFile(project.videoSrc, `${project.id}.mp4`);
    return;
  }
  const blob = new Blob([project.script], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${project.id}.txt`;
  link.click();
  URL.revokeObjectURL(url);
}

function fromSaved(item: SavedGalleryItem): ArchiveProject {
  if (item.engine === "image" || item.imageUrl) {
    return {
      id: item.id,
      prompt: item.prompt,
      durationSec: 0,
      engine: "image",
      engineLabel: "Image-to-Image / Avatar Studio",
      voiceName: item.voiceName,
      voiceId: "",
      script: item.script,
      imageSrc: item.imageUrl ?? undefined,
      kind: "image",
      creditsCharged: item.credits,
      createdAt: item.createdAt,
    };
  }
  const engine: VisualEngineId = item.engine;
  return {
    id: item.id,
    prompt: item.prompt,
    durationSec: 45,
    engine,
    engineLabel:
      engine === "ultra" ? "Ultra Cinematic AI" : "Budget AI Motion (Fal.ai Image-to-Video)",
    voiceName: item.voiceName,
    voiceId: "",
    script: item.script,
    videoSrc: item.videoUrl ?? undefined,
    creditsCharged: item.credits,
    createdAt: item.createdAt,
  };
}

function rateLine(project: ArchiveProject) {
  if (typeof project.creditsCharged === "number") {
    return `${project.creditsCharged} credits`;
  }
  if (project.engine === "ultra") return "180 credits";
  if (project.engine === "budget") return "10 credits";
  return "0 credits";
}

export function GalleryBoard() {
  const { projects } = useCredits();
  const [saved, setSaved] = useState<ArchiveProject[]>([]);
  const [playing, setPlaying] = useState<ArchiveProject | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const trackRef = useRef<HTMLAudioElement | null>(null);
  const playIdRef = useRef(0);

  useEffect(() => {
    let ignore = false;
    void fetch("/api/gallery")
      .then((response) => response.json())
      .then((payload: { items?: SavedGalleryItem[] }) => {
        if (ignore || !Array.isArray(payload.items)) return;
        setSaved(payload.items.map(fromSaved));
      })
      .catch(() => undefined);
    return () => {
      ignore = true;
    };
  }, [projects.length]);

  const listed = [
    ...projects,
    ...saved.filter((item) => !projects.some((project) => project.id === item.id)),
  ];

  function stopPlayback() {
    playIdRef.current += 1;
    stopNarration();
    trackRef.current?.pause();
    trackRef.current = null;
    setPlaying(null);
  }

  function replay(project: ArchiveProject) {
    playIdRef.current += 1;
    const playId = playIdRef.current;
    stopNarration();
    trackRef.current?.pause();
    trackRef.current = null;
    setPlaying(project);

    const finish = () => {
      if (playIdRef.current === playId) setPlaying(null);
    };

    if (project.audioSrc) {
      const track = new Audio(project.audioSrc);
      trackRef.current = track;
      track.onended = finish;
      track.onerror = finish;
      void track.play();
      return;
    }
    const voiceId = resolveVoiceId(project.voiceId);
    if (!voiceId) {
      finish();
      return;
    }
    speakNarration(project.script, voiceId, { onEnd: finish });
  }

  if (listed.length === 0) {
    return (
      <p className="gen-glass rounded-3xl px-5 py-8 text-sm leading-6 text-muted">
        Finished previews land here. Generate one from AI Generator and it keeps its prompt,
        length, and engine.
      </p>
    );
  }

  return (
    <>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {listed.map((project) => (
          <li key={project.id} className="gen-glass flex flex-col rounded-3xl p-4">
            {project.imageSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={project.imageSrc}
                alt={project.prompt}
                className="mb-4 aspect-square w-full rounded-2xl object-cover"
              />
            ) : project.videoSrc ? (
              <video
                src={project.videoSrc}
                muted
                playsInline
                controls
                className="mb-4 aspect-[9/16] w-full rounded-2xl bg-black object-cover"
              />
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-line bg-panel px-2.5 py-1 text-xs text-foreground">
                {project.prompt}
              </span>
              <span className="rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 font-mono text-[11px] text-accent">
                {project.kind === "image" ? "Still" : `${project.durationSec}s`}
              </span>
            </div>
            <p className="mt-4 text-sm font-medium">{project.engineLabel}</p>
            <p className="mt-1 text-sm text-muted">
              {rateLine(project)}
              {" · "}
              {project.voiceName}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {project.kind === "image" ? null : (
              <button type="button" onClick={() => replay(project)} className="gen-cta">
                Replay audio
              </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setDownloadError(null);
                  void downloadProject(project).catch(() => {
                    setDownloadError("Could not download that project.");
                  });
                }}
                className="gen-ghost"
              >
                Download / Save
              </button>
            </div>
          </li>
        ))}
      </ul>
      {downloadError ? (
        <p role="alert" className="gen-alert mt-4">
          {downloadError}
        </p>
      ) : null}
      {playing ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/70 p-4 sm:items-center">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="replay-title"
            className="gen-glass w-full max-w-md rounded-3xl p-5"
          >
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent">
              Playing
            </p>
            <h2 id="replay-title" className="mt-2 text-lg font-semibold tracking-tight">
              {playing.prompt}
            </h2>
            <p className="mt-2 text-sm text-muted">
              {playing.durationSec}s · {playing.engineLabel}
            </p>
            <button type="button" onClick={stopPlayback} className="gen-ghost mt-5">
              Stop
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
