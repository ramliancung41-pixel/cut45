import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { GalleryBoard } from "@/components/gallery-board";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = {
  title: "Gallery",
  description: "Archive of generated Cut45 shorts.",
};

export default function GalleryPage() {
  return (
    <AppShell>
      <div className="gen-stage">
      <PageHeader
        eyebrow="Archive"
        title="Gallery"
        description="Every finished run stays here with its prompt, length, and visual engine. Replay the narration or download the clip file."
      />
      <GalleryBoard />
      </div>
    </AppShell>
  );
}
