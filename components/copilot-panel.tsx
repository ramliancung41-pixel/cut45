"use client";

import { useState } from "react";
import type { MovieScene } from "@/lib/scenes";

type ChatMessage = { role: "user" | "assistant"; text: string };

export function CopilotPanel({
  open,
  topic,
  scenes,
  sceneCount,
  busy,
  onClose,
  onScenes,
}: {
  open: boolean;
  topic: string;
  scenes: MovieScene[];
  sceneCount: number;
  busy: boolean;
  onClose: () => void;
  onScenes: (scenes: MovieScene[], reply: string) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function submitChat(text: string) {
    const trimmed = text.trim();
    if (trimmed.length < 1 || pending) return;
    void send("chat", trimmed);
  }

  async function send(kind: "plan" | "chat", text?: string) {
    if (pending) return;
    const chatText = (text ?? "").trim();
    const topicText = topic.trim();
    const prompt = chatText || topicText;
    if (kind === "chat" && chatText.length < 1) return;
    if (kind === "plan" && topicText.length < 3 && chatText.length < 3) {
      setError("Type what the short is about, then plan the scenes.");
      return;
    }
    const nextMessages =
      kind === "chat"
        ? [...messages, { role: "user" as const, text: chatText }]
        : messages;
    if (kind === "chat") {
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
          topic: topicText,
          prompt,
          messages: nextMessages,
          scenes,
          sceneCount,
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        reply?: string;
        scenes?: MovieScene[];
        error?: string;
      } | null;
      if (!response.ok || !payload?.reply) {
        throw new Error(payload?.error ?? "The co-pilot could not answer.");
      }
      setMessages((current) => [...current, { role: "assistant", text: payload.reply as string }]);
      if (payload.scenes && payload.scenes.length > 0) onScenes(payload.scenes, payload.reply);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The co-pilot could not answer.");
    } finally {
      setPending(false);
    }
  }

  if (!open) return null;

  return (
    <aside className="fixed inset-x-0 bottom-0 top-14 z-40 flex flex-col overflow-hidden border-white/10 bg-[#12100e]/98 md:inset-y-0 md:left-auto md:top-0 md:w-full md:max-w-md md:border-l">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div className="min-w-0">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent">Co-Pilot · Free</p>
          <h2 className="mt-1 truncate text-base font-semibold tracking-tight">Script & scene chat</h2>
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/15 text-sm"
        >
          X
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <p className="text-sm leading-6 text-muted">
            Chat is free. Refine the story and storyboard here. Credits are used only when an image
            or video is rendered.
          </p>
        ) : null}
        {messages.map((message, index) => (
          <p
            key={`${message.role}-${index}`}
            className={
              message.role === "user"
                ? "ml-8 rounded-2xl bg-white/10 px-3 py-2 text-sm leading-6"
                : "mr-6 rounded-2xl bg-black/30 px-3 py-2 text-sm leading-6 text-foreground/90"
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
              </li>
            ))}
          </ol>
        ) : null}
        {error ? <p className="gen-alert">{error}</p> : null}
      </div>
      <form
        className="border-t border-white/10 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        onSubmit={(event) => {
          event.preventDefault();
          submitChat(draft);
        }}
      >
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
            event.preventDefault();
            submitChat(draft);
          }}
          rows={3}
          enterKeyHint="send"
          placeholder="Type an idea. Enter sends, Shift+Enter adds a line."
          className="gen-field w-full resize-none rounded-2xl px-3 py-2 text-sm leading-6 outline-none"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="submit" disabled={pending || draft.trim().length < 1} className="gen-cta">
            {pending ? "Thinking…" : "Send"}
          </button>
          <button
            type="button"
            disabled={pending || busy || (topic.trim().length < 3 && draft.trim().length < 3)}
            onClick={() => void send("plan", draft)}
            className="gen-ghost"
          >
            Plan scenes
          </button>
        </div>
        <p className="mt-2 text-xs text-muted">Free with Gemini. No credits for chat or scene plans.</p>
      </form>
    </aside>
  );
}
