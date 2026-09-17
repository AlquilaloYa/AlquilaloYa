import { Search, X } from "lucide-react";

export function BusquedaInput({
  value,
  onChange,
  placeholder = "Buscar…",
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={`relative flex h-9 items-center ${className ?? ""}`}>
      <Search className="pointer-events-none absolute left-2.5 h-4 w-4 text-muted-foreground" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-8 text-sm outline-none transition-colors focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute right-1.5 rounded p-0.5 text-muted-foreground hover:text-on-surface"
          title="Limpiar búsqueda"
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}

/**
 * Ordena una copia del array por la columna indicada. Compara de forma
 * insensible a mayúsculas; números se comparan numéricamente.
 */
export function ordenarColumna<T>(
  filas: readonly T[],
  clave: string,
  dir: "asc" | "desc",
  valor: (f: T) => string | number | null | undefined
): T[] {
  const copia = [...filas];
  copia.sort((a, b) => {
    const va = valor(a);
    const vb = valor(b);
    let cmp: number;
    if (typeof va === "number" && typeof vb === "number") {
      cmp = va - vb;
    } else {
      cmp = String(va ?? "").localeCompare(String(vb ?? ""), "es", {
        numeric: true,
        sensitivity: "base",
      });
    }
    return dir === "asc" ? cmp : -cmp;
  });
  return copia;
}

/**
 * Filtra por texto libre buscando en los campos indicados de cada fila.
 */
export function filtrarFilas<T>(
  filas: readonly T[],
  texto: string,
  campos: (f: T) => (string | number | null | undefined)[]
): T[] {
  const q = texto.trim().toLowerCase();
  if (!q) return [...filas];
  return filas.filter((f) =>
    campos(f).some((c) => String(c ?? "").toLowerCase().includes(q))
  );
}