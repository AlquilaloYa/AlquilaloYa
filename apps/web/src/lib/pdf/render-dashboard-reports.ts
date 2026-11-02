export interface DepartamentoReportePdf {
  codigo: string;
  nombre: string;
  numero: string;
  piso?: number | null;
  precio?: string | number | null;
  precioNegociable?: boolean;
  activo: boolean;
  motivoBloqueo?: string | null;
  enMantenimiento?: boolean;
  bloqueado?: boolean;
  disponibilidad?: { fechaFin: string; dias: number } | null;
  maintenanceReason?: string | null;
  maintenanceEstimatedDays?: number | null;
  maintenanceStage?: string;
}

interface ActividadSemanalReporte {
  id: string;
  titulo: string;
  detalle: string;
  fecha: string;
}

export interface ReporteSemanalPdf {
  inicioSemana: string;
  fechaCorte: string;
  renovaciones: ActividadSemanalReporte[];
  reportesClientes: ActividadSemanalReporte[];
  reparaciones: ActividadSemanalReporte[];
  contratosNuevos: ActividadSemanalReporte[];
  adendasNuevas: ActividadSemanalReporte[];
}

const escapeHtml = (value: unknown) =>
  String(value ?? "").replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character]!;
  });

function formatDate(value: string, withTime = false): string {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00-05:00`)
    : new Date(value);
  if (Number.isNaN(date.getTime())) return escapeHtml(value);
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    day: "2-digit",
    month: "long",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(date);
}

function layout(title: string, subtitle: string, content: string): string {
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <style>
    @page { size: A4; margin: 18mm 16mm 18mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #172b3a; font-family: Arial, Helvetica, sans-serif; font-size: 10pt; line-height: 1.45; }
    .masthead { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 12px; border-bottom: 3px solid #087f8c; }
    .brand { color: #087f8c; font-size: 9pt; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; }
    .document-type { color: #637586; font-size: 8pt; text-align: right; text-transform: uppercase; letter-spacing: .8px; }
    h1 { margin: 24px 0 5px; color: #102a43; font-size: 25pt; line-height: 1.1; }
    .subtitle { margin: 0; color: #526777; font-size: 11pt; }
    .generated { margin-top: 8px; color: #718394; font-size: 8pt; }
    .summary { margin: 20px 0 22px; padding: 14px 16px; border-left: 4px solid #087f8c; background: #f0f6f7; }
    .summary-label { margin-bottom: 4px; color: #087f8c; font-size: 8pt; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; }
    .summary p { margin: 0; }
    .metrics { display: flex; gap: 10px; margin: 18px 0 24px; }
    .metric { flex: 1; padding: 12px; border: 1px solid #d8e1e7; border-top: 3px solid #087f8c; }
    .metric strong { display: block; color: #102a43; font-size: 20pt; line-height: 1.15; }
    .metric span { display: block; margin-top: 4px; color: #637586; font-size: 8pt; text-transform: uppercase; letter-spacing: .4px; }
    h2 { margin: 24px 0 8px; padding-bottom: 6px; border-bottom: 1px solid #cbd6de; color: #102a43; font-size: 14pt; break-after: avoid; }
    .section-note { margin: -2px 0 8px; color: #718394; font-size: 8pt; }
    table { width: 100%; border-collapse: collapse; margin: 8px 0 15px; }
    thead { display: table-header-group; }
    th { padding: 8px; background: #102a43; color: #fff; font-size: 8pt; font-weight: 700; text-align: left; }
    td { padding: 8px; border-bottom: 1px solid #e0e6ea; vertical-align: top; }
    tr { break-inside: avoid; }
    tbody tr:nth-child(even) { background: #f6f8f9; }
    .muted { color: #637586; }
    .amount { white-space: nowrap; text-align: right; font-variant-numeric: tabular-nums; }
    .badge { display: inline-block; padding: 2px 7px; border-radius: 10px; background: #e7f2f3; color: #076b76; font-size: 8pt; font-weight: 700; white-space: nowrap; }
    .empty { padding: 12px; border: 1px dashed #cbd6de; color: #718394; font-style: italic; }
    .footer { margin-top: 28px; padding-top: 9px; border-top: 1px solid #cbd6de; color: #718394; font-size: 8pt; }
  </style>
</head>
<body>
  <header class="masthead">
    <div class="brand">AlquilaYa · Gestión</div>
    <div class="document-type">Informe ejecutivo<br>Dashboard</div>
  </header>
  <h1>${escapeHtml(title)}</h1>
  <p class="subtitle">${escapeHtml(subtitle)}</p>
  <p class="generated">Generado el ${escapeHtml(formatDate(new Date().toISOString(), true))} · Uso interno</p>
  ${content}
  <footer class="footer">Este informe resume la información disponible en el ERP al momento de su generación. Documento interno de gestión.</footer>
</body>
</html>`;
}

function sectionTable(title: string, items: ActividadSemanalReporte[]): string {
  const rows = items
    .map(
      (item) => `<tr>
        <td><strong>${escapeHtml(item.titulo)}</strong>${item.detalle ? `<br><span class="muted">${escapeHtml(item.detalle)}</span>` : ""}</td>
        <td style="width: 30%; white-space: nowrap">${escapeHtml(formatDate(item.fecha, true))}</td>
      </tr>`,
    )
    .join("");
  return `<section>
    <h2>${escapeHtml(title)} <span class="muted">(${items.length})</span></h2>
    ${items.length ? `<table><thead><tr><th>Actividad</th><th>Fecha</th></tr></thead><tbody>${rows}</tbody></table>` : `<p class="empty">No se registraron actividades en esta categoría durante el periodo.</p>`}
  </section>`;
}

