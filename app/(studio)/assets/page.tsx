import type { Metadata } from "next";
import { AssetsBoard } from "@/components/assets-board";

export const metadata: Metadata = {
  title: "Assets",
  description: "Your uploads, references, clips, images, and voiceovers.",
};

export default function Page() {
  return <AssetsBoard />;
}
