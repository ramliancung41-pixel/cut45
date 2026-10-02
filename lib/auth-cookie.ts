import { NextResponse } from "next/server";

const WEEK_SECONDS = 60 * 60 * 24 * 7;

export const SUPABASE_ACCESS_COOKIE = "sb-access-token";
export const SUPABASE_REFRESH_COOKIE = "sb-refresh-token";

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge,
    secure: process.env.NODE_ENV === "production",
  };
}

export function withSupabaseCookies(
  response: NextResponse,
  accessToken: string,
  refreshToken: string,
) {
  response.cookies.set(SUPABASE_ACCESS_COOKIE, accessToken, cookieOptions(WEEK_SECONDS));
  response.cookies.set(SUPABASE_REFRESH_COOKIE, refreshToken, cookieOptions(WEEK_SECONDS));
  return response;
}

export function clearSupabaseCookies(response: NextResponse) {
  const expired = cookieOptions(0);
  response.cookies.set(SUPABASE_ACCESS_COOKIE, "", expired);
  response.cookies.set(SUPABASE_REFRESH_COOKIE, "", expired);
  return response;
}
