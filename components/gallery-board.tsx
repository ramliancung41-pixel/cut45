"use client";

import { useEffect, useState } from "react";
import { useCredits, type ArchiveProject } from "@/components/credit-provider";
import type { SavedGalleryItem } from "@/lib/gallery-store";
import { saveGeneratedFile } from "@/lib/save-media";
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
    engineLabel: "Saved file",
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
  const [downloadError, setDownloadError] = useState<string | null>(null);

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

  if (listed.length === 0) {
    return (
      <p className="gen-glass rounded-3xl px-5 py-8 text-sm leading-6 text-muted">
        Saved images and files land here.
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
            ) : (
              <div className="mb-4 grid aspect-[9/16] w-full place-items-center rounded-2xl bg-zinc-900 text-sm text-muted">
                Saved file
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-line bg-panel px-2.5 py-1 text-xs text-foreground">
                {project.prompt}
              </span>
              <span className="rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 font-mono text-[11px] text-accent">
                {project.kind === "image" ? "Still" : `${project.durationSec}s`}
              </span>
            </div>
            <p className="mt-4 text-sm font-medium">{project.engineLabel}</p>
            <p className="mt-1 text-sm text-muted">{rateLine(project)}</p>
            <div className="mt-5 flex flex-wrap gap-2">
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
    </>
  );
}
