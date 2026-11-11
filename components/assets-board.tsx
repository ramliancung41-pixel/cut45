"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { StudioPageHeader } from "@/components/studio-page";
import { stashAgentDraft } from "@/lib/agent-handoff";
import { startAgentSessions, useAgentSessions } from "@/lib/agent-session-store";
import { newAgentSessionId } from "@/lib/agent-sessions";
import { imageThumbnail } from "@/lib/image-thumbnail";
import { prepareReferenceImage } from "@/lib/prepare-reference-image";
import { uploadStore, type UploadedAsset } from "@/lib/studio-prefs";

type AssetKind = "upload" | "reference" | "video" | "image" | "voiceover";

type Asset = {
  id: string;
  kind: AssetKind;
  title: string;
  src: string;
  createdAt: string;
  source: string;
};

type GalleryRow = {
  id: string;
  prompt: string;
  videoUrl: string | null;
  imageUrl: string | null;
  voiceName: string;
  createdAt: string;
};

const FILTERS: Array<{ id: AssetKind | "all"; label: string }> = [
  { id: "all", label: "All" },
  { id: "upload", label: "Uploads" },
  { id: "reference", label: "Reference images" },
  { id: "video", label: "Video clips" },
  { id: "image", label: "Images" },
  { id: "voiceover", label: "Voiceovers" },
];

const KIND_LABEL: Record<AssetKind, string> = {
  upload: "Upload",
  reference: "Reference",
  video: "Video",
  image: "Image",
  voiceover: "Voiceover",
};

function isVisual(kind: AssetKind) {
  return kind !== "video" && kind !== "voiceover";
}

function shortDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function AssetsBoard() {
  const router = useRouter();
  const uploads = uploadStore.useValue();
  const { sessions } = useAgentSessions();
  const [gallery, setGallery] = useState<GalleryRow[]>([]);
  const [galleryReady, setGalleryReady] = useState(false);
  const [filter, setFilter] = useState<AssetKind | "all">("all");
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState<Asset | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    startAgentSessions();
    let ignore = false;
    fetch("/api/gallery")
      .then((response) => response.json())
      .then((payload: { items?: GalleryRow[] }) => {
        if (!ignore) setGallery(Array.isArray(payload.items) ? payload.items : []);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!ignore) setGalleryReady(true);
      });
    return () => {
      ignore = true;
    };
  }, []);

  const assets = useMemo(() => {
    const seen = new Set<string>();
    const list: Asset[] = [];
    const push = (asset: Asset) => {
      if (!asset.src || seen.has(asset.src)) return;
      seen.add(asset.src);
      list.push(asset);
    };
    for (const upload of uploads) {
      push({ id: upload.id, kind: "upload", title: upload.name, src: upload.src, createdAt: upload.createdAt, source: "Uploaded" });
    }
    for (const session of sessions) {
      for (const message of session.messages) {
        if (message.role === "user" && message.image) {
          push({
            id: `${session.id}-${message.id}`,
            kind: "reference",
            title: message.text || session.title,
            src: message.image,
            createdAt: session.updatedAt,
            source: `Agent · ${session.title}`,
          });
        }
      }
      for (const generation of session.generations) {
        if (generation.status !== "done" || !generation.url) continue;
        const kind: AssetKind =
          generation.kind === "image" ? "image" : generation.voiceEmbedded ? "voiceover" : "video";
        push({
          id: generation.id,
          kind,
          title: generation.title || generation.prompt,
          src: generation.url,
          createdAt: session.updatedAt,
          source: `Agent · ${generation.modelName}`,
        });
      }
    }
    for (const row of gallery) {
      const src = row.videoUrl || row.imageUrl || "";
      push({
        id: row.id,
        kind: row.videoUrl ? "video" : "image",
        title: row.prompt || "Gallery render",
        src,
        createdAt: row.createdAt,
        source: row.videoUrl ? `Gallery · ${row.voiceName || "Video"}` : "Gallery",
      });
    }
    return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [uploads, sessions, gallery]);

  const counts = useMemo(() => {
    const result: Record<string, number> = { all: assets.length };
    for (const asset of assets) result[asset.kind] = (result[asset.kind] ?? 0) + 1;
    return result;
  }, [assets]);

  const term = query.trim().toLowerCase();
  const visible = assets.filter(
    (asset) =>
      (filter === "all" || asset.kind === filter) &&
      (!term || asset.title.toLowerCase().includes(term) || asset.source.toLowerCase().includes(term)),
  );

  async function addFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    const added: UploadedAsset[] = [];
    for (const file of Array.from(files).slice(0, 8)) {
      try {
        const prepared = await prepareReferenceImage(file);
        const src = await imageThumbnail(prepared, 768, 0.8);
        if (src) {
          added.push({
            id: `up_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
            name: file.name.replace(/\.[^.]+$/, "").slice(0, 60) || "Upload",
            src,
            createdAt: new Date().toISOString(),
          });
        }
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Could not add that file.");
      }
    }
    if (added.length > 0) uploadStore.set((current) => [...added, ...current].slice(0, 40));
    setUploading(false);
  }

  function removeUpload(id: string) {
    uploadStore.set((current) => current.filter((item) => item.id !== id));
    setPreview(null);
  }

  function sendToAgent(asset: Asset) {
    const sessionId = newAgentSessionId();
    stashAgentDraft(
      isVisual(asset.kind) && asset.src.startsWith("data:")
        ? {
            sessionId,
            message: "Use this image as a reference. Describe it, then suggest an image prompt and a short video built on it.",
            image: asset.src,
          }
        : {
            sessionId,
            message: `Help me build on this ${KIND_LABEL[asset.kind].toLowerCase()}: "${asset.title}". Suggest a follow-up shot to generate next.`,
          },
    );
    router.push(`/builder?chat=${sessionId}`);
  }

  return (
    <div className="flex flex-col gap-6">
      <StudioPageHeader
        eyebrow="Assets"
        title="Media library"
        description="Every upload, reference image, generated clip, image, and voiced video in one vault. Filter, preview, download, or send any asset back to the Agent."
        action={
          <>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="rounded-full bg-white px-4 py-2 text-xs font-semibold text-black transition hover:bg-white/90 disabled:opacity-60"
            >
              {uploading ? "Adding…" : "Upload images"}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="sr-only"
              tabIndex={-1}
              onChange={(event) => {
                void addFiles(event.target.files);
                event.target.value = "";
              }}
            />
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Asset type">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={filter === item.id}
              onClick={() => setFilter(item.id)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                filter === item.id
                  ? "border-white bg-white text-black"
                  : "border-white/10 bg-white/[0.04] text-zinc-300 hover:border-white/20 hover:text-white"
              }`}
            >
              {item.label}
              <span className="ml-1.5 tabular-nums opacity-60">{counts[item.id] ?? 0}</span>
            </button>
          ))}
        </div>
        <label htmlFor="asset-search" className="sr-only">
          Search assets
        </label>
        <input
          id="asset-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search assets"
          className="ml-auto w-full rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-white/25 sm:w-56"
        />
      </div>

      {error ? <p className="text-sm text-red-300">{error}</p> : null}

      {visible.length === 0 ? (
        <div className="agent-glass rounded-2xl px-6 py-14 text-center">
          <p className="text-sm font-medium text-white">{galleryReady ? "No assets here yet" : "Loading your library…"}</p>
          <p className="mt-1 text-xs text-zinc-400">
            Upload images, or save them from the builder and they will appear here.
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {visible.map((asset) => (
            <li key={asset.id}>
              <button
                type="button"
                onClick={() => setPreview(asset)}
                className="group block w-full overflow-hidden rounded-2xl border border-white/[0.08] bg-zinc-950 text-left transition hover:border-white/25 hover:shadow-[0_12px_32px_rgba(124,58,237,0.18)]"
              >
                <span className="relative block aspect-square overflow-hidden">
                  {isVisual(asset.kind) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={asset.src} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                  ) : (
                    <span className="grid h-full w-full place-items-center bg-zinc-900 text-xs text-zinc-400">
                      {KIND_LABEL[asset.kind]}
                    </span>
                  )}
                  <span className="absolute top-2 left-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur">
                    {KIND_LABEL[asset.kind]}
                  </span>
                </span>
                <span className="block px-3 py-2.5">
                  <span className="block truncate text-xs font-medium text-white">{asset.title}</span>
                  <span className="mt-0.5 block truncate text-[11px] text-zinc-500">
                    {asset.source} · {shortDate(asset.createdAt)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {preview ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={preview.title}>
          <button type="button" aria-label="Close preview" className="absolute inset-0 bg-black/75 backdrop-blur" onClick={() => setPreview(null)} />
          <div className="agent-glass relative flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl">
            <div className="flex min-h-0 flex-1 items-center justify-center bg-black">
              {isVisual(preview.kind) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview.src} alt={preview.title} className="max-h-[64dvh] w-auto object-contain" />
              ) : (
                <div className="grid h-48 w-full place-items-center text-sm text-zinc-400">{KIND_LABEL[preview.kind]}</div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 p-4">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">{preview.title}</p>
                <p className="truncate text-xs text-zinc-400">
                  {KIND_LABEL[preview.kind]} · {preview.source}
                </p>
              </div>
              <button
                type="button"
                onClick={() => sendToAgent(preview)}
                className="rounded-full bg-white px-3.5 py-1.5 text-xs font-semibold text-black hover:bg-white/90"
              >
                Use in Agent
              </button>
              <a
                href={preview.src}
                download={`${preview.title.slice(0, 40) || "asset"}`}
                target={preview.src.startsWith("data:") ? undefined : "_blank"}
                rel="noreferrer"
                className="rounded-full border border-white/15 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-white/10"
              >
                Download
              </a>
              {preview.kind === "upload" ? (
                <button
                  type="button"
                  onClick={() => removeUpload(preview.id)}
                  className="rounded-full border border-red-400/30 px-3.5 py-1.5 text-xs font-medium text-red-300 hover:bg-red-400/10"
                >
                  Delete
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setPreview(null)}
                className="rounded-full px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-white"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
