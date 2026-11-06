"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";
import { INVENTARIO_MUEBLERIA, type GrupoChecklist } from "@/lib/catalogos";
import { LoaderCircle } from "lucide-react";

interface DepartamentoRowApi {
  id: string;
  codigo: string;
  nombre: string;
  piso: number;
  tipo: string;
}

/** Vista que se abre al escanear el QR del inventario de un departamento. */
export default function InventarioQrVista() {
  const params = useParams<{ id: string }>();
  const id = typeof params.id === "string" ? params.id : "";
  const { user, loading: authLoading } = useAuth();
  const [depto, setDepto] = useState<DepartamentoRowApi | null>(null);
  const [grupos, setGrupos] = useState<GrupoChecklist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const [resDep, resInv] = await Promise.all([
        apiFetch("/api/departamentos"),
        apiFetch("/api/inventarios"),
      ]);
      if (!resDep.ok) throw new Error("No se pudo cargar el departamento (¿sesión iniciada?).");
      const deps = (await resDep.json()) as DepartamentoRowApi[];
      const d = deps.find((row) => row.id === id);
      if (!d) throw new Error("Departamento no encontrado.");
      setDepto(d);
      if (resInv.ok) {
        const inv = (await resInv.json()) as {
          porDepartamento: Record<string, string[]>;
        };
        const items = inv.porDepartamento?.[id] ?? [];
        const visto = new Set(items);
        const grupos: GrupoChecklist[] = INVENTARIO_MUEBLERIA.map((grupo) => ({
          categoria: grupo.categoria,
          items: grupo.items.filter(([itemId]) => visto.has(itemId)),
        })).filter((g) => g.items.length > 0);
        const custom = [
          ...new Set(items.filter((i) => i.startsWith("CUSTOM:")).map((i) => i.trim())),
        ];
        if (custom.length > 0) {
          grupos.push({
            categoria: "Adicionales",
            items: custom.map((c) => [c, c.replace("CUSTOM:", "")] as [string, string]),
          });
        }
        setGrupos(grupos);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ocurrió un error al cargar.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!authLoading && user) void cargar();
  }, [authLoading, user, cargar]);

  const total = grupos.reduce((s, g) => s + g.items.length, 0);

  return (
    <div className="mx-auto min-h-screen max-w-2xl bg-surface px-4 py-8 text-on-surface">
      {authLoading ? (
        <div className="flex h-40 items-center justify-center text-muted-foreground">
          <LoaderCircle className="mr-2 h-5 w-5 animate-spin" /> Verificando sesión…
        </div>
      ) : !user ? (
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-8 text-center">
          <h1 className="font-headline-lg">Inventario con QR</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Inicia sesión con tu cuenta de AlquilaYa para ver el inventario del departamento.
          </p>
          <Link
            href="/login"
            className="mt-4 inline-block rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:opacity-90"
          >
            Iniciar sesión
          </Link>
        </div>
      ) : loading ? (
        <div className="flex h-40 items-center justify-center text-muted-foreground">
          <LoaderCircle className="mr-2 h-5 w-5 animate-spin" /> Cargando inventario…
        </div>
      ) : error ? (
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-8 text-center text-sm text-destructive">
          {error}
        </div>
      ) : depto ? (
        <div className="space-y-5">
          <div>
            <p className="text-sm text-muted-foreground">Inventario AlquilaYa</p>
            <h1 className="font-headline-lg">{depto.codigo}</h1>
            <p className="text-sm text-muted-foreground">
              {depto.nombre || "—"} · {depto.tipo} · piso {depto.piso} · {total}{" "}
              {total === 1 ? "bien" : "bienes"}
            </p>
          </div>
          {total === 0 ? (
            <p className="text-sm text-muted-foreground">
              Este departamento no tiene bienes registrados todavía.
            </p>
          ) : (
            grupos.map((grupo) => (
              <section
                key={grupo.categoria}
                className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4"
              >
                <h2 className="font-headline-sm font-semibold text-primary">
                  {grupo.categoria}
                </h2>
                <ul className="mt-2 space-y-1 text-sm">
                  {grupo.items.map(([itemId, etiqueta]) => (
                    <li key={itemId} className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                      {etiqueta}
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
          <p className="text-xs text-muted-foreground">
            Vista de consulta · el detalle editable está en el ERP → Departamentos.
          </p>
        </div>
      ) : null}
    </div>
  );
}
