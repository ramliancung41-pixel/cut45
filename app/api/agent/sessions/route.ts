import { NextResponse, type NextRequest } from "next/server";
import {
  AGENT_SESSION_LIMIT,
  AGENT_SESSION_PREFIX,
  isAgentSessionId,
  parseAgentSession,
  parseAgentSessions,
  type AgentSession,
} from "@/lib/agent-sessions";
import { SUPABASE_ACCESS_COOKIE } from "@/lib/auth-cookie";
import { createSupabaseAdminClient, userFromAccessToken } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Agent sessions share the Co-Pilot thread table; the id prefix keeps them apart from drawer threads.
const TABLE = "copilot_threads";

async function signedInUser(request: NextRequest) {
  const accessToken = request.cookies.get(SUPABASE_ACCESS_COOKIE)?.value ?? "";
  if (!accessToken) return null;
  const user = await userFromAccessToken(accessToken);
  return user?.id ? user : null;
}

function rowFromSession(userId: string, session: AgentSession) {
  return {
    user_id: userId,
    id: session.id,
    title: session.title,
    pinned: session.pinned,
    renamed: false,
    messages: session.messages,
    scenes: { createdAt: session.createdAt, generations: session.generations },
    updated_at: session.updatedAt,
  };
}

function sessionFromRow(row: Record<string, unknown>) {
  const extra = row.scenes && typeof row.scenes === "object" && !Array.isArray(row.scenes)
    ? (row.scenes as { createdAt?: unknown; generations?: unknown })
    : {};
  const updatedAt = typeof row.updated_at === "string" ? new Date(row.updated_at).toISOString() : "";
  return {
    id: row.id,
    title: row.title,
    pinned: row.pinned,
    messages: row.messages,
    generations: extra.generations,
    createdAt: extra.createdAt,
    updatedAt,
  };
}

export async function GET(request: NextRequest) {
  const user = await signedInUser(request);
  if (!user) return NextResponse.json({ error: "Sign in to see chat history." }, { status: 401 });

  try {
    const listed = await createSupabaseAdminClient()
      .from(TABLE)
      .select("id, title, pinned, messages, scenes, updated_at")
      .eq("user_id", user.id)
      .like("id", `${AGENT_SESSION_PREFIX}%`)
      .order("updated_at", { ascending: false })
      .limit(AGENT_SESSION_LIMIT);
    if (listed.error) return NextResponse.json({ storage: "local", userId: user.id, sessions: [] });
    const sessions = parseAgentSessions(
      (listed.data ?? []).filter((row) => isAgentSessionId(row.id)).map((row) => sessionFromRow(row)),
    );
    return NextResponse.json({ storage: "supabase", userId: user.id, sessions });
  } catch {
    return NextResponse.json({ storage: "local", userId: user.id, sessions: [] });
  }
}

export async function PUT(request: NextRequest) {
  const user = await signedInUser(request);
  if (!user) return NextResponse.json({ error: "Sign in to save chat history." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { session?: unknown } | null;
  const session = parseAgentSession(body?.session);
  if (!session) return NextResponse.json({ error: "That chat session is not valid." }, { status: 400 });

  try {
    const saved = await createSupabaseAdminClient()
      .from(TABLE)
      .upsert(rowFromSession(user.id, session), { onConflict: "user_id,id" });
    if (saved.error) {
      console.error("Agent session save failed", saved.error.message);
      return NextResponse.json({ storage: "local", userId: user.id });
    }
    return NextResponse.json({ storage: "supabase", userId: user.id });
  } catch {
    return NextResponse.json({ storage: "local", userId: user.id });
  }
}

export async function DELETE(request: NextRequest) {
  const user = await signedInUser(request);
  if (!user) return NextResponse.json({ error: "Sign in to delete chat history." }, { status: 401 });

  const id = request.nextUrl.searchParams.get("id");
  if (!isAgentSessionId(id)) return NextResponse.json({ error: "Choose a chat to delete." }, { status: 400 });

  try {
    const removed = await createSupabaseAdminClient().from(TABLE).delete().eq("user_id", user.id).eq("id", id);
    if (removed.error) return NextResponse.json({ storage: "local", userId: user.id });
    return NextResponse.json({ storage: "supabase", userId: user.id });
  } catch {
    return NextResponse.json({ storage: "local", userId: user.id });
  }
}
