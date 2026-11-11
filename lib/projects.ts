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
  published: boolean;
  customDomain: string;
  createdAt: string;
  updatedAt: string;
};

export type ProjectError = "unavailable" | "failed" | "missing" | "slug-taken" | "domain-taken" | "publish-unavailable";

const TITLE_MAX = 80;
const BASE_COLUMNS = "id,user_id,title,slug,content_json,created_at,updated_at";
const FULL_COLUMNS = `${BASE_COLUMNS},published,custom_domain`;

export function cleanTitle(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, TITLE_MAX) : "";
}

export function cleanDomain(value: unknown) {
  if (typeof value !== "string") return "";
  const host = value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/\.$/, "");
  if (!host || host.length > 253) return "";
  if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(host)) return "";
  return host;
}

export function readDomain(value: unknown) {
  if (value == null || value === "") return { ok: true as const, domain: "" };
  if (typeof value !== "string") return { ok: false as const };
  const trimmed = value.trim();
  if (!trimmed) return { ok: true as const, domain: "" };
  const domain = cleanDomain(trimmed);
  return domain ? { ok: true as const, domain } : { ok: false as const };
}

function missingProjectsTable(message: string) {
  return /projects/i.test(message) && /does not exist|schema cache|could not find/i.test(message);
}

function publishColumnMissing(message: string) {
  return /published|custom_domain/i.test(message) && /does not exist|schema cache|could not find/i.test(message);
}

function constraintError(message: string): ProjectError | null {
  if (/projects_published_slug/i.test(message)) return "slug-taken";
  if (/projects_custom_domain/i.test(message)) return "domain-taken";
  return null;
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
    published: row.published === true,
    customDomain: cleanDomain(row.custom_domain),
    createdAt: typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : new Date().toISOString(),
  };
}

function projectsFrom(rows: unknown) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => rowToProject(row as Record<string, unknown>))
    .filter((item): item is WebsiteProject => Boolean(item));
}

export async function listProjects(userId: string) {
  try {
    const admin = createSupabaseAdminClient();
    const listed = await admin.from("projects").select(FULL_COLUMNS).eq("user_id", userId).order("updated_at", { ascending: false }).limit(50);
    if (listed.error && publishColumnMissing(listed.error.message)) {
      const basic = await admin.from("projects").select(BASE_COLUMNS).eq("user_id", userId).order("updated_at", { ascending: false }).limit(50);
      if (basic.error) return { projects: [] as WebsiteProject[], unavailable: missingProjectsTable(basic.error.message) };
      return { projects: projectsFrom(basic.data), unavailable: false };
    }
    if (listed.error) return { projects: [] as WebsiteProject[], unavailable: missingProjectsTable(listed.error.message) };
    return { projects: projectsFrom(listed.data), unavailable: false };
  } catch {
    return { projects: [] as WebsiteProject[], unavailable: true };
  }
}

export async function getProject(userId: string, id: string) {
  const admin = createSupabaseAdminClient();
  const found = await admin.from("projects").select(FULL_COLUMNS).eq("user_id", userId).eq("id", id).maybeSingle();
  if (found.error && publishColumnMissing(found.error.message)) {
    const basic = await admin.from("projects").select(BASE_COLUMNS).eq("user_id", userId).eq("id", id).maybeSingle();
    if (basic.error) return { ok: false as const, error: missingProjectsTable(basic.error.message) ? ("unavailable" as const) : ("failed" as const) };
    if (!basic.data) return { ok: true as const, project: null };
    const project = rowToProject(basic.data);
    return project ? { ok: true as const, project } : { ok: false as const, error: "failed" as const };
  }
  if (found.error) {
    return { ok: false as const, error: missingProjectsTable(found.error.message) ? ("unavailable" as const) : ("failed" as const) };
  }
  if (!found.data) return { ok: true as const, project: null };
  const project = rowToProject(found.data);
  return project ? { ok: true as const, project } : { ok: false as const, error: "failed" as const };
}

