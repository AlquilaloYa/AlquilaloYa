"use client";

import { useEffect, useMemo, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { apiFetch } from "@/lib/api";
import { Button } from "@contract/ui/components/button";
import { Download, FileSpreadsheet, RefreshCw } from "lucide-react";

interface PaymentExportRow {
  periodo: string;
  propietario: string;
  inquilino: string;
  inmueble: string;
  contrato: string;
  alquiler: number;
  mantenimiento: number;
  penalidad: number;
  montoTotal: number;
  montoPagado: number;
  saldo: number;
  fechaPago: string;
  estado: string;
}

interface PropertyExportRow {
  codigo: string;
  inmueble: string;
  piso: number;
  propietario: string;
  precioMensual: number;
  estado: string;
  inquilino: string;
  activo: boolean;
}

interface ExportData {
  pagos: PaymentExportRow[];
  inmuebles: PropertyExportRow[];
}

const ESTADOS_PAGO = ["PENDIENTE", "PARCIAL", "PAGADO", "VERIFICADO", "VENCIDO"];

function mesActual(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function ExportacionesContent() {
  const [month, setMonth] = useState(mesActual);
  const [data, setData] = useState<ExportData>({ pagos: [], inmuebles: [] });
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [owner, setOwner] = useState("");
  const [property, setProperty] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const query = month ? `?month=${encodeURIComponent(month)}` : "";
    void apiFetch(`/api/exportaciones${query}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = (await response.json()) as ExportData & { error?: string };
        if (!response.ok) throw new Error(body.error ?? "No se pudo cargar la información");
        setData(body);
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError(cause instanceof Error ? cause.message : "No se pudo cargar la información");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [month]);

  const owners = useMemo(
    () =>
      [...new Set(data.inmuebles.map((row) => row.propietario.trim()).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, "es")),
    [data.inmuebles],
  );
  const properties = useMemo(
    () =>
      data.inmuebles
        .filter((row) => !owner || row.propietario.trim() === owner)
        .sort((a, b) => a.codigo.localeCompare(b.codigo, "es")),
    [data.inmuebles, owner],
  );
  const paymentStatuses = useMemo(
    () =>
      [...new Set([...ESTADOS_PAGO, ...data.pagos.map((row) => row.estado)])]
        .sort((a, b) => a.localeCompare(b, "es")),
    [data.pagos],
  );
  const filteredPayments = useMemo(
    () =>
      data.pagos.filter(
        (row) =>
          (!owner || row.propietario.trim() === owner) &&
          (!property || row.inmueble.startsWith(property)) &&
          (!paymentStatus || row.estado === paymentStatus),
      ),
    [data.pagos, owner, property, paymentStatus],
  );
  const filteredProperties = useMemo(
    () =>
      data.inmuebles.filter(
        (row) =>
          (!owner || row.propietario.trim() === owner) &&
          (!property || row.codigo === property),
      ),
    [data.inmuebles, owner, property],
  );

  async function exportExcel() {
    if (exporting) return;
    setExporting(true);
    setError("");
    try {
      const ExcelJS = await import("exceljs");
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "AlquilaYa ERP";
      const paymentsSheet = workbook.addWorksheet("Pagos", {
        views: [{ state: "frozen", ySplit: 1 }],
      });
      paymentsSheet.columns = [
        { header: "Mes", key: "mes", width: 12 },
        { header: "Propietario", key: "propietario", width: 24 },
        { header: "Inquilino", key: "inquilino", width: 28 },
        { header: "Inmueble", key: "inmueble", width: 28 },
        { header: "Contrato", key: "contrato", width: 20 },
        { header: "Alquiler (S/)", key: "alquiler", width: 18, style: { numFmt: '"S/ " #,##0.00' } },
        { header: "Mantenimiento (S/)", key: "mantenimiento", width: 20, style: { numFmt: '"S/ " #,##0.00' } },
        { header: "Penalidad (S/)", key: "penalidad", width: 18, style: { numFmt: '"S/ " #,##0.00' } },
        { header: "Total del mes (S/)", key: "montoTotal", width: 20, style: { numFmt: '"S/ " #,##0.00' } },
        { header: "Monto pagado (S/)", key: "montoPagado", width: 20, style: { numFmt: '"S/ " #,##0.00' } },
        { header: "Saldo (S/)", key: "saldo", width: 18, style: { numFmt: '"S/ " #,##0.00' } },
        { header: "Fecha de pago", key: "fechaPago", width: 16 },
        { header: "Estado", key: "estado", width: 16 },
      ];
      paymentsSheet.addRows(
        filteredPayments.map((row) => ({
          mes: row.periodo.slice(0, 7),
          propietario: row.propietario,
          inquilino: row.inquilino,
          inmueble: row.inmueble,
          contrato: row.contrato,
          alquiler: row.alquiler,
          mantenimiento: row.mantenimiento,
          penalidad: row.penalidad,
          montoTotal: row.montoTotal,
          montoPagado: row.montoPagado,
          saldo: row.saldo,
          fechaPago: row.fechaPago,
          estado: row.estado,
        })),
      );
      paymentsSheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: Math.max(1, filteredPayments.length + 1), column: 13 },
      };

      const propertySheet = workbook.addWorksheet("Inmuebles", {
        views: [{ state: "frozen", ySplit: 1 }],
      });
      propertySheet.columns = [
        { header: "Código", key: "codigo", width: 16 },
        { header: "Inmueble", key: "inmueble", width: 30 },
        { header: "Piso", key: "piso", width: 10 },
        { header: "Propietario", key: "propietario", width: 24 },
        { header: "Precio mensual (S/)", key: "precioMensual", width: 20, style: { numFmt: '"S/ " #,##0.00' } },
        { header: "Estado", key: "estado", width: 18 },
        { header: "Inquilino", key: "inquilino", width: 28 },
        { header: "Activo", key: "activo", width: 12 },
      ];
      propertySheet.addRows(
        filteredProperties.map((row) => ({
          codigo: row.codigo,
          inmueble: row.inmueble,
          piso: row.piso,
          propietario: row.propietario,
          precioMensual: row.precioMensual,
          estado: row.estado,
          inquilino: row.inquilino,
          activo: row.activo ? "Sí" : "No",
        })),
      );
      propertySheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: Math.max(1, filteredProperties.length + 1), column: 8 },
      };

      for (const sheet of [paymentsSheet, propertySheet]) {
        const header = sheet.getRow(1);
        header.font = { bold: true, color: { argb: "FFFFFFFF" } };
        header.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF1D4ED8" },
        };
        header.alignment = { vertical: "middle" };
        header.height = 22;
      }

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([new Uint8Array(buffer)], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = `reporte-alquilaya-${month || "historico"}.xlsx`;
      link.click();
      URL.revokeObjectURL(downloadUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo generar el archivo Excel");
    } finally {
      setExporting(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-primary">Reportes</p>
          <h1 className="text-2xl font-bold tracking-tight">Exportación de información</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Filtra pagos e inmuebles y descarga los datos en un libro de Excel.
          </p>
        </div>
        <Button onClick={() => void exportExcel()} disabled={loading || exporting}>
          {exporting ? (
            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Download className="mr-2 h-4 w-4" />
          )}
          {exporting ? "Generando…" : "Exportar a Excel"}
        </Button>
      </header>

      <section className="rounded-xl border bg-card p-4 shadow-sm sm:p-5">
        <div className="mb-4 flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">Filtros del reporte</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <label className="grid gap-1.5 text-sm font-medium">
            Mes de pagos
            <span className="text-xs font-normal text-muted-foreground">
              Vacío para incluir todo el historial
            </span>
            <input
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              className="h-10 rounded-md border bg-background px-3"
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Propietario / receptor
            <select
              value={owner}
              onChange={(event) => {
                setOwner(event.target.value);
                setProperty("");
              }}
              className="h-10 rounded-md border bg-background px-3"
            >
              <option value="">Todos</option>
              {owners.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Inmueble
            <select
              value={property}
              onChange={(event) => setProperty(event.target.value)}
              className="h-10 rounded-md border bg-background px-3"
            >
              <option value="">Todos</option>
              {properties.map((row) => (
                <option key={row.codigo} value={row.codigo}>
                  {row.codigo} · {row.inmueble}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Estado del pago
            <select
              value={paymentStatus}
              onChange={(event) => setPaymentStatus(event.target.value)}
              className="h-10 rounded-md border bg-background px-3"
            >
              <option value="">Todos</option>
              {paymentStatuses.map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {error ? (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <p className="text-sm text-muted-foreground">Pagos incluidos</p>
          <p className="mt-1 text-2xl font-bold">{loading ? "…" : filteredPayments.length}</p>
          <p className="mt-1 text-xs text-muted-foreground">En la hoja “Pagos”</p>
        </div>
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <p className="text-sm text-muted-foreground">Inmuebles incluidos</p>
          <p className="mt-1 text-2xl font-bold">{loading ? "…" : filteredProperties.length}</p>
          <p className="mt-1 text-xs text-muted-foreground">En la hoja “Inmuebles”</p>
        </div>
      </section>

      {loading ? (
        <p className="text-sm text-muted-foreground">Cargando datos del reporte…</p>
      ) : null}
    </main>
  );
}

export default function ExportacionesPage() {
  return (
    <DashboardShell>
      <ExportacionesContent />
    </DashboardShell>
  );
}
