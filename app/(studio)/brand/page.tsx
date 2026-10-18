import type { Metadata } from "next";
import { BrandBoard } from "@/components/brand-board";

export const metadata: Metadata = {
  title: "Brand Kit",
  description: "Logos, palettes, and default visual styles for on-brand generations.",
};

export default function Page() {
  return <BrandBoard />;
}
