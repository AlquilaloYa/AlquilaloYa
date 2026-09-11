"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, FileText } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { TableScroll } from "@/components/table-scroll";
import { apiFetch } from "@/lib/api";

type ClientFichaApi = {
  id: string;
  nombres: string;
  apellidos: string | null;
  documentoIdentidad?: string | null;
  ruc?: string | null;
  tipoPersona?: string | null;
  email?: string | null;
  telefono?: string | null;
  domicilio?: string | null;
  codigoDepartamento?: string | null;
};

type ContractFichaApi = {
  id: string;
  clienteId: string;
  codigoContrato: string;
  departamentoNombre: string;
  personaPago?: string | null;
  montoCanonMensual: string;
  depositoGarantia: string;
  mantenimiento?: string;
  fechaInicio: string;
  fechaFin: string;
  muebleriaItems?: string[];
};

type ContactoDetalle = {
  ruc?: string | null;
  dni: string;
  mascotas?: boolean;
  copiaBoletas?: Array<{
    id: string;
    nombre: string;
    tipo?: string;
    dataUrl?: string;
  }>;
};

type PaymentApi = {
  id: string;
  contractId: string;
  periodo: string;
  monto: string;
  mantenimiento: string;
  penalidad?: string;
  estado: string;
  fechaPago: string | null;
  voucherNombre: string | null;
  voucherUrl: string | null;
};

const PENALIDAD_MORA = 70;

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function esJpeg(v: { nombre: string; dataUrl: string; tipo: string }): boolean {
  if (v.tipo === "image/jpeg" || v.tipo === "image/jpg") return true;
  if (v.dataUrl.startsWith("data:image/jpeg") || v.dataUrl.startsWith("data:image/jpg")) {
    return true;
  }
  return /\.(jpe?g)$/i.test(v.nombre);
}

function parseLocalDate(iso: string): Date {
  const partes = iso.slice(0, 10).split("-");
  const y = Number(partes[0] ?? 0);
  const m = Number(partes[1] ?? 1);
  const d = Number(partes[2] ?? 1);
  return new Date(y, m - 1, d);
}

function addMonths(base: Date, n: number): Date {
  const day = base.getDate();
  const next = new Date(base.getFullYear(), base.getMonth() + n, 1);
  const last = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(day, last));
  return next;
}

function cronogramaMeses(inicio: Date, fin: Date): Date[] {
  const out: Date[] = [];
  for (let i = 0; i < 120; i++) {
    const d = addMonths(inicio, i);
    if (d.getTime() >= fin.getTime()) break;
    out.push(d);
  }
  return out;
}

