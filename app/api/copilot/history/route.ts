import { NextResponse, type NextRequest } from "next/server";
import { isAgentSessionId } from "@/lib/agent-sessions";
import { SUPABASE_ACCESS_COOKIE } from "@/lib/auth-cookie";
import { parseCopilotThreads, type CopilotThread } from "@/lib/copilot-history";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { userFromAccessToken } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const TABLE = "copilot_threads";

function missingTable(message: string) {
  return /copilot_threads|schema cache|could not find the table|relation/i.test(message);
}

async function signedInUser(request: NextRequest) {
  const accessToken = request.cookies.get(SUPABASE_ACCESS_COOKIE)?.value ?? "";
  if (!accessToken) return null;
  const user = await userFromAccessToken(accessToken);
  if (!user?.id || !user.email) return null;
  return user;
}

function rowFromThread(userId: string, thread: CopilotThread) {
  return {
    user_id: userId,
    id: thread.id,
    title: thread.title,
    pinned: thread.pinned,
    renamed: thread.renamed,
    messages: thread.messages,
    scenes: thread.scenes,
    updated_at: thread.updatedAt,
  };
}

function threadFromRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    title: row.title,
    pinned: row.pinned,
    renamed: row.renamed,
    messages: row.messages,
    scenes: row.scenes,
    updatedAt: row.updated_at,
  };
}

export async function GET(request: NextRequest) {
  const user = await signedInUser(request);
  if (!user) return NextResponse.json({ error: "Sign in to see chat history." }, { status: 401 });

  try {
    const admin = createSupabaseAdminClient();
    const listed = await admin
      .from(TABLE)
      .select("id, title, pinned, renamed, messages, scenes, updated_at")
      .eq("user_id", user.id);
    if (listed.error) {
      if (missingTable(listed.error.message)) {
        return NextResponse.json({ storage: "local", userId: user.id, threads: [] });
      }
      return NextResponse.json({ storage: "local", userId: user.id, threads: [] });
    }
    const threads = parseCopilotThreads(
      (listed.data ?? []).filter((row) => !isAgentSessionId(row.id)).map((row) => threadFromRow(row)),
    );
    return NextResponse.json({ storage: "supabase", userId: user.id, threads });
  } catch {
    return NextResponse.json({ storage: "local", userId: user.id, threads: [] });
  }
}

export async function PUT(request: NextRequest) {
  const user = await signedInUser(request);
  if (!user) return NextResponse.json({ error: "Sign in to save chat history." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { threads?: unknown } | null;
  const threads = parseCopilotThreads(body?.threads);

  try {
    const admin = createSupabaseAdminClient();
    const rows = threads.map((thread) => rowFromThread(user.id, thread));
    if (rows.length > 0) {
      const saved = await admin.from(TABLE).upsert(rows, { onConflict: "user_id,id" });
      if (saved.error) {
        if (missingTable(saved.error.message)) {
          return NextResponse.json({ storage: "local", userId: user.id });
        }
        return NextResponse.json({ storage: "local", userId: user.id });
      }
    }

    const keep = threads.map((thread) => thread.id);
    const existing = await admin.from(TABLE).select("id").eq("user_id", user.id);
    if (existing.error) {
      if (missingTable(existing.error.message)) {
        return NextResponse.json({ storage: "local", userId: user.id });
      }
      return NextResponse.json({ storage: "supabase", userId: user.id });
    }
    const remove = (existing.data ?? [])
      .map((row) => row.id)
      .filter((id): id is string => typeof id === "string" && !keep.includes(id) && !isAgentSessionId(id));
    if (remove.length > 0) {
      await admin.from(TABLE).delete().eq("user_id", user.id).in("id", remove);
    }
    return NextResponse.json({ storage: "supabase", userId: user.id });
  } catch {
    return NextResponse.json({ storage: "local", userId: user.id });
  }
}
