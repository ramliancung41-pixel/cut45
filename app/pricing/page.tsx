import type { Metadata } from "next";
import { PricingPackages } from "@/components/pricing-packages";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Starter Web at $99, Business Studio at $299, and Custom AI Web App from $499, with a feature comparison and FAQ.",
};

export default function PricingPage() {
  return <PricingPackages />;
}
