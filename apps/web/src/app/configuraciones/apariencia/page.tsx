"use client";

import { DashboardShell } from "@/components/dashboard-shell";
import { useTheme, BACKGROUND_PALETTES } from "@/lib/theme-provider";
import { Check, Moon, Sun } from "lucide-react";

const PREVIEW: Record<string, { light: string; dark: string }> = {
  azul: { light: "#eef1ff", dark: "#030f1f" },
  gris: { light: "#f0f1f3", dark: "#14161a" },
  verde: { light: "#f1faf6", dark: "#0c1712" },
  violeta: { light: "#f5f1fc", dark: "#120d1b" },
  arena: { light: "#faf6ee", dark: "#1b1710" },
};

export default function AparienciaPage() {
  const { theme, setTheme, background, setBackground } = useTheme();

  return (
    <DashboardShell>
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h2 className="mb-1 font-headline-lg text-primary">Apariencia</h2>
          <p className="max-w-2xl font-body-sm text-on-surface-variant">
            Personaliza el aspecto del sistema. El color de fondo no afecta el
            contraste del texto, así que todo sigue legible en modo claro y oscuro.
          </p>
        </div>

        <div className="rounded-lg bg-surface-container-lowest p-6">
          <h3 className="mb-1 font-headline-md text-on-surface">Tema</h3>
          <p className="mb-4 font-body-sm text-on-surface-variant">
            Elige entre modo claro y oscuro. Por defecto el sistema sigue la
            preferencia de tu dispositivo.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setTheme("light")}
              className={`inline-flex items-center gap-2 rounded-lg border px-4 py-3 font-label-md transition ${
                theme === "light"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-outline-variant text-on-surface-variant hover:bg-surface-container"
              }`}
            >
              <Sun className="h-4 w-4" />
              Claro
              {theme === "light" ? <Check className="h-4 w-4" /> : null}
            </button>
            <button
              type="button"
              onClick={() => setTheme("dark")}
              className={`inline-flex items-center gap-2 rounded-lg border px-4 py-3 font-label-md transition ${
                theme === "dark"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-outline-variant text-on-surface-variant hover:bg-surface-container"
              }`}
            >
              <Moon className="h-4 w-4" />
              Oscuro
              {theme === "dark" ? <Check className="h-4 w-4" /> : null}
            </button>
          </div>
        </div>

        <div className="rounded-lg bg-surface-container-lowest p-6">
          <h3 className="mb-1 font-headline-md text-on-surface">Color de fondo</h3>
          <p className="mb-4 font-body-sm text-on-surface-variant">
            Se aplica a las superficies del sistema de forma instantánea y se
            guarda en este dispositivo.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            {BACKGROUND_PALETTES.map((palette) => {
              const activo = background === palette.id;
              const preview = PREVIEW[palette.id] ?? PREVIEW.azul!;
              return (
                <button
                  key={palette.id}
                  type="button"
                  onClick={() => setBackground(palette.id)}
                  aria-pressed={activo}
                  className={`rounded-lg border p-3 text-left transition ${
                    activo
                      ? "border-primary ring-2 ring-primary/30"
                      : "border-outline-variant hover:bg-surface-container"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="h-8 w-8 rounded-full border border-outline-variant"
                      style={{ backgroundColor: theme === "dark" ? preview.dark : preview.light }}
                    />
                    <span className="font-label-md text-on-surface">{palette.label}</span>
                    {activo ? <Check className="ml-auto h-4 w-4 text-primary" /> : null}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
