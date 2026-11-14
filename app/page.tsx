import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LandingHome } from "@/components/landing-home";
import { StudioDashboard } from "@/components/studio-dashboard";
import { SUPABASE_ACCESS_COOKIE, SUPABASE_REFRESH_COOKIE } from "@/lib/auth-cookie";
import { userFromAccessToken } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: {
    absolute: "Cut45 — AI Website Builder",
  },
  description:
    "Design landing pages in the studio, with templates, a builder, and saved assets.",
};

type LandingSearch = Record<string, string | string[] | undefined>;

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LandingPage({
  searchParams,
}: {
  searchParams: Promise<LandingSearch>;
}) {
  const params = await searchParams;
  const code = firstParam(params.code);
  const tokenHash = firstParam(params.token_hash);
  const type = firstParam(params.type);
  const authError = firstParam(params.error_description) || firstParam(params.error);
  if (code || tokenHash || type === "signup" || type === "email" || authError) {
    const target = new URLSearchParams();
    if (code) target.set("code", code);
    if (tokenHash) target.set("token_hash", tokenHash);
    if (type) target.set("type", type);
    if (authError) target.set("error_description", authError.slice(0, 240));
    redirect(`/login?${target.toString()}`);
  }

  const jar = await cookies();
  const accessToken = jar.get(SUPABASE_ACCESS_COOKIE)?.value;
  const refreshToken = jar.get(SUPABASE_REFRESH_COOKIE)?.value;
  if (accessToken) {
    const user = await userFromAccessToken(accessToken).catch(() => null);
    if (user) return <StudioDashboard />;
  } else if (refreshToken) {
    redirect("/dashboard");
  }
  return <LandingHome />;
}
