"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { DashboardShell } from "@/components/dashboard-shell";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { AccessControl, Permission } from "@contract/domain/rbac";
import { evaluarDiasExtras, MAX_DIAS_EXTRAS } from "@/lib/dias-extras-policy";
import { CalendarClock, RefreshCw } from "lucide-react";

type ContractOption = {
  id: string;
  codigoContrato: string;
  clienteNombre: string;
  apellidoCliente: string;
  departamentoNombre: string;
  fechaFin: string;
  estado: string;
  montoCanonMensual: string;
};

type DiasExtra = {
  id: string;
  contractId: string;
  codigoContrato: string;
  clienteId: string;
  clienteNombre: string | null;
  clienteApellidos: string | null;
  departamentoNombre: string | null;
  dias: number;
  monto: string;
  fechaFinPeriodo: string;
  estado: "PENDIENTE" | "PAGADO";
  fechaPago: string | null;
};

function fechaLegible(fecha: string | null | undefined): string {
  if (!fecha) return "—";
  const [year, month, day] = fecha.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

function moneda(monto: string | number): string {
  return Number(monto).toLocaleString("es-PE", { style: "currency", currency: "PEN" });
}

export default function DiasExtrasPage() {
  const { user } = useAuth();
  const puedeGestionar = user
    ? AccessControl.forRole(user.role, user.additionalPermissions).can(Permission.CONTRACT_UPDATE)
    : false;
  const [contratos, setContratos] = useState<ContractOption[]>([]);
  const [cargos, setCargos] = useState<DiasExtra[]>([]);
  const [contractId, setContractId] = useState("");
  const [dias, setDias] = useState("1");
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [actualizandoId, setActualizandoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [contractsResponse, chargesResponse] = await Promise.all([
        apiFetch("/api/contracts"),
        apiFetch("/api/dias-extras"),
      ]);
      const [contractsBody, chargesBody] = await Promise.all([
        contractsResponse.json(),
        chargesResponse.json(),
      ]);
      if (!contractsResponse.ok) throw new Error(contractsBody.error ?? "No se pudieron cargar los contratos");
      if (!chargesResponse.ok) throw new Error(chargesBody.error ?? "No se pudieron cargar los cargos de días extras");
      const validStates = new Set(["FIRMADO", "NOTARIADO", "ACTIVO", "VIGENTE"]);
      setContratos((contractsBody as ContractOption[]).filter((contract) => validStates.has(contract.estado)));
      setCargos(chargesBody as DiasExtra[]);
    } catch (loadError) {
      setError((loadError as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const contratoSeleccionado = contratos.find((contract) => contract.id === contractId) ?? null;
  const diasSolicitados = Number(dias);
  const cargosPeriodo = useMemo(
    () => cargos.filter((charge) => charge.contractId === contractId && charge.fechaFinPeriodo === contratoSeleccionado?.fechaFin),
    [cargos, contractId, contratoSeleccionado?.fechaFin],
  );
  const diasYaRegistrados = cargosPeriodo.reduce((sum, charge) => sum + charge.dias, 0);
  const politicaDias = evaluarDiasExtras(diasSolicitados, diasYaRegistrados);
  const monto = politicaDias.monto;

  async function registrar() {
    if (!contractId || !politicaDias.permitido) return;
    setGuardando(true);
    setError(null);
    try {
      const response = await apiFetch("/api/dias-extras", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contractId, dias: diasSolicitados }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "No se pudieron registrar los días extras");
      const taskSyncWarning =
        typeof body.taskSyncWarning === "string" ? body.taskSyncWarning : null;
      setDias("1");
      await load();
      if (taskSyncWarning) setError(taskSyncWarning);
    } catch (saveError) {
      setError((saveError as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  async function actualizarEstado(charge: DiasExtra) {
    setActualizandoId(charge.id);
    setError(null);
    try {
      const response = await apiFetch(`/api/dias-extras/${charge.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado: charge.estado === "PAGADO" ? "PENDIENTE" : "PAGADO" }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "No se pudo actualizar el estado del cobro");
      await load();
    } catch (updateError) {
      setError((updateError as Error).message);
    } finally {
      setActualizandoId(null);
    }
  }

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <CalendarClock className="h-6 w-6 text-primary" />
          <h1 className="font-headline-lg text-2xl font-bold">Días extras</h1>
          <button type="button" onClick={() => void load()} className="ml-auto rounded-md border p-2 text-muted-foreground hover:bg-muted" aria-label="Actualizar">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
        <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
          El cliente puede extender su estadía de 1 a 7 días por S/ 100 diarios. El cargo se registra en Cobranza al final del período vigente. Para más días, crea una Adenda con el prorrateo correspondiente.
        </p>

        {puedeGestionar ? (
          <section className="space-y-4 rounded-xl border p-4">
            <h2 className="font-semibold">Registrar días adicionales</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="text-sm">
                <span className="mb-1 block">Contrato</span>
                <select value={contractId} onChange={(event) => setContractId(event.target.value)} className="h-10 w-full rounded-md border bg-background px-3">
                  <option value="">Selecciona un contrato</option>
                  {contratos.map((contract) => (
                    <option key={contract.id} value={contract.id}>
                      {contract.codigoContrato} · {contract.clienteNombre} {contract.apellidoCliente}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block">Días extra (máximo {MAX_DIAS_EXTRAS} por período)</span>
                <input type="number" min={1} max={MAX_DIAS_EXTRAS} value={dias} onChange={(event) => setDias(event.target.value)} className="h-10 w-full rounded-md border bg-background px-3" />
              </label>
              <div className="text-sm">
                <span className="mb-1 block">Monto del cargo</span>
                <p className="flex h-10 items-center font-semibold">{moneda(monto)}</p>
              </div>
            </div>
            {contratoSeleccionado ? (
              <p className="text-sm text-muted-foreground">
                Departamento: {contratoSeleccionado.departamentoNombre} · Fin del período actual: {fechaLegible(contratoSeleccionado.fechaFin)}
                {diasYaRegistrados ? ` · Ya registrados: ${diasYaRegistrados} día(s)` : ""}
              </p>
            ) : null}
            {politicaDias.requiereAdenda ? (
              <p className="text-sm text-amber-700 dark:text-amber-300">
                La estadía supera los 7 días permitidos. Debe calcularse como extensión proporcional mediante una{" "}
                <Link href="/adendas" className="font-semibold underline">Adenda</Link>.
              </p>
            ) : null}
            <button type="button" onClick={() => void registrar()} disabled={guardando || !contractId || !politicaDias.permitido} className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
              {guardando ? "Registrando…" : "Registrar cargo"}
            </button>
          </section>
        ) : null}

        {error ? <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
        <section>
          <h2 className="mb-3 font-semibold">Cargos registrados</h2>
          {loading ? (
            <p className="text-sm text-muted-foreground">Cargando cargos…</p>
          ) : cargos.length === 0 ? (
            <p className="rounded-lg border p-6 text-center text-sm text-muted-foreground">Aún no hay días extras registrados.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-muted text-xs"><tr>
                  <th className="px-3 py-2">Contrato</th><th className="px-3 py-2">Cliente</th><th className="px-3 py-2">Período termina</th><th className="px-3 py-2">Días</th><th className="px-3 py-2">Monto</th><th className="px-3 py-2">Estado</th><th className="px-3 py-2">Acción</th>
                </tr></thead>
                <tbody className="divide-y">
                  {cargos.map((charge) => (
                    <tr key={charge.id}>
                      <td className="px-3 py-2"><Link href={`/contratos/${charge.contractId}`} className="text-primary hover:underline">{charge.codigoContrato}</Link></td>
                      <td className="px-3 py-2">{[charge.clienteNombre, charge.clienteApellidos].filter(Boolean).join(" ")}</td>
                      <td className="px-3 py-2">{fechaLegible(charge.fechaFinPeriodo)}</td>
                      <td className="px-3 py-2">{charge.dias}</td>
                      <td className="px-3 py-2 font-semibold">{moneda(charge.monto)}</td>
                      <td className="px-3 py-2">{charge.estado}</td>
                      <td className="px-3 py-2">{puedeGestionar ? (
                        <button type="button" disabled={actualizandoId === charge.id} onClick={() => void actualizarEstado(charge)} className="rounded border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50">
                          {charge.estado === "PAGADO" ? "Marcar pendiente" : "Marcar pagado"}
                        </button>
                      ) : charge.fechaPago ? fechaLegible(charge.fechaPago) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </DashboardShell>
  );
}
