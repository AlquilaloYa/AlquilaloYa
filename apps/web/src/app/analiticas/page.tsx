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

interface AnaliticasData {
  year: number;
  meses: { mes: string; valores: Record<(typeof PERSONAS)[number]["key"], number> }[];
  vendedores: {
    key: (typeof PERSONAS)[number]["key"];
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
  const [data, setData] = useState<AnaliticasData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let activo = true;
    setLoading(true);
    setError("");
    apiFetch(`/api/analiticas-cobranza?year=${year}`)
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
  }, [year]);

  const maxIngreso = Math.max(
    1,
    ...(data?.meses.flatMap((mes) => PERSONAS.map(({ key }) => mes.valores[key])) ?? [1]),
  );
  const years = Array.from({ length: 6 }, (_, index) => new Date().getFullYear() - index);

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-headline-lg">Analíticas de cobranza</h1>
            <p className="mt-1 text-sm text-muted-foreground">Ingresos recibidos y deudas pendientes por responsable</p>
          </div>
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

        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-4">
            <div>
              <CardTitle>Ingresos mensuales · {year}</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">Montos cobrados en cada mes</p>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {PERSONAS.map((persona) => (
                <span key={persona.key} className="inline-flex items-center gap-2 text-sm">
                  <span className={`h-2.5 w-2.5 rounded-sm ${persona.color}`} />
                  {persona.nombre}
                </span>
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
            ) : (
              <div className="overflow-x-auto pb-2">
                <div className="grid min-w-[760px] grid-cols-12 gap-2" role="img" aria-label={`Ingresos mensuales de ${year}, comparados por responsable`}>
                  {data?.meses.map((mes) => (
                    <div key={mes.mes} className="flex h-56 min-w-0 flex-col items-center justify-end">
                      <div className="flex h-48 w-full items-end justify-center gap-1 border-b border-border px-0.5">
                        {PERSONAS.map((persona) => {
                          const amount = mes.valores[persona.key];
                          const height = amount > 0 ? Math.max(2, (amount / maxIngreso) * 100) : 0;
                          return (
                            <div
                              key={persona.key}
                              className={`w-full max-w-5 rounded-t-sm ${persona.color}`}
                              style={{ height: `${height}%` }}
                              title={`${persona.nombre}, ${mes.mes}: ${money(amount)}`}
                              aria-label={`${persona.nombre}, ${mes.mes}: ${money(amount)}`}
                            />
                          );
                        })}
                      </div>
                      <span className="mt-2 text-xs text-muted-foreground">{mes.mes}</span>
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
            <p className="mt-1 text-sm text-muted-foreground">Cuotas pendientes con vencimiento hasta el mes actual</p>
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