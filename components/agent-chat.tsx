"use client";

import { useEffect, useRef, useState } from "react";
import {
  suggestionCreditCost,
  suggestionHasVoice,
  suggestionModelName,
  suggestionResolution,
  type AgentSuggestion,
} from "@/lib/agent-suggestion";
import type { AgentMessage } from "@/lib/agent-sessions";
import { pluginStore } from "@/lib/studio-prefs";
import { imageStyleName } from "@/lib/image-styles";
import { videoResolutionLabel } from "@/lib/video-models";
import { SaveCharacterButton } from "@/components/save-character-button";

export type CardStatus = "idle" | "running" | "done" | "error";

const STARTERS = [
  "Enhance this prompt: a samurai walking through neon rain",
  "Give me 3 short video concepts for a coffee brand",
  "Make an image of a cozy cabin in a snowy forest at dusk",
  "What makes a strong AI video prompt?",
];

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function AgentChatPanel({
  messages,
  sending,
  attachment,
  attachmentPending,
  credits,
  balanceReady,
  cardStatus,
  latestMediaUrl,
  onSend,
  onAttach,
  onClearAttachment,
  onGenerate,
  onContinue,
  onUpgrade,
  onNewChat,
}: {
  messages: AgentMessage[];
  sending: boolean;
  attachment: string | null;
  attachmentPending: boolean;
  credits: number;
  balanceReady: boolean;
  cardStatus: (messageId: string) => CardStatus;
  latestMediaUrl?: (messageId: string) => string;
  onSend: (text: string) => boolean;
  onAttach: (file: File) => void;
  onClearAttachment: () => void;
  onGenerate: (message: AgentMessage) => void;
  onContinue: (message: AgentMessage) => void;
  onUpgrade: () => void;
  onNewChat: () => void;
}) {
  const [input, setInput] = useState("");
  const plugins = pluginStore.useValue();
  const [dragging, setDragging] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages.length, sending]);

  function submit(text = input) {
    if (onSend(text)) {
      setInput("");
      if (inputRef.current) inputRef.current.style.height = "";
    }
  }

  const canSend = !sending && !attachmentPending && (input.trim().length > 0 || Boolean(attachment));

  return (
    <aside
      aria-label="Co-Pilot chat"
      className={cn(
        "relative flex h-[78dvh] min-h-0 flex-col border-t border-white/[0.08] bg-zinc-950/70 backdrop-blur-xl lg:sticky lg:top-0 lg:h-[100dvh] lg:w-[420px] lg:shrink-0 lg:border-t-0 lg:border-l",
        dragging && "ring-2 ring-inset ring-violet-400",
      )}
      onDragOver={(event) => {
        if (!Array.from(event.dataTransfer.types).includes("Files")) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        const file = Array.from(event.dataTransfer.files).find((item) => item.type.startsWith("image/"));
        if (file) onAttach(file);
      }}
    >
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-line px-4">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-violet-600 text-white">
            <SparkGlyph className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold tracking-tight">Co-Pilot</p>
            <p className="truncate text-[11px] text-muted">Powered by Gemini</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onNewChat}
          disabled={sending}
          className="home-chip"
          title="Start a new chat"
        >
          <Glyph className="h-3.5 w-3.5">
            <path d="M10 4.5v11M4.5 10h11" />
          </Glyph>
          New chat
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
        {messages.length === 0 ? (
          <div className="flex min-h-full flex-col justify-end gap-4">
            <div>
              <p className="text-lg font-semibold tracking-tight">How can I help you create?</p>
              <p className="mt-1 text-sm leading-6 text-muted">
                Ask anything, polish a prompt, plan a short video, or attach an image for ideas.
              </p>
            </div>
            <div className="grid gap-2">
              {STARTERS.map((starter) => (
                <button
                  key={starter}
                  type="button"
                  onClick={() => submit(starter)}
                  disabled={sending}
                  className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-left text-sm leading-5 text-zinc-200 transition hover:border-white/15 hover:bg-white/[0.07] disabled:opacity-50"
                >
                  {starter}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <ol className="flex flex-col gap-5">
            {messages.map((message) =>
              message.role === "user" ? (
                <li key={message.id} className="flex flex-col items-end gap-1.5">
                  {message.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={message.image}
                      alt="Attached"
                      className="max-h-48 max-w-[75%] rounded-2xl border border-line object-cover"
                    />
                  ) : null}
                  {message.text ? (
                    <p className="max-w-[85%] rounded-2xl rounded-br-md border border-white/[0.08] bg-white/[0.08] px-3.5 py-2.5 text-sm leading-6 whitespace-pre-wrap break-words text-zinc-50">
                      {message.text}
                    </p>
                  ) : null}
                </li>
              ) : (
                <li key={message.id} className="flex flex-col gap-2.5">
                  {message.reasoning ? <Reasoning text={message.reasoning} /> : null}
                  <p
                    className={cn(
                      "text-sm leading-6 whitespace-pre-wrap break-words",
                      message.failed ? "text-red-300" : "text-zinc-200",
                    )}
                  >
                    {message.text}
                  </p>
                  {message.suggestion ? (
                    <GenerationCard
                      suggestion={message.suggestion}
                      status={cardStatus(message.id)}
                      withVoice={suggestionHasVoice(message.suggestion, plugins.voiceover)}
                      short={balanceReady && credits < suggestionCreditCost(message.suggestion, plugins.voiceover)}
                      onGenerate={() => onGenerate(message)}
                      onContinue={() => onContinue(message)}
                      saveUrl={latestMediaUrl?.(message.id)}
                      onUpgrade={onUpgrade}
                    />
                  ) : null}
                </li>
              ),
            )}
            {sending ? (
              <li className="flex items-center gap-2 text-sm text-muted" role="status">
                <Spinner light />
                Reasoning…
              </li>
            ) : null}
          </ol>
        )}
        <div ref={endRef} />
      </div>

      <div className="shrink-0 px-3 pb-3">
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] shadow-[0_10px_30px_rgba(0,0,0,0.35)] transition focus-within:border-white/20">
          {attachment || attachmentPending ? (
            <div className="flex items-center gap-2 px-3 pt-3">
              {attachment ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={attachment} alt="Attachment" className="h-12 w-12 rounded-lg object-cover ring-1 ring-white/10" />
              ) : (
                <span className="grid h-12 w-12 place-items-center rounded-lg bg-panel">
                  <Spinner light />
                </span>
              )}
              <span className="min-w-0 flex-1 truncate text-xs text-muted">
                {attachment ? "Image attached" : "Preparing image…"}
              </span>
              <button type="button" onClick={onClearAttachment} className="home-chip" aria-label="Remove image">
                Remove
              </button>
            </div>
          ) : null}
          <label htmlFor="agent-message" className="sr-only">
            Send a message
          </label>
          <textarea
            id="agent-message"
            ref={inputRef}
            rows={1}
            value={input}
            placeholder="Send a message..."
            onChange={(event) => setInput(event.target.value)}
            onInput={(event) => {
              const el = event.currentTarget;
              el.style.height = "auto";
              el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                if (canSend) submit();
              }
            }}
            onPaste={(event) => {
              const file = Array.from(event.clipboardData.files).find((item) => item.type.startsWith("image/"));
              if (!file) return;
              event.preventDefault();
              onAttach(file);
            }}
            className="block max-h-40 w-full resize-none bg-transparent px-3.5 pt-3 pb-1 text-sm leading-6 outline-none placeholder:text-muted"
          />
          <div className="flex items-center justify-between px-2 pb-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={sending}
              aria-label="Attach an image"
              title="Attach an image"
              className="grid h-8 w-8 place-items-center rounded-full text-muted transition hover:bg-panel hover:text-foreground disabled:opacity-40"
            >
              <Glyph>
                <path d="m15.5 9.5-5.6 5.6a3.5 3.5 0 0 1-5-5l6-6a2.3 2.3 0 0 1 3.3 3.3l-6 6a1.2 1.2 0 0 1-1.7-1.7l5.5-5.5" />
              </Glyph>
            </button>
            <button
              type="button"
              onClick={() => submit()}
              disabled={!canSend}
              aria-label="Send message"
              className="grid h-8 w-8 place-items-center rounded-full bg-white text-black transition hover:bg-white/90 disabled:opacity-25"
            >
              <Glyph>
                <path d="M10 16V4M5 9l5-5 5 5" />
              </Glyph>
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            tabIndex={-1}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) onAttach(file);
            }}
          />
        </div>
      </div>
    </aside>
  );
}

