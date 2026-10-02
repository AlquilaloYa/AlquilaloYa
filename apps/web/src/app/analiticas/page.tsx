"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { DashboardShell } from "@/components/dashboard-shell";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@contract/ui/components/card";
import { AlertTriangle, LoaderCircle } from "lucide-react";

const PERSONAS = [
  { key: "miguel", nombre: "Miguel", color: "bg-emerald-600" },
  { key: "emely", nombre: "Emely", color: "bg-amber-500" },
  { key: "evelin", nombre: "Evelyn", color: "bg-sky-600" },
] as const;

type PersonaKey = (typeof PERSONAS)[number]["key"];
type Categoria = "mensualidad" | "mantenimiento" | "penalidad";
type Base = "cuota" | "pago";
type Vista = "acumulado" | "mes-en-curso" | "por-fecha-pago";

const VISTAS = [
  {
    key: "acumulado",
    label: "Acumulado",
    base: "cuota",
    ayuda: "Cada canon se suma en el mes de su cuota, de enero a diciembre.",
  },
  {
    key: "mes-en-curso",
    label: "Mes en curso",
    base: "pago",
    ayuda: "Solo lo pagado durante este mes. Sube conforme registras pagos.",
  },
  {
    key: "por-fecha-pago",
    label: "Por fecha de pago",
    base: "pago",
    ayuda: "Agrupa cada pago en el mes en que se registró.",
  },
] as const satisfies { key: Vista; label: string; base: Base; ayuda: string }[];

const CATEGORIAS: { key: Categoria; label: string; corto: string }[] = [
  { key: "mensualidad", label: "Mensualidad", corto: "Mensualidad" },
  { key: "mantenimiento", label: "Mantenimiento", corto: "Mantenimiento" },
  { key: "penalidad", label: "Penalidades", corto: "Penal." },
];

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

type PorPersona = Record<PersonaKey, number>;

interface AnaliticasData {
  year: number;
  month: number | null;
  base: Base;
  meses: ({ mes: string; indice: number } & Record<Categoria, PorPersona>)[];
  totales: Record<Categoria, PorPersona>;
  vendedores: {
    key: PersonaKey;
    nombre: string;
    clientes: {
      clienteId: string;
      cliente: string;
      total: number;
      contratos: {
        codigoContrato: string;
        departamento: string | null;
        periodos: string[];
        total: number;
      }[];
    }[];
  }[];
}

const money = (value: number) =>
  value.toLocaleString("es-PE", { style: "currency", currency: "PEN", maximumFractionDigits: 0 });

