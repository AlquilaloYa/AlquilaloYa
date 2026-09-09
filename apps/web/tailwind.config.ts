import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        "on-primary": "hsl(var(--on-primary))",
        "on-secondary": "hsl(var(--on-secondary))",
        "on-error": "hsl(var(--on-error))",
        "on-surface": "hsl(var(--on-surface))",
        "on-surface-variant": "hsl(var(--on-surface-variant))",
        "on-background": "hsl(var(--on-background))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--on-primary))",
          "on-primary": "hsl(var(--on-primary))",
          container: "hsl(var(--primary-container))",
          "container-foreground": "hsl(var(--on-primary-container))",
          "fixed-dim": "hsl(var(--primary-fixed-dim))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--on-secondary))",
          "on-secondary": "hsl(var(--on-secondary))",
          container: "hsl(var(--secondary-container))",
          "container-foreground": "hsl(var(--on-secondary-container))",
        },
        tertiary: {
          container: "hsl(var(--tertiary-container))",
          "container-foreground": "hsl(var(--on-tertiary-container))",
        },
        error: {
          DEFAULT: "hsl(var(--error))",
          foreground: "hsl(var(--on-error))",
          "on-error": "hsl(var(--on-error))",
          container: "hsl(var(--error-container))",
          "container-foreground": "hsl(var(--on-error-container))",
        },
        surface: {
          DEFAULT: "hsl(var(--surface))",
          foreground: "hsl(var(--on-surface))",
          "on-surface": "hsl(var(--on-surface))",
          dim: "hsl(var(--surface-dim))",
          bright: "hsl(var(--surface-bright))",
          variant: "hsl(var(--surface-variant))",
          "variant-foreground": "hsl(var(--on-surface-variant))",
          "on-surface-variant": "hsl(var(--on-surface-variant))",
          "container-lowest": "hsl(var(--surface-container-lowest))",
          "container-low": "hsl(var(--surface-container-low))",
          container: "hsl(var(--surface-container))",
          "container-high": "hsl(var(--surface-container-high))",
          "container-highest": "hsl(var(--surface-container-highest))",
        },
        outline: {
          DEFAULT: "hsl(var(--outline))",
          variant: "hsl(var(--outline-variant))",
        },
        inverse: {
          surface: "hsl(var(--inverse-surface))",
          "on-surface": "hsl(var(--inverse-on-surface))",
          primary: "hsl(var(--inverse-primary))",
        },
        background: {
          DEFAULT: "hsl(var(--background))",
          foreground: "hsl(var(--on-background))",
          "on-background": "hsl(var(--on-background))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        destructive: {
          DEFAULT: "hsl(var(--error))",
          foreground: "hsl(var(--on-error))",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
        geist: ["var(--font-geist)", "var(--font-inter)", "sans-serif"],
      },
      spacing: {
        gutter: "16px",
        "container-padding": "24px",
      },
      borderRadius: {
        DEFAULT: "0.5rem",
        lg: "0.25rem",
        xl: "0.5rem",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [animate],
};

export default config;