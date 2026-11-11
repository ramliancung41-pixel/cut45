import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_ACCESS_COOKIE } from "@/lib/auth-cookie";
import { cleanTitle, contentForSave, getProject, readDomain, updateProject, type ProjectError } from "@/lib/projects";
import { userFromAccessToken } from "@/lib/supabase/server";
import { slugify } from "@/lib/website-content";

export const dynamic = "force-dynamic";

const PROJECT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function signedInUser(request: NextRequest) {
  const accessToken = request.cookies.get(SUPABASE_ACCESS_COOKIE)?.value ?? "";
  if (!accessToken) return null;
  const user = await userFromAccessToken(accessToken);
  return user?.id ? user : null;
}

function failure(kind: ProjectError) {
  if (kind === "unavailable") {
    return NextResponse.json(
      { error: "The projects table is not ready. Run supabase/projects.sql in the Supabase SQL editor." },
      { status: 503 },
    );
  }
  if (kind === "publish-unavailable") {
    return NextResponse.json(
      { error: "Publishing needs the extra project columns. Run supabase/agency.sql in the Supabase SQL editor." },
      { status: 503 },
    );
  }
  if (kind === "slug-taken") {
    return NextResponse.json({ error: "That public address is already used. Choose another slug." }, { status: 409 });
  }
  if (kind === "domain-taken") {
    return NextResponse.json({ error: "That domain is already connected to another site." }, { status: 409 });
  }
  if (kind === "missing") return NextResponse.json({ error: "That website was not found." }, { status: 404 });
  return NextResponse.json({ error: "The website could not be saved." }, { status: 500 });
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await signedInUser(request);
  if (!user) return NextResponse.json({ error: "Sign in to open this website." }, { status: 401 });
  const { id } = await context.params;
  if (!PROJECT_ID.test(id)) return NextResponse.json({ error: "That website was not found." }, { status: 404 });
  const found = await getProject(user.id, id);
  if (!found.ok) return failure(found.error);
  if (!found.project) return failure("missing");
  return NextResponse.json({ project: found.project });
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await signedInUser(request);
  if (!user) return NextResponse.json({ error: "Sign in to save this website." }, { status: 401 });
  const { id } = await context.params;
  if (!PROJECT_ID.test(id)) return NextResponse.json({ error: "That website was not found." }, { status: 404 });
  const current = await getProject(user.id, id);
  if (!current.ok) return failure(current.error);
  if (!current.project) return failure("missing");

  const body = (await request.json().catch(() => null)) as {
    title?: unknown;
    slug?: unknown;
    content?: unknown;
    published?: unknown;
    customDomain?: unknown;
  } | null;
  const title = cleanTitle(body?.title) || current.project.title;
  const slug = slugify(typeof body?.slug === "string" && body.slug.trim() ? body.slug : current.project.slug);
  const content = contentForSave(body?.content ?? current.project.content);
  if (!content) return NextResponse.json({ error: "Use an image from your asset library." }, { status: 400 });
  const domain = body && "customDomain" in body ? readDomain(body.customDomain) : { ok: true as const, domain: current.project.customDomain };
  if (!domain.ok) return NextResponse.json({ error: "Enter a domain like client.com." }, { status: 400 });
  const published = typeof body?.published === "boolean" ? body.published : current.project.published;
  const saved = await updateProject({
    userId: user.id,
    id,
    title,
    slug,
    content,
    published,
    customDomain: domain.domain,
  });
  if (!saved.ok) return failure(saved.error);
  return NextResponse.json({ project: saved.project });
}