export async function getPublishedProject(slug: string) {
  const admin = createSupabaseAdminClient();
  const found = await admin.from("projects").select(FULL_COLUMNS).eq("slug", slugify(slug)).eq("published", true).maybeSingle();
  if (found.error) {
    const missing = missingProjectsTable(found.error.message) || publishColumnMissing(found.error.message);
    return { ok: false as const, error: missing ? ("unavailable" as const) : ("failed" as const) };
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

async function claimPublicAddress(input: { slug: string; domain: string; published: boolean; ignoreId?: string }) {
  if (!input.published && !input.domain) return { ok: true as const };
  const admin = createSupabaseAdminClient();
  if (input.published) {
    const existing = await admin.from("projects").select("id").eq("slug", input.slug).eq("published", true);
    if (existing.error) {
      return {
        ok: false as const,
        error: publishColumnMissing(existing.error.message) ? ("publish-unavailable" as const) : ("failed" as const),
      };
    }
    if ((existing.data ?? []).some((row) => row.id !== input.ignoreId)) return { ok: false as const, error: "slug-taken" as const };
  }
  if (input.domain) {
    const existing = await admin.from("projects").select("id").eq("custom_domain", input.domain);
    if (existing.error) {
      return {
        ok: false as const,
        error: publishColumnMissing(existing.error.message) ? ("publish-unavailable" as const) : ("failed" as const),
      };
    }
    if ((existing.data ?? []).some((row) => row.id !== input.ignoreId)) return { ok: false as const, error: "domain-taken" as const };
  }
  return { ok: true as const };
}

function writeError(message: string): ProjectError {
  return constraintError(message) ?? (missingProjectsTable(message) ? "unavailable" : publishColumnMissing(message) ? "publish-unavailable" : "failed");
}

export async function createProject(input: {
  userId: string;
  title: string;
  slug: string;
  content: WebsiteContent;
  published?: boolean;
  customDomain?: string;
}) {
  const reserved = await uniqueSlug(input.userId, input.slug);
  if (!reserved.ok) return reserved;
  const published = input.published === true;
  const customDomain = input.customDomain ?? "";
  const claimed = await claimPublicAddress({ slug: reserved.slug, domain: customDomain, published });
  if (!claimed.ok) return claimed;
  const admin = createSupabaseAdminClient();
  const row = {
    user_id: input.userId,
    title: input.title,
    slug: reserved.slug,
    content_json: input.content,
    published,
    custom_domain: customDomain || null,
  };
  const saved = await admin.from("projects").insert(row).select(FULL_COLUMNS).single();
  if (saved.error && publishColumnMissing(saved.error.message) && !published && !customDomain) {
    const basic = await admin
      .from("projects")
      .insert({ user_id: row.user_id, title: row.title, slug: row.slug, content_json: row.content_json })
      .select(BASE_COLUMNS)
      .single();
    if (basic.error || !basic.data) {
      return { ok: false as const, error: basic.error ? writeError(basic.error.message) : ("failed" as const) };
    }
    const project = rowToProject(basic.data);
    return project ? { ok: true as const, project } : { ok: false as const, error: "failed" as const };
  }
  if (saved.error || !saved.data) {
    return { ok: false as const, error: saved.error ? writeError(saved.error.message) : ("failed" as const) };
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
  published?: boolean;
  customDomain?: string;
}) {
  const reserved = await uniqueSlug(input.userId, input.slug, input.id);
  if (!reserved.ok) return reserved;
  const published = input.published === true;
  const customDomain = input.customDomain ?? "";
  const claimed = await claimPublicAddress({ slug: reserved.slug, domain: customDomain, published, ignoreId: input.id });
  if (!claimed.ok) return claimed;
  const admin = createSupabaseAdminClient();
  const saved = await admin
    .from("projects")
    .update({
      title: input.title,
      slug: reserved.slug,
      content_json: input.content,
      published,
      custom_domain: customDomain || null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", input.userId)
    .eq("id", input.id)
    .select(FULL_COLUMNS)
    .maybeSingle();
  if (saved.error && publishColumnMissing(saved.error.message) && !published && !customDomain) {
    const basic = await admin
      .from("projects")
      .update({
        title: input.title,
        slug: reserved.slug,
        content_json: input.content,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", input.userId)
      .eq("id", input.id)
      .select(BASE_COLUMNS)
      .maybeSingle();
    if (basic.error) return { ok: false as const, error: writeError(basic.error.message) };
    if (!basic.data) return { ok: false as const, error: "missing" as const };
    const project = rowToProject(basic.data);
    return project ? { ok: true as const, project } : { ok: false as const, error: "failed" as const };
  }
  if (saved.error) return { ok: false as const, error: writeError(saved.error.message) };
  if (!saved.data) return { ok: false as const, error: "missing" as const };
  const project = rowToProject(saved.data);
  return project ? { ok: true as const, project } : { ok: false as const, error: "failed" as const };
}

export function contentForSave(value: unknown) {
  return sanitizeWebsiteContent(value, templateContent("studio"));
}
