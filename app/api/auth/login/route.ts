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
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user?.email || !data.session) {
      const unconfirmed = error ? /not confirmed/i.test(error.message) : false;
      return NextResponse.json(
        {
          error: unconfirmed
            ? "Confirm your email, then sign in."
            : "Email or password does not match.",
        },
        { status: 401 },
      );
    }

    const tokens = await ensureProfile(data.user.id, data.user.email);
    const response = NextResponse.json({ user: { email: data.user.email, tokens } });
    return withSupabaseCookies(response, data.session.access_token, data.session.refresh_token);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not sign in.";
    return NextResponse.json({ error: authServiceMessage(message, "sign-in") }, { status: 500 });
  }
}
