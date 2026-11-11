import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_ACCESS_COOKIE, SUPABASE_REFRESH_COOKIE, withSupabaseCookies } from "@/lib/auth-cookie";
import { loginDestination } from "@/lib/billing";
import { isStudioPath } from "@/lib/studio-paths";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const studio = isStudioPath(pathname);
  const login = pathname === "/login";
  if (!studio && !login) return NextResponse.next();

  const session = await readSession(request);

  if (studio && !session) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (login && session) {
    const response = NextResponse.redirect(
      new URL(
        loginDestination({
          next: request.nextUrl.searchParams.get("next"),
          redirect: request.nextUrl.searchParams.get("redirect"),
          plan: request.nextUrl.searchParams.get("plan"),
        }),
        request.url,
      ),
    );
    return applySession(response, session);
  }

  if (
    pathname === "/create-video" ||
    pathname.startsWith("/create-video/") ||
    pathname === "/generator" ||
    pathname.startsWith("/generator/") ||
    pathname === "/create" ||
    pathname.startsWith("/create/") ||
    pathname === "/editor" ||
    pathname.startsWith("/editor/") ||
    pathname === "/agent" ||
    pathname.startsWith("/agent/")
  ) {
    const response = NextResponse.redirect(new URL("/builder", request.url));
    return applySession(response, session);
  }

  const response = NextResponse.next();
  return applySession(response, session);
}

type ActiveSession = {
  accessToken: string;
  refreshToken: string;
  refreshed: boolean;
};

function applySession(response: NextResponse, session: ActiveSession | null) {
  if (!session?.refreshed) return response;
  return withSupabaseCookies(response, session.accessToken, session.refreshToken);
}

async function readSession(request: NextRequest): Promise<ActiveSession | null> {
  const accessToken = request.cookies.get(SUPABASE_ACCESS_COOKIE)?.value;
  const refreshToken = request.cookies.get(SUPABASE_REFRESH_COOKIE)?.value;
  if (!accessToken && !refreshToken) return null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  try {
    const supabase = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    if (accessToken) {
      const { data, error } = await supabase.auth.getUser(accessToken);
      if (!error && data.user) {
        return { accessToken, refreshToken: refreshToken ?? "", refreshed: false };
      }
    }

    if (!refreshToken) return null;
    const refreshed = await supabase.auth.refreshSession({ refresh_token: refreshToken });
    if (refreshed.error || !refreshed.data.session || !refreshed.data.user) return null;
    return {
      accessToken: refreshed.data.session.access_token,
      refreshToken: refreshed.data.session.refresh_token,
      refreshed: true,
    };
  } catch {
    return null;
  }
}

export const config = {
  matcher: [
    "/dashboard",
    "/dashboard/:path*",
    "/builder",
    "/builder/:path*",
    "/templates",
    "/templates/:path*",
    "/create",
    "/create/:path*",
    "/generator",
    "/generator/:path*",
    "/create-video",
    "/create-video/:path*",
    "/credits",
    "/credits/:path*",
    "/gallery",
    "/gallery/:path*",
    "/characters",
    "/characters/:path*",
    "/settings",
    "/settings/:path*",
    "/editor",
    "/editor/:path*",
    "/agent",
    "/agent/:path*",
    "/workflows",
    "/workflows/:path*",
    "/plugins",
    "/plugins/:path*",
    "/assets",
    "/assets/:path*",
    "/brand",
    "/brand/:path*",
    "/login",
  ],
};
