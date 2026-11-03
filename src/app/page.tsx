"use client";

import dynamic from "next/dynamic";

// All sections use browser APIs; disable SSR for the entire app
const App = dynamic(() => import("@/components/App"), { ssr: false });

export default function Page() {
  return <App />;
}
