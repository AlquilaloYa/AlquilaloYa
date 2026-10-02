"use client";

import { useEffect, useState } from "react";
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

const BASES = [
  {
    key: "cuota",
    label: "Por cuota",
    ayuda: "Cada canon se suma en el mes al que corresponde la cuota.",
  },
  {
    key: "pago",
    label: "Por fecha de pago",
    ayuda: "Se suma en el mes en que se registró el pago.",
  },
] as const satisfies { key: Base; label: string; ayuda: string }[];

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
  const [base, setBase] = useState<Base>("cuota");
  const [categoria, setCategoria] = useState<Categoria>("mensualidad");
  const [data, setData] = useState<AnaliticasData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let activo = true;
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ year: String(year), base });
    if (month !== "todos") params.set("month", String(month));
    apiFetch(`/api/analiticas-cobranza?${params.toString()}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("No se pudieron cargar las analíticas de cobranza.");
        return (await response.json()) as AnaliticasData;
      })
      .then((resultado) => {
        if (activo) setData(resultado);
      })
      .catch((err: unknown) => {
        if (activo) setError(err instanceof Error ? err.message : "Ocurrió un error al cargar los datos.");
      })
      .finally(() => {
        if (activo) setLoading(false);
      });
return () => {
      activo = false;
    };
  }, [year, month, base]);

  const meses = data?.meses ?? [];
  const alcance = month === "todos" ? `Todo el año ${year}` : `${MESES[month - 1]} ${year}`;
  const baseActual = BASES.find((item) => item.key === base) ?? BASES[0];
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
                className="h-10 rounded-md border border-input bg-background px-3"
                value={month === "todos" ? "todos" : String(month)}
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
                className="h-10 rounded-md border border-input bg-background px-3"
                value={year}
                onChange={(event) => setYear(Number(event.target.value))}
                aria-label="Seleccionar año de cobranza"
              >
                {years.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">Contar por:</span>
          {BASES.map((item) => (
            <button
              key={item.key}
              onClick={() => setBase(item.key)}
              aria-pressed={base === item.key}
              title={item.ayuda}
              className={
                "rounded-full border px-3 py-1 text-sm font-medium transition-colors " +
                (base === item.key
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:bg-muted")
              }
            >
              {item.label}
            </button>
          ))}
          <span className="text-sm text-muted-foreground">{baseActual.ayuda}</span>
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
                Cada barra es lo que cobró esa persona · {baseActual.label.toLowerCase()}
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