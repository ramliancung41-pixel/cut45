import type { Metadata } from "next";
import { AgencyServices } from "@/components/agency-services";

export const metadata: Metadata = {
  title: "Agency",
  description: "Request a landing page, multi-page site, or custom Next.js app from the Cut45 agency.",
};

export default function AgencyPage() {
  return <AgencyServices active="agency" />;
}
