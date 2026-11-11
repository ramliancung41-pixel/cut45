import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_ACCESS_COOKIE } from "@/lib/auth-cookie";
import { cleanTitle, contentForSave, createProject, listProjects } from "@/lib/projects";
import { userFromAccessToken } from "@/lib/supabase/server";
import { slugify, templateContent, templateTitle } from "@/lib/website-content";

export const dynamic = "force-dynamic";

async function signedInUser(request: NextRequest) {
  const accessToken = request.cookies.get(SUPABASE_ACCESS_COOKIE)?.value ?? "";
  if (!accessToken) return null;
  const user = await userFromAccessToken(accessToken);
  return user?.id ? user : null;
}

function failure(kind: "unavailable" | "failed" | "missing") {
  if (kind === "unavailable") {
    return NextResponse.json(
      { error: "The projects table is not ready. Run supabase/projects.sql in the Supabase SQL editor." },
      { status: 503 },
    );
  }
  if (kind === "missing") return NextResponse.json({ error: "That website was not found." }, { status: 404 });
  return NextResponse.json({ error: "The website could not be saved." }, { status: 500 });
}

export async function GET(request: NextRequest) {
  const user = await signedInUser(request);
  if (!user) return NextResponse.json({ error: "Sign in to see your websites." }, { status: 401 });
  const listed = await listProjects(user.id);
  if (listed.unavailable) return failure("unavailable");
  return NextResponse.json({ projects: listed.projects });
}

export async function POST(request: NextRequest) {
  const user = await signedInUser(request);
  if (!user) return NextResponse.json({ error: "Sign in to save a website." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as {
    title?: unknown;
    slug?: unknown;
    template?: unknown;
    content?: unknown;
  } | null;
  const template = typeof body?.template === "string" ? body.template : "studio";
  const fallback = templateContent(template);
  const title = cleanTitle(body?.title) || templateTitle(template);
  const content = contentForSave(body?.content ?? fallback);
  if (!content) return NextResponse.json({ error: "Use an image from your asset library." }, { status: 400 });
  const slug = slugify(typeof body?.slug === "string" && body.slug.trim() ? body.slug : title);
  const saved = await createProject({ userId: user.id, title, slug, content });
  if (!saved.ok) return failure(saved.error);
  return NextResponse.json({ project: saved.project });
}
