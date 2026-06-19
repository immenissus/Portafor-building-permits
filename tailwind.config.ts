import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        background: "#FAFAF8"
      },
      fontFamily: {
        sans: ["var(--font-geist)", "Inter", "sans-serif"]
      },
      boxShadow: {
        tactile: "0 1px 2px rgba(28, 25, 23, 0.06)"
      }
    }
  },
  plugins: [require("tailwindcss-animate")]
};

export default config;
