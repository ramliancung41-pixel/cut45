import type { Metadata } from "next";
import { VideoGenerationTest } from "@/components/video-generation-test";

export const metadata: Metadata = {
  title: "Video generation test",
  description: "Test Gemini script, ElevenLabs voice, and Fal video in one pass.",
};

export default function VideoTestPage() {
  return <VideoGenerationTest />;
}
