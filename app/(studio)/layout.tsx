import { Sora } from "next/font/google";
import { AppShell } from "@/components/app-shell";

const sora = Sora({
  subsets: ["latin"],
  variable: "--font-studio",
});

export default function StudioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={`${sora.variable} studio-type`}>
      <AppShell>{children}</AppShell>
    </div>
  );
}
