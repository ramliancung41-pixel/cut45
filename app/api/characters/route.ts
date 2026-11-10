import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_ACCESS_COOKIE } from "@/lib/auth-cookie";
import { rowToCharacter, type SavedCharacter } from "@/lib/saved-characters";
import { createSupabaseAdminClient, userFromAccessToken } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const accessToken = request.cookies.get(SUPABASE_ACCESS_COOKIE)?.value ?? "";
  const user = accessToken ? await userFromAccessToken(accessToken) : null;
  if (!user?.id) return NextResponse.json({ error: "Sign in to use your character library." }, { status: 401 });
  const admin = createSupabaseAdminClient();
  const listed = await admin
    .from("characters")
    .select("id,user_id,name,character_image_url,created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(40);
  if (listed.error) return NextResponse.json({ error: "Could not load the character library." }, { status: 500 });
  return NextResponse.json({
    characters: (listed.data ?? []).map((row) => rowToCharacter(row)).filter((item): item is SavedCharacter => Boolean(item)),
  });
}
