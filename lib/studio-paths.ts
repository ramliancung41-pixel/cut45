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

export function studioDestination(next: string | null) {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/dashboard";
  if (isBuilderAlias(next)) return "/builder";
  if (isStudioPath(next)) return next;
  return "/dashboard";
}
