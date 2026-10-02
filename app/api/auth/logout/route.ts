import { NextResponse } from "next/server";
import { clearSupabaseCookies } from "@/lib/auth-cookie";

export const dynamic = "force-dynamic";

export async function POST() {
  return clearSupabaseCookies(NextResponse.json({ ok: true }));
}
