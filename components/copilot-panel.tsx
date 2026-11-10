"use client";

import { Menu, Plus, Send, Sparkles, SquarePen, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SaveCharacterButton } from "@/components/save-character-button";
import { useStudioAccount } from "@/components/profile-credit-bar";
import { useStudioChrome } from "@/components/studio-chrome";
import {
  mergeCopilotThreads,
  readLocalThreads,
  sortCopilotThreads,
  threadTitleFromPrompt,
  writeLocalThreads,
  type CopilotChatMessage,
  type CopilotThread,
} from "@/lib/copilot-history";
import type { MovieScene } from "@/lib/scenes";

type MenuState = {
  threadId: string;
  x: number;
  y: number;
};

const STARTERS = [
  "Build a character sheet",
  "Turn a concept into storyboard prompts",
  "Learn about generation costs",
  "Plan a four-scene short movie",
];

const TEMPLATES = [
  "Ancient Greek hero character sheet",
  "Night market storyboard, four scenes",
  "What does a character sheet and a short movie cost?",
  "Continue the same character into the next scene",
];

export function CopilotPanel({
  open,
  topic,
  scenes,
  sceneCount,
  busy,
  onClose,
  onScenes,
  onRenderCharacterSheet,
  onUseInVideo,
  onGenerateMovie,
}: {
  open: boolean;
  topic: string;
  scenes: MovieScene[];
  sceneCount: number;
  busy: boolean;
  onClose: () => void;
  onScenes: (scenes: MovieScene[], reply: string) => void;
  onRenderCharacterSheet?: (prompt: string) => Promise<string>;
  onUseInVideo?: (visualPrompt: string, imageUrl: string | null) => void;
  onGenerateMovie?: (scenes: MovieScene[], imageUrl: string | null) => void;
}) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [attachmentName, setAttachmentName] = useState("");
  const attachmentRef = useRef<HTMLInputElement>(null);
  const { account } = useStudioAccount();
  const [messages, setMessages] = useState<CopilotChatMessage[]>([]);
  const [threads, setThreads] = useState<CopilotThread[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [characterSheet, setCharacterSheet] = useState("");
  const [characterImage, setCharacterImage] = useState("");
  const [renderingSheet, setRenderingSheet] = useState(false);
  const renderedSheetRef = useRef("");
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const activeIdRef = useRef<string | null>(null);
  const threadsRef = useRef<CopilotThread[]>([]);
  const userIdRef = useRef("local");
  const pressTimer = useRef<number | null>(null);
  const suppressClick = useRef(false);
  const remoteTimer = useRef<number | null>(null);
  const setChromeOpen = useStudioChrome();

  useEffect(() => {
    let ignore = false;
    const guest = sortCopilotThreads(readLocalThreads("local"));
    threadsRef.current = guest;
    setThreads(guest);
    void fetch("/api/copilot/history")
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as {
          userId?: string;
          threads?: unknown;
        };
      })
      .then((payload) => {
        if (ignore || !payload) return;
        const userId = payload.userId || "local";
        userIdRef.current = userId;
        const stored = readLocalThreads(userId);
        const remote = Array.isArray(payload.threads) ? (payload.threads as CopilotThread[]) : [];
        const merged = mergeCopilotThreads(
          mergeCopilotThreads(stored, threadsRef.current),
          remote,
        );
        threadsRef.current = merged;
        setThreads(merged);
        writeLocalThreads(userId, merged);
        if (userId !== "local" && stored.length === 0 && guest.length > 0 && remote.length === 0) {
          queueRemote(merged);
        }
      })
      .catch(() => undefined);
    return () => {
      ignore = true;
      if (pressTimer.current !== null) window.clearTimeout(pressTimer.current);
      if (remoteTimer.current !== null) window.clearTimeout(remoteTimer.current);
    };
  }, []);

  useEffect(() => {
    setChromeOpen(open);
    return () => setChromeOpen(false);
  }, [open, setChromeOpen]);

  function queueRemote(next: CopilotThread[]) {
    if (remoteTimer.current !== null) window.clearTimeout(remoteTimer.current);
    const snapshot = next;
    const userId = userIdRef.current;
    remoteTimer.current = window.setTimeout(() => {
      remoteTimer.current = null;
      if (userId === "local") return;
      void fetch("/api/copilot/history", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threads: snapshot }),
      }).catch(() => undefined);
    }, 400);
  }

  function saveThreads(next: CopilotThread[]) {
    const sorted = sortCopilotThreads(next);
    threadsRef.current = sorted;
    setThreads(sorted);
    writeLocalThreads(userIdRef.current, sorted);
    queueRemote(sorted);
    return sorted;
  }

  function remember(
    nextMessages: CopilotChatMessage[],
    nextScenes: MovieScene[],
    sheet: string,
    imageUrl = "",
  ) {
    const firstUser = nextMessages.find((message) => message.role === "user");
    if (!firstUser) return;
    const id = activeIdRef.current ?? crypto.randomUUID();
    activeIdRef.current = id;
    setActiveId(id);
    const existing = threadsRef.current.find((thread) => thread.id === id);
    const thread: CopilotThread = {
      id,
      title: existing?.renamed ? existing.title : threadTitleFromPrompt(firstUser.text),
      pinned: existing?.pinned ?? false,
      renamed: existing?.renamed ?? false,
      messages: nextMessages,
      scenes: nextScenes,
      ...(sheet ? { characterSheetPrompt: sheet } : {}),
      ...(imageUrl ? { characterSheetImageUrl: imageUrl } : {}),
      updatedAt: new Date().toISOString(),
    };
    saveThreads([thread, ...threadsRef.current.filter((item) => item.id !== id)]);
  }

  function submitChat(text: string) {
    const trimmed = text.trim();
    if ((trimmed.length < 1 && !attachmentName) || pending) return;
    const spoken = attachmentName ? `Attached image: ${attachmentName}. ${trimmed}`.trim() : trimmed;
    setAttachmentName("");
    setTemplatesOpen(false);
    void send("chat", spoken);
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
    const spoken =
      kind === "chat" ? chatText : chatText || (messages.length === 0 ? topicText : "");
    const nextMessages = spoken ? [...messages, { role: "user" as const, text: spoken }] : messages;
    if (spoken) {
      setMessages(nextMessages);
      if (kind === "chat") setDraft("");
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
        characterSheetPrompt?: string;
        error?: string;
      } | null;
      if (!response.ok || !payload?.reply) {
        throw new Error(payload?.error ?? "The co-pilot could not answer.");
      }
      const withReply = [...nextMessages, { role: "assistant" as const, text: payload.reply }];
      const nextScenes = payload.scenes && payload.scenes.length > 0 ? payload.scenes : scenes;
      const incomingSheet = payload.characterSheetPrompt?.trim() ?? "";
      const nextSheet = incomingSheet || characterSheet;
      const shouldRender =
        incomingSheet.length > 0 && incomingSheet !== renderedSheetRef.current && Boolean(onRenderCharacterSheet);
      if (shouldRender) setCharacterImage("");
      setCharacterSheet(nextSheet);
      setMessages(withReply);
      remember(withReply, nextScenes, nextSheet, shouldRender ? "" : characterImage);
      if (payload.scenes && payload.scenes.length > 0) onScenes(payload.scenes, payload.reply);
      if (shouldRender && onRenderCharacterSheet) {
        setRenderingSheet(true);
        try {
          const imageUrl = await onRenderCharacterSheet(incomingSheet);
          renderedSheetRef.current = incomingSheet;
          setCharacterImage(imageUrl);
          remember(withReply, nextScenes, nextSheet, imageUrl);
        } catch (renderError) {
          setError(renderError instanceof Error ? renderError.message : "Could not render the character sheet.");
        } finally {
          setRenderingSheet(false);
        }
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The co-pilot could not answer.");
    } finally {
      setPending(false);
    }
  }

  function loadThread(thread: CopilotThread) {
    activeIdRef.current = thread.id;
    setActiveId(thread.id);
    setMessages(thread.messages);
    setCharacterSheet(thread.characterSheetPrompt ?? "");
    setCharacterImage(thread.characterSheetImageUrl ?? "");
    renderedSheetRef.current = thread.characterSheetImageUrl ? (thread.characterSheetPrompt ?? "") : "";
    setRenderingSheet(false);
    setError(null);
    setDraft("");
    setHistoryOpen(false);
    setMenu(null);
    if (thread.scenes.length > 0) onScenes(thread.scenes, thread.messages.at(-1)?.text ?? thread.title);
  }

  function startNewChat() {
    activeIdRef.current = null;
    setActiveId(null);
    setAttachmentName("");
    setTemplatesOpen(false);
    setMessages([]);
    setCharacterSheet("");
    setCharacterImage("");
    renderedSheetRef.current = "";
    setRenderingSheet(false);
    setError(null);
    setDraft("");
    setHistoryOpen(false);
    setMenu(null);
  }

  function closePanel() {
    setHistoryOpen(false);
    setMenu(null);
    onClose();
  }

  function updateThread(threadId: string, patch: Partial<CopilotThread>) {
    saveThreads(
      threadsRef.current.map((thread) => (thread.id === threadId ? { ...thread, ...patch } : thread)),
    );
  }

  function removeThread(threadId: string) {
    saveThreads(threadsRef.current.filter((thread) => thread.id !== threadId));
    if (activeIdRef.current === threadId) startNewChat();
    setMenu(null);
    setRenamingId(null);
  }

  function openMenu(threadId: string, x: number, y: number) {
    suppressClick.current = true;
    const menuWidth = 180;
    const menuHeight = 148;
    setMenu({
      threadId,
      x: Math.max(8, Math.min(x, window.innerWidth - menuWidth - 8)),
      y: Math.max(8, Math.min(y, window.innerHeight - menuHeight - 8)),
    });
  }

  function beginRename(thread: CopilotThread) {
    setRenamingId(thread.id);
    setRenameDraft(thread.title);
    setMenu(null);
  }

  function commitRename(threadId: string) {
    const title = renameDraft.replace(/\s+/g, " ").trim().slice(0, 80);
    if (title) updateThread(threadId, { title, renamed: true });
    setRenamingId(null);
  }

  const firstUserText = messages.find((message) => message.role === "user")?.text ?? "";
  const activeThread = threads.find((thread) => thread.id === activeId);
  const headerTitle = !firstUserText
    ? "New chat"
    : activeThread?.renamed
      ? activeThread.title
      : threadTitleFromPrompt(firstUserText);
  const greetingName = account?.name.split(/\s+/).filter(Boolean)[0] || "there";

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="studio-light studio-dark contents">
      <aside className="fixed inset-0 z-50 flex h-dvh flex-col overflow-hidden md:left-auto md:w-full md:max-w-md md:border-l md:border-line" style={{ background: "radial-gradient(circle at center, #18181b 0%, #09090b 100%)" }}>
        <header className="sticky top-0 z-50 flex shrink-0 items-center gap-2 border-b border-line bg-black/40 px-3 py-3 backdrop-blur-md">
          <button
            type="button"
            aria-label="Chat history"
            aria-expanded={historyOpen}
            aria-controls="copilot-history"
            onClick={() => setHistoryOpen((current) => !current)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-foreground hover:bg-panel"
          >
            <Menu className="h-5 w-5" strokeWidth={2} aria-hidden />
          </button>
          <h2 className="min-w-0 flex-1 truncate text-center text-sm font-medium tracking-tight">{headerTitle}</h2>
          <button
            type="button"
            aria-label="New chat"
            onClick={startNewChat}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-foreground hover:bg-panel"
          >
            <SquarePen className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            aria-label="Close co-pilot"
            onClick={closePanel}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-foreground hover:bg-panel"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </header>
        {historyOpen ? (
          <div id="copilot-history" className="flex min-h-0 flex-1 flex-col overflow-hidden border-b border-line">
            <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
              <h3 className="text-sm font-semibold tracking-tight">Chat history</h3>
              <div className="flex shrink-0 items-center gap-2">
                <button type="button" onClick={startNewChat} className="gen-ghost text-sm">
                  New chat
                </button>
                <button
                  type="button"
                  aria-label="Close chat history"
                  onClick={() => {
                    setHistoryOpen(false);
                    setMenu(null);
                  }}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-line text-sm"
                >
                  X
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-3">
              {threads.length === 0 ? (
                <p className="text-sm leading-6 text-muted">Your chats show up here after the first message.</p>
              ) : null}
              {threads.map((thread) => (
                <div key={thread.id}>
                  {renamingId === thread.id ? (
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        commitRename(thread.id);
                      }}
                    >
                      <input
                        autoFocus
                        value={renameDraft}
                        onChange={(event) => setRenameDraft(event.target.value)}
                        onBlur={() => commitRename(thread.id)}
                        aria-label="Rename chat"
                        className="gen-field w-full rounded-xl px-3 py-2 text-sm outline-none"
                      />
                    </form>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        if (suppressClick.current) {
                          suppressClick.current = false;
                          return;
                        }
                        loadThread(thread);
                      }}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        openMenu(thread.id, event.clientX, event.clientY);
                      }}
                      onPointerDown={(event) => {
                        if (event.pointerType === "mouse" && event.button !== 0) return;
                        if (pressTimer.current !== null) window.clearTimeout(pressTimer.current);
                        const x = event.clientX;
                        const y = event.clientY;
                        pressTimer.current = window.setTimeout(() => {
                          pressTimer.current = null;
                          openMenu(thread.id, x, y);
                        }, 520);
                      }}
                      onPointerUp={() => {
                        if (pressTimer.current !== null) window.clearTimeout(pressTimer.current);
                        pressTimer.current = null;
                      }}
                      onPointerCancel={() => {
                        if (pressTimer.current !== null) window.clearTimeout(pressTimer.current);
                        pressTimer.current = null;
                      }}
                      className="w-full rounded-2xl border border-line bg-panel px-3 py-3 text-left hover:border-foreground/30"
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">{thread.title}</span>
                        {thread.pinned ? (
                          <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-accent">
                            Pinned
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-1 block truncate text-xs text-muted">
                        {thread.messages.at(-1)?.text}
                      </span>
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : null}
        <div className={historyOpen ? "hidden" : "relative min-h-0 flex-1 overflow-y-auto"}>
          <div
            className={
              messages.length === 0
                ? "flex min-h-full flex-col items-center justify-center px-6 py-10 text-center transition-all duration-300"
                : "pointer-events-none absolute inset-0 flex scale-95 flex-col items-center justify-center px-6 py-10 text-center opacity-0 transition-all duration-300"
            }
          >
            <p className="text-xl font-medium tracking-tight">Hi {greetingName}, What would you like to create?</p>
            <div className="mt-6 flex w-full max-w-sm flex-col gap-2">
              {STARTERS.map((starter) => (
                <button
                  key={starter}
                  type="button"
                  disabled={pending}
                  onClick={() => submitChat(starter)}
                  className="rounded-2xl border border-line bg-panel px-4 py-3 text-left text-sm leading-6 text-foreground transition hover:border-accent/40 hover:bg-panel"
                >
                  {starter}
                </button>
              ))}
            </div>
          </div>
          <div className={messages.length === 0 ? "hidden" : "space-y-3 px-4 py-4"}>
          {messages.map((message, index) => (
            <p
              key={`${message.role}-${index}`}
              className={
                message.role === "user"
                  ? "ml-8 rounded-2xl bg-panel px-3 py-2 text-sm leading-6"
                  : "mr-6 rounded-2xl bg-panel px-3 py-2 text-sm leading-6 text-foreground/90"
              }
            >
              {message.text}
            </p>
          ))}
          {characterSheet || renderingSheet ? (
            <section className="rounded-2xl border border-line bg-panel p-3">
              <p className="font-mono text-[11px] text-accent">Character reference sheet</p>
              {renderingSheet ? (
                <div role="status" className="mt-3 grid aspect-square place-items-center rounded-2xl bg-panel text-center">
                  <span className="grid justify-items-center gap-2 text-accent">
                    <Spinner />
                    <span className="text-sm text-foreground">Rendering the character sheet</span>
                    <span className="text-xs text-muted">10 credits</span>
                  </span>
                </div>
              ) : characterImage ? (
                <div className="relative mt-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={characterImage}
                    alt="Character reference sheet"
                    className="aspect-square w-full rounded-2xl bg-black object-contain"
                  />
                  <div className="absolute right-2 bottom-2">
                    <SaveCharacterButton imageUrl={characterImage} label="Save to Character" className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-black" />
                  </div>
                </div>
              ) : null}
              {characterSheet ? <p className="mt-2 text-xs leading-5 text-foreground/80">{characterSheet}</p> : null}
            </section>
          ) : null}
          {scenes.length > 1 && onGenerateMovie ? (
            <button
              type="button"
              disabled={pending || busy || renderingSheet}
              onClick={() => onGenerateMovie(scenes.slice(0, 4), characterImage || null)}
              className="gen-cta w-full"
            >
              {busy ? "Rendering the movie…" : `Generate Full Short Movie · ${Math.min(scenes.length, 4)} scenes`}
            </button>
          ) : null}
          {scenes.length > 0 ? (
            <ol className="space-y-3">
              {scenes.map((scene, index) => (
                <li key={`${scene.title}-${index}`} className="rounded-2xl border border-line bg-panel p-3">
                  <p className="font-mono text-[11px] text-accent">Scene {index + 1}</p>
                  <p className="mt-1 text-sm font-medium">{scene.title}</p>
                  <p className="mt-2 font-mono text-[11px] text-muted">Character dialogue</p>
                  <p className="mt-1 text-sm leading-6 text-muted">{scene.narration}</p>
                  <p className="mt-2 font-mono text-[11px] text-muted">Visual prompt</p>
                  <p className="mt-1 text-xs leading-5 text-foreground/80">{scene.visualPrompt}</p>
                  {scene.motionPrompt ? (
                    <>
                      <p className="mt-2 font-mono text-[11px] text-muted">Video prompt</p>
                      <p className="mt-1 text-xs leading-5 text-foreground/80">{scene.motionPrompt}</p>
                    </>
                  ) : null}
                  {onUseInVideo ? (
                    <button
                      type="button"
                      disabled={renderingSheet}
                      onClick={() => onUseInVideo(scene.visualPrompt, characterImage || null)}
                      className="mt-3 rounded-full border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs text-accent transition hover:border-accent disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Use in Video Generator
                    </button>
                  ) : null}
                </li>
              ))}
            </ol>
          ) : null}
          {error ? <p className="gen-alert">{error}</p> : null}
          </div>
        </div>
        <form
          className="shrink-0 px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
          onSubmit={(event) => {
            event.preventDefault();
            submitChat(draft);
          }}
        >
          {templatesOpen ? (
            <div className="mb-2 grid gap-1 rounded-2xl border border-line bg-[var(--surface)] p-2 shadow-lg">
              {TEMPLATES.map((template) => (
                <button
                  key={template}
                  type="button"
                  onClick={() => {
                    setDraft(template);
                    setTemplatesOpen(false);
                  }}
                  className="rounded-xl px-3 py-2 text-left text-sm leading-5 hover:bg-panel"
                >
                  {template}
                </button>
              ))}
              <button
                type="button"
                disabled={pending || busy || (topic.trim().length < 3 && draft.trim().length < 3)}
                onClick={() => {
                  setTemplatesOpen(false);
                  void send("plan", draft);
                }}
                className="rounded-xl px-3 py-2 text-left text-sm leading-5 hover:bg-panel"
              >
                Plan scenes from this idea
              </button>
            </div>
          ) : null}
          {attachmentName ? (
            <p className="mb-2 flex items-center justify-between gap-2 px-2 text-xs text-muted">
              <span className="truncate">Attached {attachmentName}</span>
              <button type="button" onClick={() => { setAttachmentName(""); setCharacterImage(""); }} className="shrink-0 text-foreground">
                Remove
              </button>
            </p>
          ) : null}
          <div className="rounded-[1.6rem] border border-line bg-[rgba(24,24,27,0.8)] p-2 shadow-[0_8px_30px_rgba(0,0,0,0.4)]">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
                event.preventDefault();
                submitChat(draft);
              }}
              rows={2}
              enterKeyHint="send"
              placeholder="What do you want to create?"
              className="w-full resize-none bg-transparent px-3 py-2 text-sm leading-6 outline-none placeholder:text-muted/70"
            />
            <div className="flex items-center justify-between gap-2 px-1 pb-1">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label="Attach image"
                  onClick={() => attachmentRef.current?.click()}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-foreground hover:bg-panel"
                >
                  <Plus className="h-4 w-4" aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label="Prompt templates"
                  aria-expanded={templatesOpen}
                  onClick={() => setTemplatesOpen((current) => !current)}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-foreground hover:bg-panel"
                >
                  <Sparkles className="h-4 w-4" aria-hidden />
                </button>
              </div>
              <button
                type="submit"
                aria-label="Send"
                disabled={pending || (draft.trim().length < 1 && !attachmentName)}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-black disabled:opacity-40"
              >
                <Send className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </div>
          <input
            ref={attachmentRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) {
                setAttachmentName(file.name);
                const reader = new FileReader();
                reader.onload = () => {
                  const value = typeof reader.result === "string" ? reader.result : "";
                  if (value.startsWith("data:image/")) setCharacterImage(value);
                };
                reader.readAsDataURL(file);
              }
            }}
          />
        </form>
      </aside>

      {menu ? (
        <>
          <button
            type="button"
            aria-label="Close chat menu"
            className="fixed inset-0 z-[60] cursor-default"
            onClick={() => setMenu(null)}
          />
          <div
            role="menu"
            className="fixed z-[70] w-44 rounded-2xl border border-line bg-[var(--surface)] p-1 shadow-2xl"
            style={{ left: menu.x, top: menu.y }}
          >
            <button
              type="button"
              role="menuitem"
              className="block w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-panel"
              onClick={() => {
                const thread = threads.find((item) => item.id === menu.threadId);
                if (thread) updateThread(thread.id, { pinned: !thread.pinned });
                setMenu(null);
              }}
            >
              {threads.find((item) => item.id === menu.threadId)?.pinned ? "Unpin" : "Pin"}
            </button>
            <button
              type="button"
              role="menuitem"
              className="block w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-panel"
              onClick={() => {
                const thread = threads.find((item) => item.id === menu.threadId);
                if (thread) beginRename(thread);
              }}
            >
              Rename
            </button>
            <button
              type="button"
              role="menuitem"
              className="block w-full rounded-xl px-3 py-2 text-left text-sm text-red-600 hover:bg-panel"
              onClick={() => removeThread(menu.threadId)}
            >
              Delete
            </button>
          </div>
        </>
      ) : null}
    </div>,
    document.body,
  );
}

function Spinner() {
  return (
    <svg viewBox="0 0 16 16" className="gen-spin h-5 w-5" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1.6" />
      <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
