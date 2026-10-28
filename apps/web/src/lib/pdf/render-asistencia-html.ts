export type AsistenciaPdfRegistro = {
  nombre: string;
  dni: string;
  entradaAt: Date | null;
  salidaAt: Date | null;
  refrigerioInicioAt: Date | null;
  refrigerioFinAt: Date | null;
  asistio: boolean;
  createdAt: Date;
};

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fechaHora(value: Date | null): string {
  if (!value) return "—";
  return value.toLocaleString("es-PE", {
    timeZone: "America/Lima",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function renderAsistenciaHtml(
  month: string,
  registros: AsistenciaPdfRegistro[],
): string {
  const monthDate = new Date(`${month}-01T12:00:00-05:00`);
  const monthName = monthDate.toLocaleDateString("es-PE", {
    timeZone: "America/Lima",
    month: "long",
    year: "numeric",
  });
  const rows = registros
    .map(
      (row) => `<tr>
        <td>${esc(fechaHora(row.createdAt))}</td>
        <td>${esc(row.nombre)}</td>
        <td>${esc(row.dni)}</td>
        <td>${esc(fechaHora(row.entradaAt))}</td>
        <td>${esc(fechaHora(row.salidaAt))}</td>
        <td>${esc(fechaHora(row.refrigerioInicioAt))}</td>
        <td>${esc(fechaHora(row.refrigerioFinAt))}</td>
        <td>${row.asistio ? "Sí" : "No"}</td>
      </tr>`,
    )
    .join("");

  const empleados = Array.from(
    new Map(
      registros.map((row) => [
        row.dni,
        `<div class="firma">
          <div class="linea"></div>
          <strong>${esc(row.nombre)}</strong>
          <span>DNI: ${esc(row.dni)}</span>
        </div>`,
      ]),
    ).values(),
  ).join("");

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><title>Asistencia ${esc(monthName)}</title>
<style>
@page { size: A4 landscape; margin: 14mm; }
body { font-family: Arial, Helvetica, sans-serif; color: #111; line-height: 1.35; }
h1 { margin: 0; text-align: center; font-size: 17pt; text-transform: uppercase; }
.subtitulo { margin: 4px 0 18px; text-align: center; color: #444; font-size: 11pt; text-transform: capitalize; }
table { width: 100%; border-collapse: collapse; font-size: 8pt; }
th, td { border: 1px solid #888; padding: 5px 6px; text-align: left; vertical-align: top; }
th { background: #e8eef7; }
tbody tr { break-inside: avoid; }
.vacio { padding: 18px; border: 1px dashed #888; text-align: center; }
h2 { margin: 22px 0 14px; font-size: 12pt; }
.firmas { display: grid; grid-template-columns: repeat(3, 1fr); gap: 30px 22px; }
.firma { min-height: 72px; break-inside: avoid; font-size: 9pt; }
.linea { height: 32px; border-bottom: 1px solid #333; margin-bottom: 5px; }
.firma strong, .firma span { display: block; }
.firma span { margin-top: 2px; color: #444; }
</style></head>
<body>
<h1>Registro mensual de asistencia</h1>
<p class="subtitulo">AlquilaYa ERP · ${esc(monthName)}</p>
<table>
  <thead><tr>
    <th>Fecha</th><th>Nombre</th><th>DNI</th><th>Hora de inicio</th>
    <th>Hora de salida</th><th>Refrigerio inicio</th><th>Refrigerio fin</th><th>Asistió</th>
  </tr></thead>
  <tbody>${rows || `<tr><td class="vacio" colspan="8">No hay asistencias registradas en este mes.</td></tr>`}</tbody>
</table>
<h2>Firmas de conformidad de los trabajadores</h2>
<div class="firmas">${empleados || `<p>No hay trabajadores registrados para firmar.</p>`}</div>
</body>
</html>`;
}
