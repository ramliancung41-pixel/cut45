"use client";

import { useState } from "react";

type Line = { speaker: "A" | "B"; text: string; imageIndex: number };
type Clip = Line & { path: string; durationSec: number; audioBase64: string };
type Language = "burmese" | "english";
type Preset = "father-son" | "hosts";

export default function NewsPodcastPage() {
  const [news, setNews] = useState("");
  const [images, setImages] = useState(["", "", ""]);
  const [language, setLanguage] = useState<Language>("english");
  const [preset, setPreset] = useState<Preset>("hosts");
  const [lines, setLines] = useState<Line[]>([]);
  const [clips, setClips] = useState<Clip[]>([]);
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);
  const [voicing, setVoicing] = useState(false);
  const [videoStep, setVideoStep] = useState("");
  const [videoUrl, setVideoUrl] = useState("");

  const imageUrls = images.map((item) => item.trim()).filter((item) => item.startsWith("https://") || item.startsWith("http://"));

  async function writeScript() {
    setRunning(true);
    setError("");
    try {
      const response = await fetch("/api/news-podcast/script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ news, language, preset, imageCount: imageUrls.length }),
      });
      const payload = (await response.json().catch(() => null)) as { lines?: Line[]; error?: string } | null;
      if (!response.ok || !payload?.lines) throw new Error(payload?.error ?? "The script could not be written.");
      setLines(payload.lines);
      setClips([]);
    } catch (caught) {
      setLines([]);
      setClips([]);
      setError(caught instanceof Error ? caught.message : "The script could not be written.");
    } finally {
      setRunning(false);
    }
  }

  async function previewAudio() {
    setVoicing(true);
    setError("");
    try {
      const response = await fetch("/api/news-podcast/audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language, lines }),
      });
      const payload = (await response.json().catch(() => null)) as { clips?: Clip[]; error?: string } | null;
      if (!response.ok || !payload?.clips?.length) throw new Error(payload?.error ?? "The audio preview could not be made.");
      setClips(payload.clips);
    } catch (caught) {
      setClips([]);
      setError(caught instanceof Error ? caught.message : "The audio preview could not be made.");
    } finally {
      setVoicing(false);
    }
  }

  async function generateVideo() {
    setRunning(true);
    setError("");
    setVideoUrl("");
    try {
      setVideoStep("Script");
      const scriptResponse = await fetch("/api/news-podcast/script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ news, language, preset, imageCount: imageUrls.length }),
      });
      const script = (await scriptResponse.json().catch(() => null)) as { lines?: Line[]; error?: string } | null;
      if (!scriptResponse.ok || !script?.lines) throw new Error(script?.error ?? "The script could not be written.");
      setLines(script.lines);

      setVideoStep("Audio");
      const audioResponse = await fetch("/api/news-podcast/audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language, lines: script.lines }),
      });
      const audio = (await audioResponse.json().catch(() => null)) as { jobId?: string; clips?: Clip[]; error?: string } | null;
      if (!audioResponse.ok || !audio?.jobId || !audio.clips?.length) throw new Error(audio?.error ?? "The voices could not be generated.");
      setClips(audio.clips);

      setVideoStep("Lip-sync");
      const lipsyncResponse = await fetch("/api/news-podcast/lipsync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: audio.jobId,
          preset,
          clips: audio.clips.map((clip) => ({
            speaker: clip.speaker,
            audioPath: clip.path,
            durationSec: clip.durationSec,
            imageIndex: clip.imageIndex,
          })),
        }),
      });
      const lipsync = (await lipsyncResponse.json().catch(() => null)) as {
        videos?: Array<{ speaker: "A" | "B"; videoPath: string; audioPath: string; durationSec: number; imageIndex: number }>;
        error?: string;
      } | null;
      if (!lipsyncResponse.ok || !lipsync?.videos?.length) throw new Error(lipsync?.error ?? "The hosts could not be lip-synced.");

      setVideoStep("Render");
      const renderResponse = await fetch("/api/news-podcast/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: audio.jobId,
          title: news.trim().slice(0, 120),
          lines: script.lines,
          imageUrls,
          videos: lipsync.videos,
        }),
      });
      const rendered = (await renderResponse.json().catch(() => null)) as { videoUrl?: string; error?: string } | null;
      if (!renderResponse.ok || !rendered?.videoUrl) throw new Error(rendered?.error ?? "The news video could not be assembled.");
      setVideoUrl(rendered.videoUrl);
      setVideoStep("Done");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The news video could not be assembled.");
    } finally {
      setRunning(false);
    }
  }

  async function playAll() {
    for (const clip of clips) {
      const audio = new Audio(`data:audio/mpeg;base64,${clip.audioBase64}`);
      await audio.play();
      await new Promise<void>((resolve) => {
        audio.onended = () => resolve();
        audio.onerror = () => resolve();
      });
    }
  }

  return (
    <main className="min-h-[100dvh] bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-10">
        <header>
          <p className="text-xs tracking-[0.2em] text-zinc-500 uppercase">Cut45</p>
          <h1 className="mt-2 text-2xl font-semibold">News podcast</h1>
          <p className="mt-1 text-sm text-zinc-400">A 45–60 second conversation for the top news screen.</p>
        </header>

        <label className="flex flex-col gap-2 text-sm">
          News article or topic
          <textarea
            value={news}
            onChange={(event) => setNews(event.target.value)}
            rows={8}
            placeholder="Paste the article or describe the story."
            className="rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm text-zinc-100 outline-none"
          />
        </label>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm">Up to 3 image URLs</legend>
          {images.map((value, index) => (
            <input
              key={index}
              value={value}
              onChange={(event) =>
                setImages((current) => current.map((item, itemIndex) => (itemIndex === index ? event.target.value : item)))
              }
              placeholder={`https:// image ${index + 1}`}
              className="rounded-xl border border-white/10 bg-black px-3 py-2 text-sm outline-none"
            />
          ))}
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-2 text-sm">
            Language
            <select
              value={language}
              onChange={(event) => setLanguage(event.target.value as Language)}
              className="rounded-xl border border-white/10 bg-black px-3 py-2"
            >
              <option value="english">English</option>
              <option value="burmese">Burmese</option>
            </select>
          </label>
          <label className="flex flex-col gap-2 text-sm">
            Character preset
            <select
              value={preset}
              onChange={(event) => setPreset(event.target.value as Preset)}
              className="rounded-xl border border-white/10 bg-black px-3 py-2"
            >
              <option value="father-son">Father & Son</option>
              <option value="hosts">Male & Female Hosts</option>
            </select>
          </label>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            disabled={running || news.trim().length < 8}
            onClick={() => void writeScript()}
            className="h-11 rounded-full border border-white/15 px-5 text-sm font-medium disabled:opacity-40"
          >
            {running && !videoStep ? "Writing script..." : "Write script"}
          </button>
          <button
            type="button"
            disabled={running || news.trim().length < 8}
            onClick={() => void generateVideo()}
            className="h-11 rounded-full bg-white px-5 text-sm font-medium text-black disabled:opacity-40"
          >
            {running && videoStep ? videoStep : "Generate Full News Video"}
          </button>
        </div>
        {videoStep ? (
          <ol className="flex flex-wrap gap-2 text-xs text-zinc-400">
            {["Script", "Audio", "Lip-sync", "Render"].map((item) => (
              <li key={item} className={item === videoStep ? "text-white" : ""}>
                {item}
              </li>
            ))}
          </ol>
        ) : null}
        {videoUrl ? (
          <div className="flex flex-col items-start gap-3">
            <video src={videoUrl} controls playsInline className="aspect-[9/16] w-full max-w-[320px] rounded-2xl bg-black" />
            <a href={videoUrl} download="cut45-news.mp4" className="rounded-full border border-white/15 px-4 py-2 text-sm">
              Download MP4
            </a>
          </div>
        ) : null}
        {lines.length > 0 ? (
          <button
            type="button"
            disabled={voicing}
            onClick={() => void previewAudio()}
            className="h-11 rounded-full border border-white/15 text-sm font-medium disabled:opacity-40"
          >
            {voicing ? "Generating audio..." : "Generate Audio Preview"}
          </button>
        ) : null}
        {error ? <p className="text-sm text-red-300">{error}</p> : null}

        {clips.length > 0 ? (
          <button type="button" onClick={() => void playAll()} className="h-11 rounded-full bg-white text-sm font-medium text-black">
            Play preview
          </button>
        ) : null}

        {lines.length > 0 ? (
          <ol className="flex flex-col gap-3">
            {lines.map((line, index) => (
              <li key={index} className="rounded-2xl border border-white/10 bg-black px-4 py-3">
                <p className="text-xs text-zinc-500">
                  Host {line.speaker}
                  {imageUrls[line.imageIndex] ? ` · image ${line.imageIndex + 1}` : ""}
                </p>
                <p className="mt-1 text-sm leading-6">{line.text}</p>
                {clips[index]?.audioBase64 ? (
                  <audio className="mt-3 w-full" controls src={`data:audio/mpeg;base64,${clips[index].audioBase64}`} />
                ) : null}
              </li>
            ))}
          </ol>
        ) : null}
      </div>
    </main>
  );
}
