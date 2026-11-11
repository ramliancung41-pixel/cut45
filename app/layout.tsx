import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { CreditProvider } from "@/components/credit-provider";
import { SITE_ORIGIN } from "@/lib/site";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  title: {
    default: "Cut45",
    template: "%s · Cut45",
  },
  description: "Build and publish landing pages with Cut45.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-background font-sans text-foreground antialiased">
        <CreditProvider>{children}</CreditProvider>
      </body>
    </html>
  );
}
