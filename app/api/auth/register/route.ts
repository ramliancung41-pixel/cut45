import { NextResponse } from "next/server";
import { withSupabaseCookies } from "@/lib/auth-cookie";
import { authServiceMessage, normalizeEmail, validateEmail, validatePassword } from "@/lib/auth";
import { ensureProfile } from "@/lib/profiles";
import { createSupabaseAnonClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    email?: unknown;
    password?: unknown;
  } | null;
  const email = typeof body?.email === "string" ? normalizeEmail(body.email) : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const emailError = validateEmail(email);
  const passwordError = validatePassword(password);

  if (emailError || passwordError) {
    return NextResponse.json(
      { error: emailError ?? passwordError ?? "Check the form and try again." },
      { status: 400 },
    );
  }

  try {
    const supabase = createSupabaseAnonClient();
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      const alreadyExists = /already registered/i.test(error.message);
      return NextResponse.json(
        { error: authServiceMessage(error.message, "create") },
        { status: alreadyExists ? 409 : 400 },
      );
    }

    const user = data.user;
    if (!user?.email || (user.identities && user.identities.length === 0)) {
      return NextResponse.json(
        { error: "An account with that email already exists." },
        { status: 409 },
      );
    }

    const tokens = await ensureProfile(user.id, user.email);
    const response = NextResponse.json({ user: { email: user.email, tokens } });
    if (!data.session) return response;
    return withSupabaseCookies(response, data.session.access_token, data.session.refresh_token);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create the account.";
    return NextResponse.json({ error: authServiceMessage(message, "create") }, { status: 500 });
  }
}
