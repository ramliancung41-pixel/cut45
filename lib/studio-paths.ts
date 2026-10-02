const STUDIO_PATHS = [
  "/dashboard",
  "/create",
  "/generator",
  "/create-video",
  "/credits",
  "/gallery",
  "/settings",
] as const;

export function isStudioPath(pathname: string) {
  return STUDIO_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export function studioDestination(next: string | null) {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/generator";
  if (next === "/create-video" || next.startsWith("/create-video/")) return "/generator";
  if (next === "/create" || next.startsWith("/create/")) return "/generator";
  if (isStudioPath(next)) return next;
  return "/generator";
}
