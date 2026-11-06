import { Inter, Space_Grotesk } from "next/font/google";

const heading = Space_Grotesk({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-lumen-heading",
});

const body = Inter({
  subsets: ["latin"],
  variable: "--font-lumen-body",
});

export const lumenFonts = `${heading.variable} ${body.variable}`;
