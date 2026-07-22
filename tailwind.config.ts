import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        background: "#0f172a",
        foreground: "#e2e8f0",
        surface: "#111827",
        border: "#334155",
        accent: "#38bdf8",
      },
    },
  },
  plugins: [],
};

export default config;
