"use client";

import { useState } from "react";

type Line = { speaker: "A" | "B"; text: string; imageIndex: number };
type Language = "burmese" | "english";
type Preset = "father-son" | "hosts";

export default function NewsPodcastPage() {
  const [news, setNews] = useState("");
  const [images, setImages] = useState(["", "", ""]);
  const [language, setLanguage] = useState<Language>("english");
  const [preset, setPreset] = useState<Preset>("hosts");
  const [lines, setLines] = useState<Line[]>([]);
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);

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
    } catch (caught) {
      setLines([]);
      setError(caught instanceof Error ? caught.message : "The script could not be written.");
    } finally {
      setRunning(false);
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

        <button
          type="button"
          disabled={running || news.trim().length < 8}
          onClick={() => void writeScript()}
          className="h-11 rounded-full bg-white text-sm font-medium text-black disabled:opacity-40"
        >
          {running ? "Writing script..." : "Write script"}
        </button>
        {error ? <p className="text-sm text-red-300">{error}</p> : null}

        {lines.length > 0 ? (
          <ol className="flex flex-col gap-3">
            {lines.map((line, index) => (
              <li key={index} className="rounded-2xl border border-white/10 bg-black px-4 py-3">
                <p className="text-xs text-zinc-500">
                  Host {line.speaker}
                  {imageUrls[line.imageIndex] ? ` · image ${line.imageIndex + 1}` : ""}
                </p>
                <p className="mt-1 text-sm leading-6">{line.text}</p>
              </li>
            ))}
          </ol>
        ) : null}
      </div>
    </main>
  );
}
