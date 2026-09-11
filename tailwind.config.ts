import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "1rem",
      screens: { "2xl": "1280px" },
    },
    extend: {
      colors: {
        primary: {
          DEFAULT: "#1a73e8",
          foreground: "#ffffff",
          container: "#d3e3fd",
          onContainer: "#041e49",
        },
        secondary: { DEFAULT: "#34a853", foreground: "#ffffff" },
        tertiary: { DEFAULT: "#fbbc04", foreground: "#000000" },
        breaking: { DEFAULT: "#ea4335", container: "#fce8e6" },
        success: "#34a853",
        warning: "#fbbc04",
        error: "#ea4335",
        surface: {
          light: "rgba(255, 255, 255, 0.72)",
          "light-variant": "rgba(255, 255, 255, 0.56)",
          dark: "rgba(30, 30, 30, 0.8)",
          "dark-variant": "rgba(60, 60, 60, 0.6)",
          "on-light": "#1f1f1f",
          "on-light-variant": "#444746",
          "on-dark": "#e3e3e3",
        },
      },
      fontFamily: {
        bangla: ["SolaimanLipi", "Times New Roman", "serif"],
        english: ["Times New Roman", "serif"],
      },
      screens: {
        tablet: "640px",
        desktop: "1024px",
        wide: "1280px",
      },
      borderRadius: {
        glass: "16px",
      },
      boxShadow: {
        glass:
          "0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03), inset 0 1px 0 rgba(255, 255, 255, 0.2)",
        "glass-dark":
          "0 4px 6px -1px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.05)",
        "card-hover":
          "0 20px 25px -5px rgba(0, 0, 0, 0.08), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
      },
      backdropBlur: {
        glass: "20px",
        nav: "24px",
      },
      keyframes: {
        fadeSlideUp: {
          from: { opacity: "0", transform: "translateY(20px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "200% 0" },
          "100%": { backgroundPosition: "-200% 0" },
        },
        ticker: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
      },
      animation: {
        fadeSlideUp: "fadeSlideUp 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
        shimmer: "shimmer 1.5s infinite",
        ticker: "ticker 30s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
