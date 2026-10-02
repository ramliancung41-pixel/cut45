import { NextResponse } from "next/server";
import { authServiceMessage, normalizeEmail, validateEmail } from "@/lib/auth";
import { ensureProfile, findAuthUserId } from "@/lib/profiles";
import { userFromAccessToken } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const header = request.headers.get("authorization");
  const accessToken = header?.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";

  try {
    if (accessToken) {
      const user = await userFromAccessToken(accessToken);
      if (!user?.email) {
        return NextResponse.json({ error: "Sign in before creating a profile." }, { status: 401 });
      }
      const tokens = await ensureProfile(user.id, user.email);
      return NextResponse.json({ tokens });
    }

    const body = (await request.json().catch(() => null)) as { email?: unknown } | null;
    const email = typeof body?.email === "string" ? normalizeEmail(body.email) : "";
    const emailError = validateEmail(email);
    if (emailError) {
      return NextResponse.json({ error: emailError }, { status: 400 });
    }

    const userId = await findAuthUserId(email);
    if (!userId) {
      return NextResponse.json({ error: "Could not save the profile." }, { status: 404 });
    }
    const tokens = await ensureProfile(userId, email);
    return NextResponse.json({ tokens });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save the profile.";
    return NextResponse.json({ error: authServiceMessage(message, "create") }, { status: 500 });
  }
}