export default function AnaliticasPage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState<number | "todos">("todos");
  const [vista, setVista] = useState<Vista>("acumulado");
  const [categoria, setCategoria] = useState<Categoria>("mensualidad");
  const [data, setData] = useState<AnaliticasData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actualizado, setActualizado] = useState<Date | null>(null);

  const vistaActual = VISTAS.find((item) => item.key === vista) ?? VISTAS[0];
  const enCurso = vista === "mes-en-curso";
  const petición = useRef(0);

  const cargar = useCallback(
    async (silencioso = false) => {
      const id = ++petición.current;
      if (!silencioso) {
        setLoading(true);
        setError("");
      }
      const params = new URLSearchParams({ year: String(year), base: vistaActual.base });
      if (enCurso) params.set("month", "actual");
      else if (month !== "todos") params.set("month", String(month));
      try {
        const response = await apiFetch(`/api/analiticas-cobranza?${params.toString()}`);
        if (!response.ok) throw new Error("No se pudieron cargar las analíticas de cobranza.");
        const resultado = (await response.json()) as AnaliticasData;
        if (id !== petición.current) return;
        setData(resultado);
        setActualizado(new Date());
        setError("");
      } catch (err) {
        if (id !== petición.current) return;
        if (!silencioso) {
          setError(err instanceof Error ? err.message : "Ocurrió un error al cargar los datos.");
        }
      } finally {
        if (!silencioso && id === petición.current) setLoading(false);
      }
    },
    [year, month, vistaActual.base, enCurso]
  );

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // En "Mes en curso" los totales suben solos conforme se registran pagos.
  useEffect(() => {
    if (!enCurso) return;
    const id = setInterval(() => void cargar(true), 60_000);
    return () => clearInterval(id);
  }, [enCurso, cargar]);

  const meses = data?.meses ?? [];
  const mesActual = data?.month ?? new Date().getMonth() + 1;
  const alcance = enCurso
    ? `Mes en curso · ${MESES[mesActual - 1]} ${data?.year ?? year}`
    : month === "todos"
      ? `Todo el año ${year}`
      : `${MESES[month - 1]} ${year}`;
  const maxValor = Math.max(
    1,
    ...meses.flatMap((fila) => PERSONAS.map(({ key }) => fila[categoria][key] ?? 0))
  );
  const years = Array.from({ length: 6 }, (_, index) => new Date().getFullYear() - index);

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-headline-lg">Analíticas de cobranza</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Lo cobrado por cada responsable en {alcance}
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              Mes
              <select
                className="h-10 rounded-md border border-input bg-background px-3 disabled:cursor-not-allowed disabled:opacity-50"
                value={enCurso ? "todos" : month === "todos" ? "todos" : String(month)}
                disabled={enCurso}
                onChange={(event) =>
                  setMonth(event.target.value === "todos" ? "todos" : Number(event.target.value))
                }
                aria-label="Seleccionar mes de cobranza"
              >
                <option value="todos">Todo el año</option>
                {MESES.map((nombre, indice) => (
                  <option key={nombre} value={indice + 1}>{nombre}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm font-medium">
              Año
              <select
                className="h-10 rounded-md border border-input bg-background px-3 disabled:cursor-not-allowed disabled:opacity-50"
                value={year}
                disabled={enCurso}
                onChange={(event) => setYear(Number(event.target.value))}
                aria-label="Seleccionar año de cobranza"
              >
                {years.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            {enCurso ? (
              <button
                onClick={() => void cargar(true)}
                className="rounded-md border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
              >
                Actualizar
              </button>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">Vista:</span>
          {VISTAS.map((item) => (
            <button
              key={item.key}
              onClick={() => setVista(item.key)}
              aria-pressed={vista === item.key}
              title={item.ayuda}
              className={
                "rounded-full border px-3 py-1 text-sm font-medium transition-colors " +
                (vista === item.key
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:bg-muted")
              }
            >
              {item.label}
            </button>
          ))}
          <span className="text-sm text-muted-foreground">{vistaActual.ayuda}</span>
          {enCurso && actualizado ? (
            <span className="text-sm text-muted-foreground">
              · Actualiza solo cada minuto
            </span>
          ) : null}
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          {PERSONAS.map((persona) => {
            const mensualidad = data?.totales.mensualidad[persona.key] ?? 0;
            const mantenimiento = data?.totales.mantenimiento[persona.key] ?? 0;
            const penalidad = data?.totales.penalidad[persona.key] ?? 0;
            return (
              <Card key={persona.key}>
                <CardHeader className="border-b border-border">
                  <div className="flex items-start justify-between gap-3">
                    <CardTitle className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-sm ${persona.color}`} />
                      {persona.nombre}
                    </CardTitle>
                    <span className="text-right text-sm font-semibold">
                      {money(mensualidad + mantenimiento + penalidad)}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-1 pt-4 text-sm">
                  {CATEGORIAS.map((item) => (
                    <div key={item.key} className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">{item.label}</span>
                      <span className="font-medium tabular-nums">{money(data?.totales[item.key][persona.key] ?? 0)}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-4">
            <div>
              <CardTitle>Cobrado por mes · {alcance}</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Cada barra es lo que cobró esa persona · {vistaActual.label.toLowerCase()}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {CATEGORIAS.map((item) => (
                <button
                  key={item.key}
                  onClick={() => setCategoria(item.key)}
                  aria-pressed={categoria === item.key}
                  className={
                    "rounded-full border px-3 py-1 text-sm font-medium transition-colors " +
                    (categoria === item.key
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border text-muted-foreground hover:bg-muted")
                  }
                >
                  {item.label}
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex h-64 items-center justify-center text-muted-foreground" role="status">
                <LoaderCircle className="mr-2 h-5 w-5 animate-spin" /> Cargando ingresos...
              </div>
            ) : error ? (
              <div className="flex min-h-48 items-center justify-center gap-2 text-destructive" role="alert">
                <AlertTriangle className="h-5 w-5" /> {error}
              </div>
            ) : meses.every((fila) => PERSONAS.every(({ key }) => (fila[categoria][key] ?? 0) === 0)) ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                No hay {CATEGORIAS.find((item) => item.key === categoria)?.label.toLowerCase()} cobrada en {alcance}.
              </p>
            ) : (
              <div className="overflow-x-auto pb-2">
                <div
                  className={
                    meses.length === 1
                      ? "grid min-w-[320px] grid-cols-1 gap-4"
                      : "grid min-w-[760px] grid-cols-12 gap-2"
                  }
                  role="img"
                  aria-label={`${CATEGORIAS.find((item) => item.key === categoria)?.label} cobrada en ${alcance}, por responsable`}
                >
                  {meses.map((fila) => (
                    <div key={fila.mes} className="flex h-56 min-w-0 flex-col items-center justify-end">
                      <div className="flex h-48 w-full items-end justify-center gap-1 border-b border-border px-0.5">
                        {PERSONAS.map((persona) => {
                          const amount = fila[categoria][persona.key] ?? 0;
                          const height = amount > 0 ? Math.max(2, (amount / maxValor) * 100) : 0;
                          return (
                            <div
                              key={persona.key}
                              className={`w-full max-w-5 rounded-t-sm ${persona.color}`}
                              style={{ height: `${height}%` }}
                              title={`${persona.nombre}, ${fila.mes}: ${money(amount)}`}
                              aria-label={`${persona.nombre}, ${fila.mes}: ${money(amount)}`}
                            />
                          );
                        })}
                      </div>
                      <span className="mt-2 text-xs text-muted-foreground">{fila.mes}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <section aria-labelledby="deudas-title" className="space-y-3">
          <div>
            <h2 id="deudas-title" className="font-headline-md">Deudas pendientes por responsable</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Cuotas pendientes con vencimiento hasta el mes actual, acumuladas de todo el año
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            {PERSONAS.map((persona) => {
              const vendedor = data?.vendedores.find(({ key }) => key === persona.key);
              const clientes = vendedor?.clientes ?? [];
              const total = clientes.reduce((suma, cliente) => suma + cliente.total, 0);
              return (
                <Card key={persona.key}>
                  <CardHeader className="border-b border-border">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle>{persona.nombre}</CardTitle>
                        <p className="mt-1 text-sm text-muted-foreground">{clientes.length} clientes</p>
                      </div>
                      <span className="text-right text-sm font-semibold">{money(total)}</span>
                    </div>
                  </CardHeader>
                  <CardContent className="max-h-[440px] overflow-y-auto p-0">
                    {loading ? (
                      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
                        <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> Cargando...
                      </div>
                    ) : error ? (
                      <p className="p-5 text-sm text-muted-foreground">No se pudo cargar el detalle.</p>
                    ) : clientes.length === 0 ? (
                      <p className="p-5 text-sm text-muted-foreground">Sin deudas pendientes.</p>
                    ) : (
                      <ul className="divide-y divide-border">
                        {clientes.map((cliente) => (
                          <li key={cliente.clienteId} className="space-y-2 p-4">
                            <div className="flex items-start justify-between gap-3">
                              <Link
                                href={`/contratos/clientes/${cliente.clienteId}`}
                                className="font-medium text-primary hover:underline"
                                title="Ver perfil del cliente"
                              >
                                {cliente.cliente || "Cliente sin nombre"}
                              </Link>
                              <span className="shrink-0 text-sm font-semibold">{money(cliente.total)}</span>
                            </div>
                            {cliente.contratos.map((contrato) => (
                              <div key={contrato.codigoContrato} className="text-xs text-muted-foreground">
                                <div className="flex flex-wrap justify-between gap-x-2">
                                  <span>{contrato.codigoContrato}{contrato.departamento ? ` · ${contrato.departamento}` : ""}</span>
                                  <span>{money(contrato.total)}</span>
                                </div>
                                <p className="mt-1">Períodos: {contrato.periodos.map((periodo) => periodo.slice(0, 7)).join(", ")}</p>
                              </div>
                            ))}
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}