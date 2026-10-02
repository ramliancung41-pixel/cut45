import { NextResponse, type NextRequest } from "next/server";
import type { User } from "@supabase/supabase-js";
import {
  SUPABASE_ACCESS_COOKIE,
  SUPABASE_REFRESH_COOKIE,
  withSupabaseCookies,
} from "@/lib/auth-cookie";
import { accountDisplayName } from "@/lib/display-name";
import { readProfileLabel, readProfileTokens } from "@/lib/profiles";
import { refreshSupabaseSession, userFromAccessToken } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function accountPayload(user: User) {
  const email = user.email ?? "";
  const [tokens, profileLabel] = await Promise.all([
    readProfileTokens(user.id),
    readProfileLabel(user.id),
  ]);
  return {
    email,
    tokens,
    name: accountDisplayName({ email, user_metadata: user.user_metadata }, profileLabel),
  };
}

export async function GET(request: NextRequest) {
  const accessToken = request.cookies.get(SUPABASE_ACCESS_COOKIE)?.value;
  const refreshToken = request.cookies.get(SUPABASE_REFRESH_COOKIE)?.value;
  if (!accessToken && !refreshToken) {
    return NextResponse.json({ user: null });
  }

  try {
    if (accessToken) {
      const user = await userFromAccessToken(accessToken);
      if (user?.email) {
        return NextResponse.json({ user: await accountPayload(user) });
      }
    }

    if (!refreshToken) {
      return NextResponse.json({ user: null });
    }

    const refreshed = await refreshSupabaseSession(refreshToken);
    if (!refreshed?.user.email) {
      return NextResponse.json({ user: null });
    }

    const response = NextResponse.json({
      user: await accountPayload(refreshed.user),
    });
    return withSupabaseCookies(
      response,
      refreshed.session.access_token,
      refreshed.session.refresh_token,
    );
  } catch {
    return NextResponse.json({ user: null });
  }
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    accessToken?: unknown;
    refreshToken?: unknown;
  } | null;
  const accessToken = typeof body?.accessToken === "string" ? body.accessToken : "";
  const refreshToken = typeof body?.refreshToken === "string" ? body.refreshToken : "";
  if (!accessToken || !refreshToken) {
    return NextResponse.json({ error: "Could not save the session." }, { status: 400 });
  }

  try {
    const user = await userFromAccessToken(accessToken);
    if (!user?.email) {
      return NextResponse.json({ error: "Could not save the session." }, { status: 401 });
    }
    const response = NextResponse.json({
      user: await accountPayload(user),
    });
    return withSupabaseCookies(response, accessToken, refreshToken);
  } catch {
    return NextResponse.json({ error: "Could not save the session." }, { status: 500 });
  }
}
