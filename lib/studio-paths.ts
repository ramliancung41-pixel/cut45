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

export function isRetiredBuilderPath(pathname: string) {
  return STUDIO_PATHS.some((path) => path !== "/credits" && path !== "/settings" && (pathname === path || pathname.startsWith(`${path}/`)));
}

export function isStudioPath(pathname: string) {
  return STUDIO_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
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
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/news-podcast";
  const path = pathOnly(next);
  const search = searchOf(next);
  if (path === "/news-podcast" || path.startsWith("/news-podcast/")) return `${path}${search}`;
  if (path === "/credits" || path.startsWith("/credits/") || path === "/settings" || path.startsWith("/settings/")) return `${path}${search}`;
  return "/news-podcast";
}
