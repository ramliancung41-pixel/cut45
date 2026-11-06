import { createHmac, timingSafeEqual } from "node:crypto";

const TICKET_TTL_MS = 30 * 60 * 1000;

export type RenderTicket = {
  userId: string;
  email: string;
  credits: number;
  responseUrl: string;
  voice?: { voiceId: string; language: string; script: string; aspect: string };
  exp: number;
};

function secret() {
  return process.env.RENDER_TICKET_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
}

function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

// Queued renders carry this ticket so the status route charges only once Fal returns the finished clip.
export function signRenderTicket(input: Omit<RenderTicket, "exp">) {
  const payload = Buffer.from(JSON.stringify({ ...input, exp: Date.now() + TICKET_TTL_MS })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function readRenderTicket(ticket: unknown, responseUrl: string): RenderTicket | null {
  if (typeof ticket !== "string" || !secret()) return null;
  const [payload, signature] = ticket.split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
  try {
    const value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as RenderTicket;
    if (value.responseUrl !== responseUrl || typeof value.credits !== "number" || value.exp < Date.now()) return null;
    return value;
  } catch {
    return null;
  }
}
