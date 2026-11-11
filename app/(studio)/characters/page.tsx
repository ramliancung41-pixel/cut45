import type { Metadata } from "next";
import { CharacterLibrary } from "@/components/character-library";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = {
  title: "Characters",
  description: "Saved character images in your studio library.",
};

export default function CharactersPage() {
  return (
    <div className="gen-stage">
      <PageHeader
        eyebrow="Library"
        title="Character Library"
        description="Characters you save stay in Supabase storage and can be reused on a page."
      />
      <CharacterLibrary />
    </div>
  );
}
