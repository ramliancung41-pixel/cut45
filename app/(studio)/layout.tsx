import { AppShell } from "@/components/app-shell";
import { VoiceProvider } from "@/components/use-default-voice";

export default function StudioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <VoiceProvider>
      <AppShell>{children}</AppShell>
    </VoiceProvider>
  );
}