function Reasoning({ text }: { text: string }) {
  return (
    <details className="group rounded-xl border border-line bg-panel/60 px-3 py-2">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-medium text-muted select-none [&::-webkit-details-marker]:hidden">
        <SparkGlyph className="h-3 w-3 text-violet-600" />
        Reasoning
        <Glyph className="ml-auto h-3.5 w-3.5 transition group-open:rotate-180">
          <path d="m6 8 4 4 4-4" />
        </Glyph>
      </summary>
      <p className="mt-2 max-h-56 overflow-y-auto text-xs leading-5 whitespace-pre-wrap break-words text-muted">
        {text}
      </p>
    </details>
  );
}

function GenerationCard({
  suggestion,
  status,
  short,
  withVoice,
  onGenerate,
  onContinue,
  saveUrl,
  onUpgrade,
}: {
  suggestion: AgentSuggestion;
  status: CardStatus;
  short: boolean;
  withVoice: boolean;
  onGenerate: () => void;
  onContinue: () => void;
  saveUrl?: string;
  onUpgrade: () => void;
}) {
  const video = suggestion.kind === "video";
  const cost = suggestionCreditCost(suggestion, withVoice);
  const meta = video
    ? `${suggestion.durationSec}s · ${videoResolutionLabel(suggestionResolution(suggestion))} · ${suggestion.aspect}${
        withVoice ? " · voiceover" : ""
      }`
    : [suggestion.aspect, suggestion.style ? imageStyleName(suggestion.style) : ""].filter(Boolean).join(" · ");
  const running = status === "running";

  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03]">
      <div className="flex items-start gap-3 px-3.5 pt-3.5">
        <span
          className={cn(
            "grid h-9 w-9 shrink-0 place-items-center rounded-xl",
            video ? "bg-violet-400/15 text-violet-200" : "bg-sky-400/15 text-sky-200",
          )}
        >
          {video ? (
            <Glyph>
              <rect x="2.5" y="5" width="11" height="10" rx="2" />
              <path d="m13.5 8.5 4-2.5v8l-4-2.5" />
            </Glyph>
          ) : (
            <Glyph>
              <rect x="3" y="3.5" width="14" height="13" rx="2" />
              <circle cx="7.5" cy="8" r="1.3" />
              <path d="m3.5 14.5 4-4 3 3 2-2 4 3.5" />
            </Glyph>
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold tracking-tight">{video ? "Generate Video" : "Generate Image"}</p>
          <p className="truncate text-xs text-muted">{suggestion.title}</p>
        </div>
        <span className="shrink-0 rounded-full border border-line px-2 py-0.5 text-[11px] font-medium">
          {suggestionModelName(suggestion)}
        </span>
      </div>
      <p className="mx-3.5 mt-2.5 line-clamp-4 rounded-xl border border-white/[0.05] bg-black/30 px-3 py-2 text-xs leading-5 text-zinc-300">
        {suggestion.prompt}
      </p>
      <div className="flex items-center justify-between gap-3 px-3.5 py-3">
        <p className="text-[11px] text-muted tabular-nums">
          {meta} · {cost} credits
        </p>
        {short && !running ? (
          <button
            type="button"
            onClick={onUpgrade}
            className="rounded-full bg-violet-600 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-violet-700"
          >
            Upgrade
          </button>
        ) : (
          <div className="flex items-center gap-2">
            {status === "done" && saveUrl ? (
              <SaveCharacterButton
                imageUrl={suggestion.kind === "image" ? saveUrl : undefined}
                videoUrl={suggestion.kind === "video" ? saveUrl : undefined}
                label="Save to Character"
                className="rounded-full border border-white/15 px-3.5 py-1.5 text-xs font-semibold text-white"
              />
            ) : null}
            {video && status === "done" ? (
              <button
                type="button"
                onClick={onContinue}
                disabled={running}
                className="rounded-full border border-white/15 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-white/10 disabled:opacity-60"
              >
                Continue Scene
              </button>
            ) : null}
            <button
              type="button"
              onClick={onGenerate}
              disabled={running}
              className="inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-xs font-semibold text-black transition hover:bg-white/90 disabled:opacity-60"
            >
              {running ? <Spinner /> : null}
              {running ? "Generating…" : status === "done" ? "Regenerate" : status === "error" ? "Try again" : "Generate"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function Spinner({ light = false }: { light?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block h-3.5 w-3.5 animate-spin rounded-full border-2",
        light ? "border-white/30 border-t-white" : "border-black/20 border-t-black",
      )}
    />
  );
}

export function Glyph({ children, className = "h-4 w-4" }: { children: React.ReactNode; className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className={cn("shrink-0", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

export function SparkGlyph({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={cn("shrink-0", className)} fill="currentColor" aria-hidden>
      <path d="M10 2.5c.4 3.4 2.1 5.1 5.5 5.5-3.4.4-5.1 2.1-5.5 5.5-.4-3.4-2.1-5.1-5.5-5.5 3.4-.4 5.1-2.1 5.5-5.5Z" />
      <path d="M15.5 12.5c.2 1.6 1 2.4 2.5 2.5-1.5.2-2.3 1-2.5 2.5-.2-1.5-1-2.3-2.5-2.5 1.5-.1 2.3-.9 2.5-2.5Z" />
    </svg>
  );
}
