import type { Metadata } from "next";
import ObsViewer from "@/components/ObsViewer";

export const metadata: Metadata = {
  title: "FaceTime Live Output",
  robots: { index: false, follow: false, noarchive: true },
};

export default async function ObsOutputPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ObsViewer token={token} />;
}
