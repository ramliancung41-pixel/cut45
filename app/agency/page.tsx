import type { Metadata } from "next";
import { AgencyPage } from "@/components/agency-page";

export const metadata: Metadata = {
  title: "Agency",
  description: "Custom Next.js apps, tailored design, fast turnaround, and SEO, plus a form to request a website.",
};

export default function AgencyRoute() {
  return <AgencyPage />;
}
