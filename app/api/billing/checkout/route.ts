import { NextResponse, type NextRequest } from "next/server";
import {
  SUPABASE_ACCESS_COOKIE,
  SUPABASE_REFRESH_COOKIE,
  withSupabaseCookies,
} from "@/lib/auth-cookie";
import { isBillingPlanId, stripeCheckoutDestination } from "@/lib/billing";
import { refreshSupabaseSession, userFromAccessToken } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const plan = request.nextUrl.searchParams.get("plan");
  if (!isBillingPlanId(plan)) {
    return NextResponse.json({ error: "Unknown plan." }, { status: 400 });
  }

  const account = await signedInAccount(request);
  if (!account) {
    const login = new URL("/login", request.url);
    login.searchParams.set("redirect", "credits");
    login.searchParams.set("plan", plan);
    return NextResponse.redirect(login);
  }

  const destination = stripeCheckoutDestination(plan, account.userId);
  if (!destination) {
    return NextResponse.json(
      { error: `Add the Stripe Payment Link for the ${plan} plan.` },
      { status: 503 },
    );
  }

  const response = NextResponse.redirect(destination);
  if (account.accessToken && account.refreshToken) {
    return withSupabaseCookies(response, account.accessToken, account.refreshToken);
  }
  return response;
}

async function signedInAccount(request: NextRequest) {
  const accessToken = request.cookies.get(SUPABASE_ACCESS_COOKIE)?.value;
  const refreshToken = request.cookies.get(SUPABASE_REFRESH_COOKIE)?.value;

  if (accessToken) {
    const user = await userFromAccessToken(accessToken);
    if (user?.id) return { userId: user.id, accessToken: null, refreshToken: null };
  }

  if (!refreshToken) return null;
  const refreshed = await refreshSupabaseSession(refreshToken);
  if (!refreshed?.user.id) return null;
  return {
    userId: refreshed.user.id,
    accessToken: refreshed.session.access_token,
    refreshToken: refreshed.session.refresh_token,
  };
}
