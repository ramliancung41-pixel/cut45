import type { Metadata } from "next";
import { AgencyServices } from "@/components/agency-services";

export const metadata: Metadata = {
  title: "Agency services",
  description: "Starter, Business, and Custom website packages, plus a form to request a site from the agency.",
};

export default function PricingPage() {
  return <AgencyServices active="pricing" />;
}
