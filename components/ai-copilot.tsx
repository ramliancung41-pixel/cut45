"use client";

import { useState } from "react";
import { builderAssistantFallback } from "@/lib/builder-assistant";

type ChatMessage = { role: "user" | "assistant"; text: string };

const STARTERS = ["How do I edit a section?", "How do I export the code?", "What do the packages cost?", "How do I publish a domain?"];

export function AiCopilot({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);

  async function send(text: string) {
    const prompt = text.trim();
    if (!prompt || pending) return;
    const nextMessages = [...messages, { role: "user" as const, text: prompt }];
    setMessages(nextMessages);
    setDraft("");
    setPending(true);
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch("/api/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          kind: "agent",
          prompt,
          messages: nextMessages.slice(-8).map((item) => ({ role: item.role, text: item.text })),
        }),
      });
      const body = (await response.json().catch(() => null)) as { reply?: string } | null;
      const reply = body?.reply?.trim() || builderAssistantFallback(prompt);
      setMessages((current) => [...current, { role: "assistant", text: reply }]);
    } catch {
      setMessages((current) => [...current, { role: "assistant", text: builderAssistantFallback(prompt) }]);
    } finally {
      window.clearTimeout(timer);
      setPending(false);
    }
  }

  if (!open) return null;

  return (
    <section
      aria-label="AI Co-Pilot"
      className="fixed inset-x-3 bottom-20 z-[60] flex max-h-[min(32rem,calc(100dvh-6rem))] flex-col overflow-hidden rounded-3xl border border-white/10 bg-zinc-950 text-white shadow-2xl min-[700px]:inset-x-auto min-[700px]:right-4 min-[700px]:bottom-4 min-[700px]:w-[22rem]"
    >
      <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
        <h2 className="text-sm font-medium">AI Co-Pilot</h2>
        <button type="button" onClick={onClose} className="ml-auto text-xs text-white/60 hover:text-white">
          Close
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div>
            <p className="text-sm leading-6 text-white/70">
              Ask about editing templates, exporting HTML and React, agency packages, or publishing a custom domain.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {STARTERS.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => void send(item)}
                  className="rounded-full border border-white/15 px-3 py-1.5 text-left text-xs text-white/80 hover:text-white"
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((item, index) => (
            <p
              key={`${item.role}-${index}`}
              className={`whitespace-pre-wrap text-sm leading-6 ${item.role === "user" ? "text-white" : "text-white/75"}`}
            >
              {item.text}
            </p>
          ))
        )}
        {pending ? <p className="text-xs text-white/50">Writing a reply</p> : null}
      </div>
      <form
        className="flex gap-2 border-t border-white/10 p-3"
        onSubmit={(event) => {
          event.preventDefault();
          void send(draft);
        }}
      >
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Ask the co-pilot"
          aria-label="Message"
          className="min-w-0 flex-1 rounded-full border border-white/15 bg-black px-3 py-2 text-sm outline-none"
        />
        <button
          type="submit"
          disabled={pending || !draft.trim()}
          className="rounded-full bg-white px-3 py-2 text-xs font-medium text-black disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </section>
  );
}
