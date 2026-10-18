import type { Metadata } from "next";
import { WorkflowsBoard } from "@/components/workflows-board";

export const metadata: Metadata = {
  title: "Workflows",
  description: "Automated creation templates that run prompt chains in the Agent.",
};

export default function Page() {
  return <WorkflowsBoard />;
}
