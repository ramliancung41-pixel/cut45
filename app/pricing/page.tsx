import type { Metadata } from "next";
import { PublicPricing } from "@/components/public-pricing";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Cut45 credit packs and what a 45-second AI video story costs on the Standard, Pro, and Premium tiers.",
};

export default function PricingPage() {
  return <PublicPricing />;
}
