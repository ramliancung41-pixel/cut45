import type { MovieScene } from "@/lib/scenes";

export type CopilotChatMessage = {
  role: "user" | "assistant";
  text: string;
};

export type CopilotThread = {
  id: string;
  title: string;
  pinned: boolean;
  renamed: boolean;
  messages: CopilotChatMessage[];
  scenes: MovieScene[];
  characterSheetPrompt?: string;
  characterSheetImageUrl?: string;
  updatedAt: string;
};

const TITLE_LIMIT = 42;
const STORAGE_PREFIX = "cut45.copilot.threads.";

const TITLE_SKIP = new Set([
  "a",
  "an",
  "the",
  "to",
  "for",
  "of",
  "and",
  "or",
  "my",
  "me",
  "i",
  "i'm",
  "please",
  "can",
  "could",
  "you",
  "your",
  "make",
  "create",
  "generate",
  "want",
  "would",
  "like",
  "into",
  "about",
  "with",
  "from",
  "this",
  "that",
  "just",
  "do",
]);

export function threadTitleFromPrompt(prompt: string) {
  const words = prompt
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean);
  const meaningful = words.filter((word) => !TITLE_SKIP.has(word.toLowerCase()));
  const chosen = (meaningful.length >= 3 ? meaningful : words).slice(0, 5);
  if (chosen.length === 0) return "New chat";
  const title = chosen
    .map((word) => {
      const chars = Array.from(word);
      return `${chars[0]?.toUpperCase() ?? ""}${chars.slice(1).join("")}`;
    })
    .join(" ");
  return Array.from(title).slice(0, TITLE_LIMIT).join("");
}

export function sortCopilotThreads(threads: CopilotThread[]) {
  return [...threads].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

export function readLocalThreads(userId: string) {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${userId}`);
    if (!raw) return [];
    return parseCopilotThreads(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function writeLocalThreads(userId: string, threads: CopilotThread[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}${userId}`, JSON.stringify(threads.slice(0, 50)));
  } catch {
    // The drawer still works for this session if the browser refuses storage.
  }
}

export function mergeCopilotThreads(local: CopilotThread[], remote: CopilotThread[]) {
  const byId = new Map<string, CopilotThread>();
  for (const thread of [...local, ...remote]) {
    const current = byId.get(thread.id);
    if (!current || thread.updatedAt > current.updatedAt) byId.set(thread.id, thread);
  }
  return sortCopilotThreads([...byId.values()]);
}

export function parseCopilotThreads(value: unknown) {
  if (!Array.isArray(value)) return [];
  const threads: CopilotThread[] = [];
  for (const item of value.slice(0, 50)) {
    const thread = parseCopilotThread(item);
    if (thread) threads.push(thread);
  }
  return sortCopilotThreads(threads);
}

function parseCopilotThread(value: unknown): CopilotThread | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id.trim().slice(0, 80) : "";
  const title = typeof record.title === "string" ? record.title.trim().slice(0, 80) : "";
  const updatedAt = typeof record.updatedAt === "string" ? record.updatedAt : "";
  if (!id || !title || !updatedAt) return null;
  const messages = parseMessages(record.messages);
  if (messages.length === 0) return null;
  return {
    id,
    title,
    pinned: record.pinned === true,
    renamed: record.renamed === true,
    messages,
    scenes: parseScenes(record.scenes),
    ...(typeof record.characterSheetPrompt === "string" && record.characterSheetPrompt.trim()
      ? { characterSheetPrompt: record.characterSheetPrompt.trim().slice(0, 1200) }
      : {}),
    ...(typeof record.characterSheetImageUrl === "string" && record.characterSheetImageUrl.startsWith("https://")
      ? { characterSheetImageUrl: record.characterSheetImageUrl.trim().slice(0, 500) }
      : {}),
    updatedAt,
  };
}

function parseMessages(value: unknown) {
  if (!Array.isArray(value)) return [];
  const messages: CopilotChatMessage[] = [];
  for (const item of value.slice(0, 40)) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const role = record.role === "assistant" ? "assistant" : record.role === "user" ? "user" : null;
    const text = typeof record.text === "string" ? record.text.trim().slice(0, 4000) : "";
    if (!role || !text) continue;
    messages.push({ role, text });
  }
  return messages;
}

function parseScenes(value: unknown) {
  if (!Array.isArray(value)) return [];
  const scenes: MovieScene[] = [];
  for (const item of value.slice(0, 12)) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const title = typeof record.title === "string" ? record.title.trim().slice(0, 80) : "";
    const narration = typeof record.narration === "string" ? record.narration.trim().slice(0, 1200) : "";
    const visualPrompt = typeof record.visualPrompt === "string" ? record.visualPrompt.trim().slice(0, 1200) : "";
    const referenceNote = typeof record.referenceNote === "string" ? record.referenceNote.trim().slice(0, 240) : "";
    const motionPrompt = typeof record.motionPrompt === "string" ? record.motionPrompt.trim().slice(0, 500) : "";
    if (!title || !narration || !visualPrompt) continue;
    scenes.push({
      title,
      narration,
      visualPrompt,
      referenceNote: referenceNote || "Keep the same subject, wardrobe, and lighting in every scene.",
      ...(motionPrompt ? { motionPrompt } : {}),
    });
  }
  return scenes;
}
