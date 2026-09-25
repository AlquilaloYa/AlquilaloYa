"use client";

import { useEffect, useMemo, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { apiFetch } from "@/lib/api";
import {
  buildBoletaSeparacion,
  formatMonto,
} from "@/lib/pdf/render-boleta-separacion";

interface ContactSeedView {
  id: string;
  nombre: string;
  apellido: string;
  dni: string;
  domicilio: string;
  email: string;
  telefono: string;
}

interface DepartmentView {
  id: string;
  codigo: string;
  nombre: string;
  numero: string;
  personaPago: string;
  precio: string;
  piso: number | null;
}

interface SeparationView {
  id: string;
  departamentoId: string;
  contactoId: string | null;
  montoSeparacion: number;
  fechaSeparacion: string;
}

interface ContractView {
  id: string;
  codigoContrato: string;
  departamentoId: string;
  fechaInicio: string;
  fechaFin: string;
  estado: string;
}

function DiaPagoInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <input
      type="text"
      inputMode="numeric"
      value={value}
      maxLength={2}
      onChange={(e) =>
        onChange(e.target.value.replace(/[^0-9]/g, "").slice(0, 2))
      }
      placeholder="05"
      title="Día de pago del alquiler"
      className="w-16 rounded border border-outline-variant bg-surface-container-lowest px-2 py-1 text-center text-sm text-on-surface focus:border-primary focus:outline-none"
    />
  );
}

