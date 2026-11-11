import { parseAgentSuggestion, type AgentSuggestion } from "@/lib/agent-suggestion";
import { threadTitleFromPrompt } from "@/lib/copilot-history";
import { PROMPT_MAX } from "@/lib/motion-styles";

export const AGENT_SESSION_PREFIX = "agent_";
export const AGENT_SESSION_LIMIT = 30;
export const UNTITLED_SESSION = "Untitled session";

const MESSAGE_LIMIT = 80;
const GENERATION_LIMIT = 24;
const THUMBNAIL_MAX_CHARS = 160_000;
const THUMBNAIL = /^data:image\/(?:jpeg|png|webp);base64,[a-z0-9+/=]+$/i;

export type AgentMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  image?: string;
  reasoning?: string;
  suggestion?: AgentSuggestion | null;
  failed?: boolean;
};

export type AgentStepStatus = "pending" | "started" | "completed" | "failed";

export type AgentStep = {
  id: string;
  label: string;
  status: AgentStepStatus;
  detail?: string;
};

export type AgentGeneration = {
  id: string;
  sourceId: string;
  kind: "video" | "image";
  title: string;
  prompt: string;
  modelName: string;
  aspect: string;
  status: "running" | "done" | "error" | "cancelled";
  url?: string;
  error?: string;
  steps?: AgentStep[];
  script?: string;
  audioUrl?: string;
  voiceEmbedded?: boolean;
  voiceLabel?: string;
  durationSec?: number;
};

export type AgentSession = {
  id: string;
  title: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  messages: AgentMessage[];
  generations: AgentGeneration[];
};

export function newAgentSessionId() {
  return `${AGENT_SESSION_PREFIX}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function isAgentSessionId(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(AGENT_SESSION_PREFIX) && value.length <= 80;
}

export function agentSessionTitle(messages: AgentMessage[]) {
  const first = messages.find((message) => message.role === "user");
  if (!first) return UNTITLED_SESSION;
  if (first.text.trim()) {
    const title = threadTitleFromPrompt(first.text);
    return title === "New chat" ? UNTITLED_SESSION : title;
  }
  return first.image ? "Image prompt helper" : UNTITLED_SESSION;
}

function clip(value: unknown, max: number) {
  return typeof value === "string" ? Array.from(value.trim()).slice(0, max).join("") : "";
}

function parseMessage(value: unknown): AgentMessage | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const role = record.role === "assistant" ? "assistant" : record.role === "user" ? "user" : null;
  const id = clip(record.id, 80);
  const text = clip(record.text, 4000);
  const image =
    typeof record.image === "string" && record.image.length <= THUMBNAIL_MAX_CHARS && THUMBNAIL.test(record.image)
      ? record.image
      : undefined;
  if (!role || !id || (!text && !image)) return null;
  const reasoning = clip(record.reasoning, 2400);
  const suggestion = role === "assistant" ? parseAgentSuggestion(record.suggestion, PROMPT_MAX) : null;
  return {
    id,
    role,
    text,
    ...(image ? { image } : {}),
    ...(reasoning ? { reasoning } : {}),
    ...(suggestion ? { suggestion } : {}),
    ...(record.failed === true ? { failed: true } : {}),
  };
}

function parseGeneration(value: unknown): AgentGeneration | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const id = clip(record.id, 80);
  const sourceId = clip(record.sourceId, 80);
  const kind = record.kind === "video" ? "video" : record.kind === "image" ? "image" : null;
  const status =
    record.status === "done" || record.status === "error" || record.status === "running" || record.status === "cancelled"
      ? record.status
      : null;
  if (!id || !sourceId || !kind || !status) return null;
  const url = typeof record.url === "string" && record.url.startsWith("https://") ? record.url.slice(0, 1000) : undefined;
  if (status === "done" && !url) return null;
  const steps = Array.isArray(record.steps)
    ? record.steps
        .slice(0, 6)
        .map((item): AgentStep | null => {
          if (!item || typeof item !== "object") return null;
          const step = item as Record<string, unknown>;
          const stepStatus =
            step.status === "pending" || step.status === "started" || step.status === "completed" || step.status === "failed"
              ? step.status
              : null;
          const stepId = clip(step.id, 20);
          const label = clip(step.label, 60);
          if (!stepStatus || !stepId || !label) return null;
          const detail = clip(step.detail, 200);
          return { id: stepId, label, status: stepStatus, ...(detail ? { detail } : {}) };
        })
        .filter((item): item is AgentStep => Boolean(item))
    : [];
  const script = clip(record.script, 4000);
  const audioUrl =
    typeof record.audioUrl === "string" && record.audioUrl.startsWith("https://") ? record.audioUrl.slice(0, 1000) : undefined;
  const voiceLabel = clip(record.voiceLabel, 120);
  const durationSec = typeof record.durationSec === "number" && record.durationSec > 0 ? Math.min(record.durationSec, 600) : 0;
  return {
    ...(steps.length > 0 ? { steps } : {}),
    ...(script ? { script } : {}),
    ...(audioUrl ? { audioUrl } : {}),
    ...(record.voiceEmbedded === true ? { voiceEmbedded: true } : {}),
    ...(voiceLabel ? { voiceLabel } : {}),
    ...(durationSec ? { durationSec } : {}),
    id,
    sourceId,
    kind,
    title: clip(record.title, 80),
    prompt: clip(record.prompt, PROMPT_MAX),
    modelName: clip(record.modelName, 60),
    aspect: clip(record.aspect, 8) || "16:9",
    status,
    ...(url ? { url } : {}),
    ...(typeof record.error === "string" ? { error: clip(record.error, 300) } : {}),
  };
}

export function parseAgentSession(value: unknown): AgentSession | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (!isAgentSessionId(record.id)) return null;
  const updatedAt = typeof record.updatedAt === "string" && record.updatedAt ? record.updatedAt : "";
  if (!updatedAt) return null;
  const messages = Array.isArray(record.messages)
    ? record.messages.slice(-MESSAGE_LIMIT).map(parseMessage).filter((item): item is AgentMessage => Boolean(item))
    : [];
  if (messages.length === 0) return null;
  const generations = Array.isArray(record.generations)
    ? record.generations
        .slice(0, GENERATION_LIMIT)
        .map(parseGeneration)
        .filter((item): item is AgentGeneration => Boolean(item))
    : [];
  return {
    id: record.id,
    title: clip(record.title, 80) || agentSessionTitle(messages),
    pinned: record.pinned === true,
    createdAt: typeof record.createdAt === "string" && record.createdAt ? record.createdAt : updatedAt,
    updatedAt,
    messages,
    generations,
  };
}

export function sortAgentSessions(sessions: AgentSession[]) {
  return [...sessions].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

export function parseAgentSessions(value: unknown) {
  if (!Array.isArray(value)) return [];
  return sortAgentSessions(
    value.map(parseAgentSession).filter((item): item is AgentSession => Boolean(item)),
  ).slice(0, AGENT_SESSION_LIMIT);
}

export function mergeAgentSessions(local: AgentSession[], remote: AgentSession[]) {
  const byId = new Map<string, AgentSession>();
  for (const session of [...local, ...remote]) {
    const current = byId.get(session.id);
    if (!current || session.updatedAt >= current.updatedAt) byId.set(session.id, session);
  }
  return sortAgentSessions([...byId.values()]).slice(0, AGENT_SESSION_LIMIT);
}
