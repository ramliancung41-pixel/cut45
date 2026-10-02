import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Create with Cut45",
  description: "Create a Cut45 account or sign in to the studio.",
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
