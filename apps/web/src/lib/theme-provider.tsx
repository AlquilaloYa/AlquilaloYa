"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type Theme = "light" | "dark";

/** Paletas de fondo disponibles (Configuración → Apariencia). */
export const BACKGROUND_PALETTES = [
  { id: "azul", label: "Azul (clásico)" },
  { id: "gris", label: "Gris" },
  { id: "verde", label: "Verde" },
  { id: "violeta", label: "Violeta" },
  { id: "arena", label: "Arena" },
] as const;

export type BackgroundPalette = (typeof BACKGROUND_PALETTES)[number]["id"];

const STORAGE_KEY = "sc_theme";
const BG_STORAGE_KEY = "sc_bg_palette";

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
  background: BackgroundPalette;
  setBackground: (palette: BackgroundPalette) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
  if (theme === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}

function applyBackground(palette: BackgroundPalette) {
  document.documentElement.setAttribute("data-bg", palette);
}

function initialTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function initialBackground(): BackgroundPalette {
  if (typeof window === "undefined") return "azul";
  const stored = localStorage.getItem(BG_STORAGE_KEY);
  const valid = BACKGROUND_PALETTES.some((p) => p.id === stored);
  return valid ? (stored as BackgroundPalette) : "azul";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("light");
  const [background, setBackgroundState] = useState<BackgroundPalette>("azul");

  useEffect(() => {
    setThemeState(initialTheme());
    setBackgroundState(initialBackground());
  }, []);

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    applyBackground(background);
    localStorage.setItem(BG_STORAGE_KEY, background);
  }, [background]);

  const setTheme = useCallback((next: Theme) => setThemeState(next), []);
  const toggleTheme = useCallback(
    () => setThemeState((prev) => (prev === "light" ? "dark" : "light")),
    []
  );
  const setBackground = useCallback(
    (next: BackgroundPalette) => setBackgroundState(next),
    []
  );

  return (
    <ThemeContext.Provider
      value={{ theme, toggleTheme, setTheme, background, setBackground }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme debe usarse dentro de <ThemeProvider>");
  }
  return ctx;
}
