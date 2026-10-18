import type { Metadata } from "next";
import { Suspense } from "react";
import { AgentStudioPage } from "@/components/agent-studio";

export const metadata: Metadata = {
  title: "Agent",
  description: "Chat with the Cut45 Co-Pilot and generate images and videos on one canvas.",
};

export default function AgentPage() {
  return (
    <Suspense fallback={null}>
      <AgentStudioPage />
    </Suspense>
  );
}
