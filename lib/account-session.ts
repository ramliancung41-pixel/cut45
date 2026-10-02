export async function hasAccountSession() {
  try {
    const response = await fetch("/api/auth/session");
    const payload = (await response.json()) as { user?: { email?: string } | null };
    return Boolean(payload.user?.email);
  } catch {
    return false;
  }
}
