export const AGENCY_PACKAGES = [
  {
    id: "starter",
    name: "Starter Web Package",
    price: "$99",
    detail: "A single landing page that is ready to share.",
    points: ["Single landing page", "Mobile responsive", "Fast hosting"],
  },
  {
    id: "business",
    name: "Business Studio Package",
    price: "$299",
    detail: "A multi-page site with search and a way for clients to write in.",
    points: ["Multi-page website", "Custom SEO", "Contact form"],
  },
  {
    id: "custom",
    name: "Custom AI Web App Package",
    price: "$499+",
    detail: "A custom Next.js app shaped around the product.",
    points: ["Full custom dynamic Next.js solution"],
  },
] as const;

export type AgencyPackageId = (typeof AGENCY_PACKAGES)[number]["id"];

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function agencyPackage(id: unknown) {
  return AGENCY_PACKAGES.find((item) => item.id === id) ?? null;
}

export function cleanAgencyRequest(value: {
  name?: unknown;
  email?: unknown;
  packageId?: unknown;
  message?: unknown;
  company?: unknown;
}) {
  if (typeof value.company === "string" && value.company.trim()) return { ok: true as const, ignored: true as const };
  const name = typeof value.name === "string" ? value.name.replace(/\s+/g, " ").trim().slice(0, 80) : "";
  const email = typeof value.email === "string" ? value.email.trim().toLowerCase().slice(0, 120) : "";
  const message = typeof value.message === "string" ? value.message.replace(/\s+/g, " ").trim().slice(0, 2000) : "";
  const pack = agencyPackage(value.packageId);
  if (!name || !EMAIL.test(email) || !message || !pack) return { ok: false as const };
  return { ok: true as const, ignored: false as const, request: { name, email, packageId: pack.id, packageName: pack.name, message } };
}