export default function ClienteContratoPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [cliente, setCliente] = useState<ClientFichaApi | null>(null);
  const [contrato, setContrato] = useState<ContractFichaApi | null>(null);
  const [loading, setLoading] = useState(true);
  const [pagos, setPagos] = useState<PaymentApi[]>([]);
  const [vouchers, setVouchers] = useState<
    Record<string, { nombre: string; dataUrl: string; tipo: string }>
  >({});
  const [registrando, setRegistrando] = useState<string | null>(null);
  const [errorPago, setErrorPago] = useState<string | null>(null);
  const [previewVoucher, setPreviewVoucher] = useState<string | null>(null);

  const cargarPagos = async (contractId: string) => {
    try {
      const r = await apiFetch(`/api/payments?contractId=${contractId}`);
      if (r.ok) setPagos((await r.json()) as PaymentApi[]);
    } catch {
      /* noop */
    }
  };

  useEffect(() => {
    async function cargar() {
      try {
        const r = await apiFetch(`/api/ficha/${id}`);
        if (!r.ok) {
          const b = await r.json().catch(() => ({}));
          throw new Error((b as { error?: string }).error ?? `Error ${r.status}`);
        }
        const data = (await r.json()) as {
          cliente: ClientFichaApi;
          contrato: ContractFichaApi | null;
          pagos: PaymentApi[];
        };
        setCliente(data.cliente ?? null);
        setContrato(data.contrato ?? null);
        setPagos(data.pagos ?? []);
      } catch {
        setCliente(null);
      } finally {
        setLoading(false);
      }
    }
    if (id) void cargar();
  }, [id]);

  useEffect(() => {
    if (!previewVoucher) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setPreviewVoucher(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [previewVoucher]);

  const [contacto, setContacto] = useState<ContactoDetalle | null>(null);
  useEffect(() => {
    const dni = cliente?.documentoIdentidad;
    if (!dni) {
      setContacto(null);
      return;
    }
    let vivo = true;
    void (async () => {
      try {
        const r = await apiFetch(
          `/api/contactos?dni=${encodeURIComponent(dni)}`
        );
        if (!r.ok) {
          if (vivo) setContacto(null);
          return;
        }
        const lista = (await r.json()) as ContactoDetalle[];
        if (vivo) setContacto(lista[0] ?? null);
      } catch {
        if (vivo) setContacto(null);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [cliente]);

  const fechaInicio = contrato?.fechaInicio
    ? parseLocalDate(contrato.fechaInicio)
    : null;
  const fechaFin = contrato?.fechaFin ? parseLocalDate(contrato.fechaFin) : null;
  const cuotas =
    fechaInicio && fechaFin ? cronogramaMeses(fechaInicio, fechaFin) : [];
  const hoy = new Date();
  const inicioDia = new Date(
    hoy.getFullYear(),
    hoy.getMonth(),
    hoy.getDate()
  ).getTime();
  const meses =
    fechaFin && fechaFin.getTime() > hoy.getTime()
      ? Math.max(0, Math.round((fechaFin.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24 * 30)))
      : 0;
  const boletas = contacto?.copiaBoletas ?? [];
  const bauchers = [
    ...boletas,
    ...pagos
      .filter((p) => p.voucherUrl)
      .map((p) => ({
        id: `pago-${p.id}`,
        nombre: p.voucherNombre ?? `Baucher ${p.periodo}`,
        tipo: "image/jpeg",
        dataUrl: p.voucherUrl ?? undefined,
      })),
  ];
  const nombreCliente = cliente
    ? [cliente.nombres, cliente.apellidos].filter(Boolean).join(" ")
    : "";
  const moneda = (n: unknown) =>
    Number(n ?? 0).toLocaleString("es-PE", {
      style: "currency",
      currency: "PEN",
    });

  async function registrarPago(periodoStr: string) {
    if (!contrato) return;
    const v = vouchers[periodoStr];
    if (!v || !esJpeg(v)) {
      setErrorPago(
        "Para confirmar el pago debes adjuntar el baucher en imagen JPEG."
      );
      return;
    }
    setRegistrando(periodoStr);
    setErrorPago(null);
    try {
      const res = await apiFetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contractId: contrato.id,
          periodo: periodoStr,
          monto: contrato.montoCanonMensual,
          mantenimiento: contrato.mantenimiento ?? "50",
          estado: "PAGADO",
          fechaPago: localDateStr(new Date()),
          voucherNombre: v.nombre,
          voucherUrl: v.dataUrl,
        }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error((b as { error?: string }).error ?? `Error ${res.status}`);
      }
      await cargarPagos(contrato.id);
    } catch (e) {
      setErrorPago((e as Error).message);
    } finally {
      setRegistrando(null);
    }
  }

  function leerVoucher(periodoStr: string, file: File | undefined) {
    if (!file) return;
    const esJpgFile =
      file.type === "image/jpeg" ||
      file.type === "image/jpg" ||
      /\.(jpe?g)$/i.test(file.name);
    if (!esJpgFile) {
      setErrorPago("El baucher debe ser una imagen JPEG (.jpg).");
      return;
    }
    setErrorPago(null);
    const reader = new FileReader();
    reader.onload = () => {
      setVouchers((prev) => ({
        ...prev,
        [periodoStr]: {
          nombre: file.name,
          dataUrl: String(reader.result),
          tipo: "image/jpeg",
        },
      }));
    };
    reader.readAsDataURL(file);
  }

  if (loading) {
    return (
      <DashboardShell>
        <p className="text-on-surface-variant">Cargando ficha del cliente…</p>
      </DashboardShell>
    );
  }

  if (!cliente) {
    return (
      <DashboardShell>
        <Link href="/contratos" className="mb-4 inline-flex items-center gap-2 text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" />
          Volver a contratos
        </Link>
        <p className="text-on-surface-variant">Cliente no encontrado.</p>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <Link
              href="/contratos"
              className="mb-2 inline-flex items-center gap-2 font-label-md text-primary hover:underline"
            >
              <ArrowLeft className="h-4 w-4" />
              Volver a contratos
            </Link>
            <h1 className="font-headline-lg text-on-surface">{nombreCliente}</h1>
            <p className="text-sm text-on-surface-variant">
              {cliente.tipoPersona === "LEGAL" ? "Persona Jurídica" : "Persona Natural"}
              {cliente.codigoDepartamento ? ` · Departamento ${cliente.codigoDepartamento}` : ""}
            </p>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-5">
            <h4 className="mb-3 font-label-md uppercase tracking-wider text-on-surface-variant">
              Datos del cliente
            </h4>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <div className="flex justify-between border-b border-outline-variant/40 py-1">
                <dt className="text-on-surface-variant">DNI/CE</dt>
                <dd className="font-medium">{cliente.documentoIdentidad ?? "—"}</dd>
              </div>
              <div className="flex justify-between border-b border-outline-variant/40 py-1">
                <dt className="text-on-surface-variant">RUC</dt>
                <dd className="font-medium">{cliente.ruc ?? "—"}</dd>
              </div>
              <div className="flex min-w-0 justify-between border-b border-outline-variant/40 py-1 sm:col-span-2">
                <dt className="shrink-0 text-on-surface-variant">Email</dt>
                <dd
                  className="min-w-0 max-w-[78%] truncate text-right font-medium"
                  title={cliente.email ?? undefined}
                >
                  {cliente.email ?? "—"}
                </dd>
              </div>
              <div className="flex justify-between border-b border-outline-variant/40 py-1">
                <dt className="text-on-surface-variant">Teléfono</dt>
                <dd className="font-medium">{cliente.telefono ?? "—"}</dd>
              </div>
              <div className="flex justify-between border-b border-outline-variant/40 py-1">
                <dt className="text-on-surface-variant">Mascotas</dt>
                <dd className="font-medium">{contacto?.mascotas ? "Sí" : "No"}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-5">
            <h4 className="mb-3 font-label-md uppercase tracking-wider text-on-surface-variant">
              Departamento y contrato
            </h4>
            <div className="mb-3 rounded-lg border border-outline-variant p-3">
              <div className="font-mono-label text-primary">
                {cliente.codigoDepartamento ?? "—"}
              </div>
              <div className="text-sm text-on-surface-variant">
                {contrato?.departamentoNombre ?? "Sin contrato"}
              </div>
            </div>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <div className="flex justify-between border-b border-outline-variant/40 py-1">
                <dt className="text-on-surface-variant">Código</dt>
                <dd className="font-mono font-medium">{contrato?.codigoContrato ?? "—"}</dd>
              </div>
              <div className="flex justify-between border-b border-outline-variant/40 py-1">
                <dt className="text-on-surface-variant">Estado</dt>
                <dd className="font-medium">{contrato ? "Vigente" : "—"}</dd>
              </div>
              <div className="flex justify-between border-b border-outline-variant/40 py-1">
                <dt className="text-on-surface-variant">Inicio</dt>
                <dd className="font-medium">
                  {fechaInicio ? fechaInicio.toLocaleDateString("es-PE") : "—"}
                </dd>
              </div>
              <div className="flex justify-between border-b border-outline-variant/40 py-1">
                <dt className="text-on-surface-variant">Fin</dt>
                <dd className="font-medium">
                  {fechaFin ? fechaFin.toLocaleDateString("es-PE") : "—"}
                </dd>
              </div>
              <div className="flex justify-between border-b border-outline-variant/40 py-1">
                <dt className="text-on-surface-variant">Meses restantes</dt>
                <dd className="font-medium">{fechaFin ? `${meses} meses` : "—"}</dd>
              </div>
              <div className="flex flex-col gap-1 border-b border-outline-variant/40 py-1 sm:col-span-2">
                <dt className="text-on-surface-variant">Inventario del contrato</dt>
                <dd className="font-medium">
                  {(contrato?.muebleriaItems ?? []).join("; ") || "—"}
                </dd>
              </div>
            </dl>
          </section>
        </div>

        <section>
          <h4 className="mb-2 font-label-md uppercase tracking-wider text-on-surface-variant">
            Cronograma ({cuotas.length} meses)
          </h4>
          {cuotas.length === 0 ? (
            <div className="flex h-20 items-center justify-center rounded-lg border border-dashed border-outline-variant text-sm text-on-surface-variant">
              Sin periodo de alquiler
            </div>
          ) : (
            <TableScroll
              className="rounded-lg border border-outline-variant p-1"
              contentClassName="max-h-[30rem]"
            >
              <table className="w-full min-w-[1400px] text-left text-sm">
                <thead className="sticky top-0 z-10 bg-surface-container-low text-xs text-on-surface-variant">
                  <tr>
                    <th className="px-3 py-2 font-medium">Mes</th>
                    <th className="px-3 py-2 font-medium">Cliente</th>
                    <th className="px-3 py-2 font-medium">Código</th>
                    <th className="px-3 py-2 font-medium">Mensualidad</th>
                    <th className="px-3 py-2 font-medium">Mantenimiento</th>
                    <th className="px-3 py-2 font-medium">Pago mensual</th>
                    <th className="px-3 py-2 font-medium">Depósito</th>
                    <th className="px-3 py-2 font-medium">Esquema de pagos</th>
                    <th className="px-3 py-2 font-medium">Contacto emergencia</th>
                    <th className="px-3 py-2 font-medium">Estado de pago</th>
                    <th className="px-3 py-2 font-medium">Morosidad</th>
                    <th className="px-3 py-2 font-medium">Penalidad</th>
                    <th className="px-3 py-2 font-medium">A quién pagar</th>
                    <th className="px-3 py-2 font-medium">Baucher</th>
                    <th className="px-3 py-2 font-medium">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {cuotas.map((d, i) => {
                    const pStr = localDateStr(d);
                    const pago = pagos.find((p) => p.periodo === pStr) ?? null;
                    const pagado = pago?.estado === "PAGADO";
                    const vencido = !pagado && d.getTime() < inicioDia;
                    const diasMora = pagado
                      ? pago?.fechaPago
                        ? Math.max(
                            0,
                            Math.floor(
                              (parseLocalDate(pago.fechaPago).getTime() -
                                d.getTime()) /
                                86_400_000
                            )
                          )
                        : 0
                      : vencido
                        ? Math.floor((inicioDia - d.getTime()) / 86_400_000)
                        : 0;
                    const estado = pagado
                      ? "Pagado"
                      : vencido
                        ? "Vencido"
                        : "Pendiente";
                    const penalidad =
                      diasMora > 0
                        ? Number(pago?.penalidad ?? 0) || PENALIDAD_MORA
                        : 0;
                    const voucherSel = vouchers[pStr];
                    return (
                      <tr key={d.toISOString()} className="border-t border-outline-variant/50">
                        <td className="whitespace-nowrap px-3 py-2 font-medium">
                          {d.toLocaleDateString("es-PE")}
                        </td>
                        <td className="px-3 py-2">{nombreCliente}</td>
                        <td className="px-3 py-2 font-mono">
                          {cliente.codigoDepartamento ?? "—"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2">
                          {moneda(contrato?.montoCanonMensual)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2">
                          {moneda(contrato?.mantenimiento ?? "50")}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 font-semibold">
                          {moneda(
                            Number(contrato?.montoCanonMensual ?? 0) +
                              Number(contrato?.mantenimiento ?? "50")
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2">
                          {i === 0 ? moneda(contrato?.depositoGarantia) : "—"}
                        </td>
                        <td className="px-3 py-2">Mensual</td>
                        <td className="px-3 py-2">{cliente.telefono ?? "—"}</td>
                        <td className="px-3 py-2">
                          <span
                            className={
                              pagado
                                ? "font-medium text-emerald-600"
                                : vencido
                                  ? "font-medium text-destructive"
                                  : "text-on-surface-variant"
                            }
                          >
                            {estado}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2">
                          {diasMora > 0 ? `${diasMora} d` : "—"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2">
                          {penalidad > 0 ? moneda(penalidad) : "—"}
                        </td>
                        <td className="px-3 py-2">{contrato?.personaPago || "Administración"}</td>
                        <td className="max-w-[160px] px-3 py-2 text-xs">
                          {pago?.voucherUrl ? (
                            <button
                              type="button"
                              onClick={() => setPreviewVoucher(pago.voucherUrl)}
                              className="inline-flex text-primary hover:underline"
                              title="Ver baucher"
                            >
                              <img
                                src={pago.voucherUrl}
                                alt="Vista previa del baucher"
                                className="h-10 w-14 rounded border border-outline-variant object-cover"
                              />
                            </button>
                          ) : (
                            pago?.voucherNombre ||
                            voucherSel?.nombre ||
                            "—"
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2">
                          {pagado ? (
                            <span className="text-xs text-on-surface-variant">
                              {pago?.fechaPago ?? ""}
                            </span>
                          ) : (
                            <div className="flex flex-col items-start gap-1.5">
                              <div className="flex items-center gap-2">
                                <label
                                  className="cursor-pointer rounded border border-outline-variant px-2 py-1 text-xs text-on-surface-variant hover:bg-surface-container"
                                  title="Adjuntar baucher (solo imagen JPEG)"
                                >
                                  {voucherSel && esJpeg(voucherSel) ? "✓ JPEG" : "Voucher"}
                                  <input
                                    type="file"
                                    className="hidden"
                                    accept="image/jpeg"
                                    onChange={(e) => {
                                      leerVoucher(pStr, e.target.files?.[0]);
                                      e.target.value = "";
                                    }}
                                  />
                                </label>
                                <button
                                  type="button"
                                  disabled={
                                    registrando === pStr ||
                                    !(voucherSel && esJpeg(voucherSel))
                                  }
                                  title={
                                    voucherSel && esJpeg(voucherSel)
                                      ? "Confirmar pago"
                                      : "Requiere baucher JPEG"
                                  }
                                  onClick={() => void registrarPago(pStr)}
                                  className="rounded bg-primary px-2 py-1 text-xs text-on-primary disabled:opacity-40"
                                >
                                  {registrando === pStr ? "…" : "Registrar"}
                                </button>
                              </div>
                              {voucherSel && esJpeg(voucherSel) ? (
                                <button
                                  type="button"
                                  onClick={() => setPreviewVoucher(voucherSel.dataUrl)}
                                  title="Ver baucher adjuntado"
                                  className="block"
                                >
                                  <img
                                    src={voucherSel.dataUrl}
                                    alt="Baucher adjuntado"
                                    className="h-14 w-20 rounded border border-outline-variant object-cover"
                                  />
                                </button>
                              ) : null}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableScroll>
          )}
          {errorPago ? (
            <p className="mt-2 text-sm text-destructive">{errorPago}</p>
          ) : null}
        </section>

        <section>
          <h4 className="mb-2 font-label-md uppercase tracking-wider text-on-surface-variant">
            Bauchers de depósito ({bauchers.length})
          </h4>
          {bauchers.length === 0 ? (
            <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-outline-variant text-sm text-on-surface-variant">
              Sin bauchers de depósito registrados
            </div>
          ) : (
            <ul className="space-y-2">
              {bauchers.map((b) => (
                <li
                  key={b.id}
                  className="flex items-center gap-3 rounded-lg border border-outline-variant px-3 py-2 text-sm"
                >
                  {b.dataUrl ? (
                    <button
                      type="button"
                      onClick={() => setPreviewVoucher(b.dataUrl ?? null)}
                      className="shrink-0"
                      title="Ver baucher"
                    >
                      <img
                        src={b.dataUrl}
                        alt={b.nombre}
                        className="h-14 w-16 rounded object-cover"
                      />
                    </button>
                  ) : (
                    <FileText className="h-4 w-4 shrink-0 text-primary" />
                  )}
                  <span className="truncate font-medium" title={b.nombre}>
                    {b.nombre}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {previewVoucher ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setPreviewVoucher(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Vista previa del baucher"
        >
          <div
            className="relative max-h-[90vh] w-full max-w-md overflow-hidden rounded-xl bg-surface-container-lowest shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-outline-variant px-4 py-2">
              <span className="font-label-md text-on-surface-variant">
                Vista previa del baucher
              </span>
              <button
                type="button"
                onClick={() => setPreviewVoucher(null)}
                aria-label="Cerrar vista previa"
                className="rounded p-1 text-on-surface-variant transition-colors hover:bg-surface-container"
              >
                ✕
              </button>
            </div>
            <img
              src={previewVoucher}
              alt="Baucher"
              className="max-h-[70vh] w-full object-contain"
            />
          </div>
        </div>
      ) : null}
    </DashboardShell>
  );
}
