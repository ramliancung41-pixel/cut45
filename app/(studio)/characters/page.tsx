import type { Metadata } from "next";
import { CharacterLibrary } from "@/components/character-library";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = {
  title: "Characters",
  description: "Saved characters for Cut45 image-to-video.",
};

export default function CharactersPage() {
  return (
    <div className="gen-stage">
      <PageHeader
        eyebrow="Library"
        title="Character Library"
        description="Every character you save stays here. Use one on the next video so Wan keeps the same face and clothes."
      />
      <CharacterLibrary />
    </div>
  );
}
