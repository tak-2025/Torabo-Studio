/** @type {import('tailwindcss').Config} */
import trac from "tailwindcss-react-aria-components";
import contQueries from "@tailwindcss/container-queries";
import daisyui from "daisyui";

export default {
  content: ["./index.html", "./download.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui"],
        keycap: ["Inter", "system-ui"],
      },
      fontSize: {
        // Isolated tiny size for keycap header labels (was the global `xs` bug).
        keycap: "0.4rem",
        // Fluid heading sizes (defined here; applied in a later phase).
        "fluid-lg": ["clamp(1rem, 0.9rem + 0.5vw, 1.25rem)", { lineHeight: "1.4" }],
        "fluid-xl": ["clamp(1.15rem, 1rem + 0.8vw, 1.5rem)", { lineHeight: "1.3" }],
      },
    },
  },
  plugins: [contQueries, trac({ prefix: "rac" }), daisyui],
  daisyui: {
    themes: [
      {
        "torabo-light": {
          primary: "oklch(49.12% 0.3096 285.75)",
          "primary-content": "oklch(0.89824 0.06192 285.75)",
          secondary: "oklch(69.71% 0.329 342.55)",
          accent: "oklch(76.76% 0.184 183.61)",
          "base-content": "#1f2937",
          "base-100": "oklch(100% 0 0)",
          "base-200": "#F2F2F2",
          "base-300": "#E5E6E6",
        },
        "torabo-dark": {
          primary: "oklch(65.69% 0.196 285.75)",
          "primary-content": "oklch(0.13138 0.0392 285.75)",
          secondary: "oklch(74.8% 0.26 342.55)",
          accent: "oklch(74.51% 0.167 183.61)",
          "base-content": "#A6ADBB",
          "base-100": "#1d232a",
          "base-200": "#191e24",
          "base-300": "#15191e",
        },
      },
    ],
    darkTheme: "torabo-dark",
    logs: false,
  },
};
