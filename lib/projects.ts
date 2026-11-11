import { createSupabaseAdminClient } from "@/lib/supabase/server";
import {
  parseWebsiteContent,
  sanitizeWebsiteContent,
  slugify,
  templateContent,
  type WebsiteContent,
} from "@/lib/website-content";

export type WebsiteProject = {
  id: string;
  userId: string;
  title: string;
  slug: string;
  content: WebsiteContent;
  createdAt: string;
  updatedAt: string;
};

const TITLE_MAX = 80;

export function cleanTitle(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, TITLE_MAX) : "";
}

function missingProjectsTable(message: string) {
  return /projects/i.test(message) && /does not exist|schema cache|could not find/i.test(message);
}

function rowToProject(row: Record<string, unknown>): WebsiteProject | null {
  const id = typeof row.id === "string" ? row.id : "";
  const userId = typeof row.user_id === "string" ? row.user_id : "";
  const title = cleanTitle(row.title);
  const slug = typeof row.slug === "string" ? slugify(row.slug) : "";
  if (!id || !userId || !title || !slug) return null;
  return {
    id,
    userId,
    title,
    slug,
    content: parseWebsiteContent(row.content_json, templateContent("studio")),
    createdAt: typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : new Date().toISOString(),
  };
}

export async function listProjects(userId: string) {
  try {
    const admin = createSupabaseAdminClient();
    const listed = await admin
      .from("projects")
      .select("id,user_id,title,slug,content_json,created_at,updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(50);
    if (listed.error) {
      return { projects: [] as WebsiteProject[], unavailable: missingProjectsTable(listed.error.message) };
    }
    return {
      projects: (listed.data ?? []).map((row) => rowToProject(row)).filter((item): item is WebsiteProject => Boolean(item)),
      unavailable: false,
    };
  } catch {
    return { projects: [] as WebsiteProject[], unavailable: true };
  }
}

export async function getProject(userId: string, id: string) {
  const admin = createSupabaseAdminClient();
  const found = await admin
    .from("projects")
    .select("id,user_id,title,slug,content_json,created_at,updated_at")
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();
  if (found.error) {
    return { ok: false as const, error: missingProjectsTable(found.error.message) ? ("unavailable" as const) : ("failed" as const) };
  }
  if (!found.data) return { ok: true as const, project: null };
  const project = rowToProject(found.data);
  return project ? { ok: true as const, project } : { ok: false as const, error: "failed" as const };
}

async function uniqueSlug(userId: string, slug: string, ignoreId?: string) {
  const admin = createSupabaseAdminClient();
  const base = slugify(slug);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base.slice(0, 54)}-${attempt + 1}`;
    const existing = await admin.from("projects").select("id").eq("user_id", userId).eq("slug", candidate).maybeSingle();
    if (existing.error) {
      return { ok: false as const, error: missingProjectsTable(existing.error.message) ? ("unavailable" as const) : ("failed" as const) };
    }
    if (!existing.data || existing.data.id === ignoreId) return { ok: true as const, slug: candidate };
  }
  return { ok: false as const, error: "failed" as const };
}

export async function createProject(input: { userId: string; title: string; slug: string; content: WebsiteContent }) {
  const reserved = await uniqueSlug(input.userId, input.slug);
  if (!reserved.ok) return reserved;
  const admin = createSupabaseAdminClient();
  const saved = await admin
    .from("projects")
    .insert({
      user_id: input.userId,
      title: input.title,
      slug: reserved.slug,
      content_json: input.content,
    })
    .select("id,user_id,title,slug,content_json,created_at,updated_at")
    .single();
  if (saved.error || !saved.data) {
    return { ok: false as const, error: saved.error && missingProjectsTable(saved.error.message) ? ("unavailable" as const) : ("failed" as const) };
  }
  const project = rowToProject(saved.data);
  return project ? { ok: true as const, project } : { ok: false as const, error: "failed" as const };
}

export async function updateProject(input: {
  userId: string;
  id: string;
  title: string;
  slug: string;
  content: WebsiteContent;
}) {
  const reserved = await uniqueSlug(input.userId, input.slug, input.id);
  if (!reserved.ok) return reserved;
  const admin = createSupabaseAdminClient();
  const saved = await admin
    .from("projects")
    .update({
      title: input.title,
      slug: reserved.slug,
      content_json: input.content,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", input.userId)
    .eq("id", input.id)
    .select("id,user_id,title,slug,content_json,created_at,updated_at")
    .maybeSingle();
  if (saved.error) {
    return { ok: false as const, error: missingProjectsTable(saved.error.message) ? ("unavailable" as const) : ("failed" as const) };
  }
  if (!saved.data) return { ok: false as const, error: "missing" as const };
  const project = rowToProject(saved.data);
  return project ? { ok: true as const, project } : { ok: false as const, error: "failed" as const };
}

export function contentForSave(value: unknown) {
  return sanitizeWebsiteContent(value, templateContent("studio"));
}