export default function SeparacionesPage() {
  const [contactos, setContactos] = useState<ContactSeedView[]>([]);
  const [departamentos, setDepartamentos] = useState<DepartmentView[]>([]);
  const [separaciones, setSeparaciones] = useState<SeparationView[]>([]);
  const [contracts, setContracts] = useState<ContractView[]>([]);
  const [loading, setLoading] = useState(true);
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState("");

  const [contactoId, setContactoId] = useState("");
  const [departamentoId, setDepartamentoId] = useState("");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [diaPago, setDiaPago] = useState("05");

  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const [cs, ds, ss, ctrs] = await Promise.all([
          apiFetch("/api/contactos").then((r) => (r.ok ? r.json() : [])),
          apiFetch("/api/departamentos").then((r) => (r.ok ? r.json() : [])),
          apiFetch("/api/separaciones").then((r) => (r.ok ? r.json() : [])),
          apiFetch("/api/contracts").then((r) => (r.ok ? r.json() : [])),
        ]);
        if (!vivo) return;
        setContactos(cs as ContactSeedView[]);
        setDepartamentos(ds as DepartmentView[]);
        setSeparaciones(ss as SeparationView[]);
        setContracts(ctrs as ContractView[]);
      } catch {
        if (vivo) setError("No se pudieron cargar los datos.");
      } finally {
        if (vivo) setLoading(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  const departamento = useMemo(
    () => departamentos.find((d) => d.id === departamentoId) ?? null,
    [departamentos, departamentoId]
  );
  const contacto = useMemo(
    () => contactos.find((c) => c.id === contactoId) ?? null,
    [contactos, contactoId]
  );
  const contrato = useMemo(
    () =>
      contracts.find((c) => c.departamentoId === departamentoId) ?? null,
    [contracts, departamentoId]
  );
  const separacion = useMemo(
    () =>
      separaciones.find((s) => s.departamentoId === departamentoId) ?? null,
    [separaciones, departamentoId]
  );

  const boleta = useMemo(() => {
    if (!contacto || !departamento) return null;
    return buildBoletaSeparacion({
      contacto: {
        nombre: contacto.nombre,
        apellido: contacto.apellido,
        dni: contacto.dni,
        domicilio: contacto.domicilio,
      },
      departamento: {
        numero: departamento.numero,
        codigo: departamento.codigo,
        personaPago: departamento.personaPago,
        precio: departamento.precio,
      },
      separacion: separacion
        ? { montoSeparacion: separacion.montoSeparacion }
        : null,
      contrato: contrato
        ? { fechaInicio: contrato.fechaInicio, fechaFin: contrato.fechaFin }
        : null,
    });
  }, [contacto, departamento, separacion, contrato]);

  useEffect(() => {
    if (!contacto || !departamento) return;
    if (!checkIn || !checkOut) {
      const hoy = new Date();
      setCheckIn((prev) => prev || (contrato?.fechaInicio?.slice(0, 10) ?? hoy.toISOString().slice(0, 10)));
      setCheckOut((prev) =>
        prev ||
        (contrato?.fechaFin?.slice(0, 10) ??
          new Date(hoy.getFullYear() + 1, hoy.getMonth(), hoy.getDate()).toISOString().slice(0, 10))
      );
    }
  }, [contacto, departamento]); // eslint-disable-line react-hooks/exhaustive-deps;

  async function generarPdf() {
    if (!contacto || !departamento) {
      setError("Selecciona el cliente y el departamento.");
      return;
    }
    setGenerando(true);
    setError("");
    try {
      const r = await apiFetch("/api/separaciones/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactoId: contacto.id,
          departamentoId: departamento.id,
          checkIn: checkIn || undefined,
          checkOut: checkOut || undefined,
          diaPago,
        }),
      });
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        throw new Error(
          (b as { error?: string }).error ?? `Error ${r.status}`
        );
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `BOLETA-SEPARACION-${departamento.codigo}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGenerando(false);
    }
  }

  const filas: [string, string][] = boleta
    ? [
        ["Persona Firmante", boleta.personaFirmante],
        ["DNI persona firmante", boleta.dniFirmante],
        ["Dirección de la persona", boleta.direccion],
        ["Departamento", boleta.departamento],
        ["Código", boleta.codigo],
        ["Check-in", checkIn || boleta.checkIn],
        ["Check-out", checkOut || boleta.checkOut],
        ["Separación", boleta.montoSeparacion],
        ["Día de pago", diaPago],
        ["Persona a pagar", boleta.personaPago],
        ["DNI persona a pagar", boleta.dniPersonaPago],
      ]
    : [];

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div>
          <h1 className="font-headline-lg text-on-surface">Boleta de Separación</h1>
          <p className="text-sm text-on-surface-variant">
            Elige el cliente y el departamento separado. El sistema completa el
            resto con los datos de Contactos y Uni/Dep.
          </p>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-5">
            <h4 className="mb-3 font-label-md uppercase tracking-wider text-on-surface-variant">
              Selección
            </h4>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block font-label-md text-on-surface">
                  Cliente (persona firmante)
                </label>
                <select
                  value={contactoId}
                  onChange={(e) => setContactoId(e.target.value)}
                  disabled={loading}
                  className="w-full rounded-md border border-outline-variant bg-surface p-2 font-body-md text-on-surface focus:border-primary focus:outline-none disabled:opacity-50"
                >
                  <option value="">— Seleccionar cliente —</option>
                  {contactos.map((c) => (
                    <option key={c.id} value={c.id}>
                      {[c.nombre, c.apellido].filter(Boolean).join(" ")} · DNI {c.dni || "—"}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block font-label-md text-on-surface">
                  Departamento a separar
                </label>
                <select
                  value={departamentoId}
                  onChange={(e) => setDepartamentoId(e.target.value)}
                  disabled={loading}
                  className="w-full rounded-md border border-outline-variant bg-surface p-2 font-body-md text-on-surface focus:border-primary focus:outline-none disabled:opacity-50"
                >
                  <option value="">— Seleccionar departamento —</option>
                  {departamentos.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.nombre} · N° {d.numero} · {d.codigo}
                    </option>
                  ))}
                </select>
              </div>

              {boleta ? (
                <div className="grid grid-cols-1 gap-3 rounded-lg border border-outline-variant bg-surface-container p-3 text-sm">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block font-label-md text-on-surface-variant">
                        Check-in
                      </label>
                      <input
                        type="date"
                        value={checkIn || (boleta.checkIn !== "—" ? boleta.checkIn.slice(0, 10) : "")}
                        onChange={(e) => setCheckIn(e.target.value)}
                        className="w-full rounded border border-outline-variant bg-surface p-2 text-on-surface focus:border-primary focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block font-label-md text-on-surface-variant">
                        Check-out
                      </label>
                      <input
                        type="date"
                        value={checkOut || (boleta.checkOut !== "—" ? boleta.checkOut.slice(0, 10) : "")}
                        onChange={(e) => setCheckOut(e.target.value)}
                        className="w-full rounded border border-outline-variant bg-surface p-2 text-on-surface focus:border-primary focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              ) : null}

              <button
                type="button"
                onClick={() => void generarPdf()}
                disabled={generando || !contacto || !departamento}
                className="w-full rounded-lg bg-primary py-2 font-semibold text-on-primary disabled:opacity-40"
              >
                {generando ? "Generando PDF…" : "Generar Boleta PDF"}
              </button>
              {error ? (
                <p className="text-sm text-destructive">{error}</p>
              ) : null}
            </div>
          </section>

          <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-5">
            <h4 className="mb-3 font-label-md uppercase tracking-wider text-on-surface-variant">
              Vista previa · BOLETA DE SEPARACIÓN
            </h4>
            {loading ? (
              <p className="py-10 text-center text-on-surface-variant">
                Cargando…
              </p>
            ) : filas.length === 0 ? (
              <p className="py-10 text-center text-on-surface-variant">
                Selecciona cliente y departamento para ver la boleta.
              </p>
            ) : (
              <dl className="space-y-1.5 text-sm">
                {filas.map(([label, valor]) => (
                  <div
                    key={label}
                    className="flex flex-wrap justify-between gap-2 border-b border-outline-variant/40 py-1"
                  >
                    <dt className="text-on-surface-variant">{label}</dt>
                    <dd className="font-medium text-on-surface">
                      {valor || "—"}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
            {departamento ? (
              <p className="mt-3 text-xs text-on-surface-variant">
                Separación registrada:{" "}
                {formatMonto(separacion?.montoSeparacion ?? departamento.precio)}
                {contrato
                  ? ` · Contrato ${contrato.codigoContrato} (${contrato.estado})`
                  : ""}
              </p>
            ) : null}
          </section>
        </div>
      </div>
    </DashboardShell>
  );
}