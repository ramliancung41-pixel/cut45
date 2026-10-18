import type { AgentSuggestion } from "@/lib/agent-suggestion";

export type AgentRunExtras = {
  referenceImage?: string;
  voice?: string;
  motionStyle?: string;
  language?: string;
  mockMode?: boolean;
};

export type AgentHandoff = {
  sessionId: string;
  userMessageId: string;
  assistantMessageId: string;
  suggestion: AgentSuggestion;
  extras: AgentRunExtras;
};

// Kept in memory only so a page refresh can never start a second paid render.
let pending: AgentHandoff | null = null;

export function stashAgentHandoff(handoff: AgentHandoff) {
  pending = handoff;
}

export function peekAgentHandoff(sessionId: string) {
  return pending?.sessionId === sessionId ? pending : null;
}

export function takeAgentHandoff(sessionId: string) {
  const handoff = peekAgentHandoff(sessionId);
  if (handoff) pending = null;
  return handoff;
}

export type AgentDraft = {
  sessionId: string;
  messageId: string;
  message: string;
  image?: string;
};

let pendingDraft: AgentDraft | null = null;

export function stashAgentDraft(draft: Omit<AgentDraft, "messageId">) {
  pendingDraft = { ...draft, messageId: `msg_${Date.now().toString(36)}d` };
}

export function peekAgentDraft(sessionId: string) {
  return pendingDraft?.sessionId === sessionId ? pendingDraft : null;
}

export function takeAgentDraft(sessionId: string) {
  const draft = peekAgentDraft(sessionId);
  if (draft) pendingDraft = null;
  return draft;
}
