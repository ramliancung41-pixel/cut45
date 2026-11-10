import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_ACCESS_COOKIE } from "@/lib/auth-cookie";
import { rowToCharacter, storeCharacterImage } from "@/lib/saved-characters";
import { createSupabaseAdminClient, userFromAccessToken } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const accessToken = request.cookies.get(SUPABASE_ACCESS_COOKIE)?.value ?? "";
  const user = accessToken ? await userFromAccessToken(accessToken) : null;
  if (!user?.id) return NextResponse.json({ success: false, error: "Sign in to save a character." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as {
    characterName?: unknown;
    tempFalUrl?: unknown;
  } | null;
  const characterName = typeof body?.characterName === "string" ? body.characterName.trim().slice(0, 80) : "";
  const tempFalUrl = typeof body?.tempFalUrl === "string" ? body.tempFalUrl.trim() : "";
  if (characterName.length < 1) {
    return NextResponse.json({ success: false, error: "Name the character first." }, { status: 400 });
  }
  if (!tempFalUrl.startsWith("https://") && !tempFalUrl.startsWith("data:image/")) {
    return NextResponse.json({ success: false, error: "That character image cannot be saved." }, { status: 400 });
  }

  const stored = await storeCharacterImage(user.id, tempFalUrl);
  if ("error" in stored) return NextResponse.json({ success: false, error: stored.error }, { status: 502 });

  const admin = createSupabaseAdminClient();
  const saved = await admin
    .from("characters")
    .insert({
      user_id: user.id,
      name: characterName,
      character_image_url: stored.characterImageUrl,
    })
    .select("id,user_id,name,character_image_url,created_at")
    .single();
  if (saved.error || !saved.data) {
    return NextResponse.json({ success: false, error: "The character could not be saved." }, { status: 500 });
  }
  const character = rowToCharacter(saved.data);
  if (!character) return NextResponse.json({ success: false, error: "The character could not be saved." }, { status: 500 });
  return NextResponse.json({ success: true, character });
}
