const MoonIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="h-4 w-4"
  >
    <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
  </svg>
);

const SunIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="h-4 w-4"
  >
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2" />
    <path d="M12 20v2" />
    <path d="m4.93 4.93 1.41 1.41" />
    <path d="m17.66 17.66 1.41 1.41" />
    <path d="M2 12h2" />
    <path d="M20 12h2" />
    <path d="m6.34 17.66-1.41 1.41" />
    <path d="m19.07 4.93-1.41 1.41" />
  </svg>
);

export type ThemeMode = "light" | "dark";

export interface ThemeToggleProps {
  theme: ThemeMode;
  onToggle: () => void;
  className?: string;
  showLabel?: boolean;
}

/**
 * Botón accesible para alternar el tema. Es controlado (no depende de un
 * proveedor de tema concreto) para poder reutilizarse en cualquier app.
 */
function ThemeToggle({
  theme,
  onToggle,
  className,
  showLabel = false,
}: ThemeToggleProps) {
  const label = theme === "light" ? "Activar modo oscuro" : "Activar modo claro";
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label="Cambiar tema"
      title={label}
      className={className}
    >
      {theme === "light" ? <MoonIcon /> : <SunIcon />}
      {showLabel ? <span>{theme === "light" ? "Modo oscuro" : "Modo claro"}</span> : null}
    </button>
  );
}

export { MoonIcon, SunIcon, ThemeToggle };
