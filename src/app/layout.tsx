import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FaceTime — Real-time Character Experience",
  description: "A simple real-time character experience.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body className="antialiased min-h-screen">{children}</body></html>;
}