export function renderDisponiblesHtml(
  departamentos: DepartamentoReportePdf[],
): string {
  const visibles = departamentos.filter(
    (departamento) => departamento.activo && !departamento.disponibilidad,
  );
  const grupos = [
    {
      titulo: "Disponibles",
      items: visibles.filter(
        (departamento) =>
          !departamento.enMantenimiento && !departamento.bloqueado,
      ),
      estado: "Disponible",
    },
    {
      titulo: "En mantenimiento",
      items: visibles.filter((departamento) => departamento.enMantenimiento),
      estado: "Mantenimiento",
    },
    {
      titulo: "Bloqueados",
      items: visibles.filter((departamento) => departamento.bloqueado),
      estado: "Bloqueado",
    },
  ];
  const formatMoney = (value: string | number | null | undefined) =>
    Number(value ?? 0).toLocaleString("es-PE", {
      style: "currency",
      currency: "PEN",
      minimumFractionDigits: 2,
    });
  const sections = grupos
    .map(({ titulo, items, estado }) => {
      const rows = items
        .map((item) => {
          const observacion =
            estado === "Bloqueado"
              ? item.motivoBloqueo
              : estado === "Mantenimiento"
                ? item.maintenanceReason
                : "";
          const meta =
            estado === "Mantenimiento" && item.maintenanceEstimatedDays != null
              ? ` · ${item.maintenanceEstimatedDays} días estimados`
              : "";
          return `<tr>
            <td><strong>${escapeHtml(item.codigo)}</strong><br><span class="muted">${escapeHtml(item.nombre)} · N.º ${escapeHtml(item.numero)}${item.piso != null ? ` · Piso ${escapeHtml(item.piso)}` : ""}</span></td>
            <td><span class="badge">${escapeHtml(estado)}</span></td>
            <td class="amount">${escapeHtml(formatMoney(item.precio))}</td>
            <td>${item.precioNegociable ? "Sí" : "No"}</td>
            <td class="muted">${escapeHtml(observacion ?? "")}${escapeHtml(meta)}</td>
          </tr>`;
        })
        .join("");
      return `<section>
        <h2>${escapeHtml(titulo)} <span class="muted">(${items.length})</span></h2>
        ${items.length
          ? `<table><thead><tr><th>Departamento</th><th>Estado</th><th class="amount">Precio mensual</th><th>Negociable</th><th>Observaciones</th></tr></thead><tbody>${rows}</tbody></table>`
          : `<p class="empty">No hay departamentos en este estado.</p>`}
      </section>`;
    })
    .join("");
  const disponiblesCount = grupos[0]!.items.length;
  const mantenimientoCount = grupos[1]!.items.length;
  const bloqueadosCount = grupos[2]!.items.length;
  const content = `<div class="summary"><div class="summary-label">Resumen ejecutivo</div><p>El inventario refleja <strong>${disponiblesCount} ${disponiblesCount === 1 ? "unidad disponible" : "unidades disponibles"}</strong>, ${mantenimientoCount} ${mantenimientoCount === 1 ? "unidad en mantenimiento" : "unidades en mantenimiento"} y ${bloqueadosCount} ${bloqueadosCount === 1 ? "unidad bloqueada" : "unidades bloqueadas"}. Los precios corresponden a los valores registrados en el ERP.</p></div>
    <div class="metrics">
      <div class="metric"><strong>${grupos[0]!.items.length}</strong><span>Disponibles</span></div>
      <div class="metric"><strong>${grupos[1]!.items.length}</strong><span>En mantenimiento</span></div>
      <div class="metric"><strong>${grupos[2]!.items.length}</strong><span>Bloqueados</span></div>
    </div>
    ${sections}`;
  return layout(
    "Disponibilidad de departamentos",
    `${visibles.length} ${visibles.length === 1 ? "unidad activa" : "unidades activas"} sin contrato vigente`,
    content,
  );
}

export function renderReporteSemanalHtml(
  reporte: ReporteSemanalPdf,
): string {
  const secciones = [
    { titulo: "Contratos renovados", items: reporte.renovaciones },
    { titulo: "Reportes de clientes", items: reporte.reportesClientes },
    { titulo: "Reparaciones realizadas", items: reporte.reparaciones },
    { titulo: "Nuevos contratos", items: reporte.contratosNuevos },
    { titulo: "Nuevas adendas", items: reporte.adendasNuevas },
  ];
  const total = secciones.reduce((suma, seccion) => suma + seccion.items.length, 0);
  const actividades = secciones
    .map((seccion) => sectionTable(seccion.titulo, seccion.items))
    .join("");
  const content = `<div class="summary"><div class="summary-label">Síntesis ejecutiva</div><p>Durante el periodo se registraron <strong>${total} actividades</strong> en cinco frentes operativos. El detalle siguiente resume renovaciones, incidencias reportadas, reparaciones concluidas y movimientos contractuales registrados en el ERP.</p></div>
    <div class="metrics">
      ${secciones.map((seccion) => `<div class="metric"><strong>${seccion.items.length}</strong><span>${escapeHtml(seccion.titulo)}</span></div>`).join("")}
    </div>
    <p class="section-note">Periodo: ${escapeHtml(formatDate(reporte.inicioSemana))} – ${escapeHtml(formatDate(reporte.fechaCorte))}. La fecha de cada actividad corresponde a su registro en el sistema.</p>
    ${actividades}`;
  return layout(
    "Informe semanal de actividad",
    `${formatDate(reporte.inicioSemana)} al ${formatDate(reporte.fechaCorte)}`,
    content,
  );
}
