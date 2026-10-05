import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { withSupabaseCookies } from "@/lib/auth-cookie";
import { ensureProfile } from "@/lib/profiles";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const oauthError = url.searchParams.get("error_description") || url.searchParams.get("error");
  if (oauthError) {
    return loginRedirect(url.origin, oauthError);
  }
  if (!code) {
    return loginRedirect(url.origin, "Sign-in did not return a session.");
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return loginRedirect(url.origin, "Supabase is not configured.");
  }

  const redirect = NextResponse.redirect(new URL("/generator", url.origin));
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          redirect.cookies.set(name, value, options);
        });
      },
    },
  });

  const exchanged = await supabase.auth.exchangeCodeForSession(code);
  if (exchanged.error || !exchanged.data.session) {
    return loginRedirect(url.origin, exchanged.error?.message || "Could not finish sign-in.");
  }

  const session = exchanged.data.session;
  const email = session.user.email ?? "";
  if (email) {
    await ensureProfile(session.user.id, email).catch(() => undefined);
  }

  return withSupabaseCookies(redirect, session.access_token, session.refresh_token);
}

function loginRedirect(origin: string, message: string) {
  const login = new URL("/login", origin);
  login.searchParams.set("error_description", message.slice(0, 240));
  return NextResponse.redirect(login);
}
