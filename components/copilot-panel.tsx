"use client";

import { useState } from "react";
import type { MovieScene } from "@/lib/scenes";

type ChatMessage = { role: "user" | "assistant"; text: string };

export function CopilotPanel({
  open,
  topic,
  scenes,
  busy,
  onClose,
  onScenes,
}: {
  open: boolean;
  topic: string;
  scenes: MovieScene[];
  busy: boolean;
  onClose: () => void;
  onScenes: (scenes: MovieScene[], reply: string) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(kind: "plan" | "chat", text?: string) {
    const trimmed = topic.trim();
    if (trimmed.length < 3 || pending || busy) return;
    const nextMessages =
      kind === "chat" && text
        ? [...messages, { role: "user" as const, text }]
        : messages;
    if (kind === "chat" && text) {
      setMessages(nextMessages);
      setDraft("");
    }
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          topic: trimmed,
          messages: nextMessages,
          scenes,
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        reply?: string;
        scenes?: MovieScene[];
        error?: string;
      } | null;
      if (!response.ok || !payload?.reply || !payload.scenes) {
        throw new Error(payload?.error ?? "The co-pilot could not answer.");
      }
      setMessages((current) => [...current, { role: "assistant", text: payload.reply as string }]);
      onScenes(payload.scenes, payload.reply);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The co-pilot could not answer.");
    } finally {
      setPending(false);
    }
  }

  if (!open) return null;

  return (
    <aside className="fixed top-16 right-0 bottom-0 z-40 flex w-full max-w-md flex-col border-l border-white/10 bg-[#12100e]/95 shadow-[-24px_0_80px_rgba(0,0,0,0.45)] backdrop-blur-xl">
      <div className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent">Co-Pilot</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight">AI Script & Scene Co-Pilot</h2>
        </div>
        <button type="button" onClick={onClose} className="gen-ghost shrink-0">
          Close
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
        {messages.length === 0 ? (
          <p className="text-sm leading-6 text-muted">
            Brainstorm the story, then turn it into three scenes that share one look. Each scene
            carries the last frame into the next.
          </p>
        ) : null}
        {messages.map((message, index) => (
          <p
            key={`${message.role}-${index}`}
            className={
              message.role === "user"
                ? "ml-8 rounded-2xl bg-white/5 px-3 py-2 text-sm leading-6"
                : "mr-6 text-sm leading-6 text-foreground/90"
            }
          >
            {message.text}
          </p>
        ))}
        {scenes.length > 0 ? (
          <ol className="space-y-3">
            {scenes.map((scene, index) => (
              <li key={`${scene.title}-${index}`} className="rounded-2xl border border-white/10 bg-black/30 p-3">
                <p className="font-mono text-[11px] text-accent">Scene {index + 1}</p>
                <p className="mt-1 text-sm font-medium">{scene.title}</p>
                <p className="mt-2 text-sm leading-6 text-muted">{scene.narration}</p>
                <p className="mt-2 text-xs leading-5 text-foreground/80">{scene.visualPrompt}</p>
                <p className="mt-2 text-xs text-accent/90">{scene.referenceNote}</p>
              </li>
            ))}
          </ol>
        ) : null}
        {error ? <p className="gen-alert">{error}</p> : null}
      </div>
      <form
        className="border-t border-white/10 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          const text = draft.trim();
          if (text.length < 2) return;
          void send("chat", text);
        }}
      >
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={3}
          placeholder="Ask for a colder ending, or a different character look"
          className="gen-field w-full resize-none rounded-2xl px-3 py-2 text-sm leading-6 outline-none"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="submit" disabled={pending || busy || draft.trim().length < 2} className="gen-cta">
            {pending ? "Thinking…" : "Send"}
          </button>
          <button
            type="button"
            disabled={pending || busy || topic.trim().length < 3}
            onClick={() => void send("plan")}
            className="gen-ghost"
          >
            Plan scenes
          </button>
        </div>
      </form>
    </aside>
  );
}
