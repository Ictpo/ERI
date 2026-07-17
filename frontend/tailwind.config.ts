import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        // Display serif — wordmark + headings only; body/tables/controls
        // stay on Inter (BRANDING.md Step 2).
        display: ["var(--font-newsreader)", "Georgia", "serif"],
      },
      colors: {
        // ┌───────────────────────────────────────────────────────────────┐
        // │ HEADS UP: `indigo-*` IS NOT INDIGO IN THIS APP.               │
        // │ This block overrides Tailwind's built-in indigo scale with    │
        // │ the Eri brand rose ramp, so every existing `indigo-*` class   │
        // │ (~40 places) renders rose with zero component edits.          │
        // │ Primary #D6266F / hover #A81A57. See BRANDING.md Step 1.      │
        // │ Chart colors are NOT themed here — categorical data uses the  │
        // │ colorblind-safe Okabe–Ito palette in lib/palette.ts.          │
        // └───────────────────────────────────────────────────────────────┘
        indigo: {
          50: "#FCF0F6",
          100: "#FBE0EE",
          200: "#F6C6DD",
          300: "#EF9EC3",
          400: "#E76AA1",
          500: "#E23B80", // focus rings
          600: "#D6266F", // primary — buttons, active
          700: "#A81A57", // hover
          800: "#851445",
          900: "#611033", // text on soft bg
        },
        accent: {
          DEFAULT: "#D6266F",
          hover: "#A81A57",
          soft: "#FCF0F6",
        },
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in-right": {
          from: { transform: "translateX(100%)" },
          to: { transform: "translateX(0)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.2s ease-out",
        "slide-in-right": "slide-in-right 0.25s ease-out",
      },
    },
  },
  plugins: [],
};
export default config;
