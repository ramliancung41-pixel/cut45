export const SITE_ORIGIN = "https://app.codeandbuild.tech";

export function authRedirectUrl() {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  const origin =
    typeof window !== "undefined" ? window.location.origin : configured || SITE_ORIGIN;
  return `${origin}/login`;
}
