const STUDIO_PATHS = [
  "/dashboard",
  "/builder",
  "/templates",
  "/create",
  "/generator",
  "/create-video",
  "/credits",
  "/gallery",
  "/characters",
  "/settings",
  "/editor",
  "/agent",
  "/workflows",
  "/plugins",
  "/assets",
  "/brand",
] as const;

export function isStudioPath(pathname: string) {
  return STUDIO_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

function isBuilderAlias(next: string) {
  return (
    next === "/create-video" ||
    next.startsWith("/create-video/") ||
    next === "/create" ||
    next.startsWith("/create/") ||
    next === "/generator" ||
    next.startsWith("/generator/") ||
    next === "/editor" ||
    next.startsWith("/editor/") ||
    next === "/agent" ||
    next.startsWith("/agent/")
  );
}

function pathOnly(next: string) {
  const query = next.indexOf("?");
  return query === -1 ? next : next.slice(0, query);
}

function searchOf(next: string) {
  const query = next.indexOf("?");
  return query === -1 ? "" : next.slice(query);
}

export function studioDestination(next: string | null) {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/dashboard";
  const path = pathOnly(next);
  const search = searchOf(next);
  if (isBuilderAlias(path)) return `/builder${search}`;
  if (isStudioPath(path)) return `${path}${search}`;
  return "/dashboard";
}
