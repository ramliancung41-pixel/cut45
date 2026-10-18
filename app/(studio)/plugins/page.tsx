import type { Metadata } from "next";
import { PluginsBoard } from "@/components/plugins-board";

export const metadata: Metadata = {
  title: "Plugins",
  description: "Turn integrated AI tools on or off.",
};

export default function Page() {
  return <PluginsBoard />;
}
