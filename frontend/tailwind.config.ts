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
        // ┌───────────────────────────────────────────────────────────────┐
        // │ `slate-*` IS NOT SLATE EITHER — it's the Eri warm neutral     │
        // │ ramp. The identity system calls for neutrals "warmed off the  │
        // │ cold slate of stock UI"; overriding the scale rewarms every   │
        // │ existing slate-* class with no component edits.               │
        // │                                                               │
        // │ Every step is pinned to Tailwind slate's ORIGINAL lightness   │
        // │ (L*), so all pre-existing contrast decisions survive — only   │
        // │ the hue moves. 50/100/200/900 are the identity's published    │
        // │ Paper/Surface/Border/Ink verbatim.                            │
        // │                                                               │
        // │ 500 deviates deliberately: the published Muted #8C7A72 is     │
        // │ 3.81:1 on Paper — under the 4.5:1 AA floor, and slate-500 is  │
        // │ used for body-secondary text all over the app. #7F6D65 is the │
        // │ same hue at slate-500's lightness => 4.57:1. Accessibility    │
        // │ wins over an exact token match.                               │
        // └───────────────────────────────────────────────────────────────┘
        slate: {
          50: "#FBF6F2", // Paper    (identity)
          100: "#F5ECE6", // Surface  (identity)
          200: "#ECDFD6", // Border   (identity)
          300: "#E3D0C8",
          400: "#B79C91",
          500: "#7F6D65", // Muted, darkened to hold AA (see above)
          600: "#645047",
          700: "#4C3D36",
          800: "#312621",
          900: "#211619", // Ink text (identity)
          950: "#0C0709", // Ink black (identity) — dark base
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
