import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        surface: "#0f1117",
        panel: "#1a1d27",
        border: "#2a2d3a",
        accent: "#6366f1",
        "accent-dim": "#4f46e5",
        ok: "#22c55e",
        warn: "#f59e0b",
        err: "#ef4444",
        muted: "#6b7280",
      },
    },
  },
  plugins: [],
};

export default config;
