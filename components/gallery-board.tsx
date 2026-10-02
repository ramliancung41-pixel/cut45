"use client";

import { useRef, useState } from "react";
import { useCredits, type ArchiveProject } from "@/components/credit-provider";
import { speakNarration, stopNarration } from "@/lib/browser-speech";
import { isVoiceId } from "@/lib/voices";

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

async function downloadProject(project: ArchiveProject) {
  const filename = project.id;
  if (project.audioSrc) {
    const response = await fetch(project.audioSrc);
    const blob = await response.blob();
    downloadBlob(blob, `${filename}.mp3`);
    return;
  }
  downloadBlob(new Blob([project.script], { type: "text/plain;charset=utf-8" }), `${filename}.txt`);
}

export function GalleryBoard() {
  const { projects } = useCredits();
  const [playing, setPlaying] = useState<ArchiveProject | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const trackRef = useRef<HTMLAudioElement | null>(null);
  const playIdRef = useRef(0);

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
    if (!isVoiceId(project.voiceId)) return;
    speakNarration(project.script, project.voiceId, { onEnd: finish });
  }

  if (projects.length === 0) {
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
        {projects.map((project) => (
          <li key={project.id} className="gen-glass flex flex-col rounded-3xl p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-white/10 bg-black/30 px-2.5 py-1 text-xs text-foreground">
                {project.prompt}
              </span>
              <span className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-2.5 py-1 font-mono text-[11px] text-cyan-100">
                {project.durationSec}s
              </span>
            </div>
            <p className="mt-4 text-sm font-medium">{project.engineLabel}</p>
            <p className="mt-1 text-sm text-muted">
              {project.engine === "ultra"
                ? "Ultra cinematic · 180 credits"
                : project.engine === "budget"
                  ? "Budget AI · 45 credits"
                  : "Free stock · 0 credits"}
              {" · "}
              {project.voiceName}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => replay(project)}
                className="gen-cta"
              >
                Replay audio
              </button>
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
                Download
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
            <button
              type="button"
              onClick={stopPlayback}
              className="gen-ghost mt-5"
            >
              Stop
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
