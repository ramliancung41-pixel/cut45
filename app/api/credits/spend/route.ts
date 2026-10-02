import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_ACCESS_COOKIE } from "@/lib/auth-cookie";
import { generationCreditCost } from "@/lib/credits";
import { spendProfileCredits } from "@/lib/profiles";
import { userFromAccessToken } from "@/lib/supabase/server";
import { isVisualEngineId } from "@/lib/visual-engines";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const accessToken = request.cookies.get(SUPABASE_ACCESS_COOKIE)?.value ?? "";
  const user = accessToken ? await userFromAccessToken(accessToken) : null;
  if (!user?.email) {
    return NextResponse.json({ error: "Sign in before spending credits." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    engine?: unknown;
    imageToVideo?: unknown;
  } | null;
  const engine = typeof body?.engine === "string" ? body.engine : "";
  const imageToVideo = body?.imageToVideo === true;
  if (!isVisualEngineId(engine)) {
    return NextResponse.json({ error: "Select a visual engine." }, { status: 400 });
  }

  const cost = generationCreditCost(engine, imageToVideo && engine !== "stock");
  const credits = await spendProfileCredits(user.id, user.email, cost);
  if (credits == null) {
    return NextResponse.json({ error: "Could not update the credit balance." }, { status: 500 });
  }
  return NextResponse.json({ credits, tokens: credits, charged: cost });
}
