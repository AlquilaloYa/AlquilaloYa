export type InspeccionPdfItem = {
  categoria?: string;
  texto: string;
  resultado: "OK" | "NEGATIVO" | "";
  motivo?: string;
};

export type InspeccionPdfData = {
  titulo: string;
  numero: string;
  personaInspecciona: string;
  inspectorNombre: string;
  departamentoNombre: string;
  asignadoA: string;
  fecha: string;
  estado: string;
  items: InspeccionPdfItem[];
};

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fechaLegal(iso: string): string {
  try {
    return new Date(iso).toLocaleString("es-PE", {
      dateStyle: "long",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

/**
 * HTML del PDF de inspeccion: incluye SOLAMENTE las revisiones marcadas
 * con check negativo y su descripcion del problema.
 */
export function renderInspeccionHtml(data: InspeccionPdfData): string {
  const negativos = data.items.filter((i) => i.resultado === "NEGATIVO");

  // Agrupa los negativos por categoria preservando el orden de aparicion.
  const grupos = new Map<string, typeof negativos>();
  for (const item of negativos) {
    const cat = (item.categoria ?? "").trim() || "General";
    const arr = grupos.get(cat) ?? [];
    arr.push(item);
    grupos.set(cat, arr);
  }

  let n = 0;
  const bloques = Array.from(grupos.entries())
    .map(([cat, items]) => {
      const rows = items
        .map(
          (item) => `
        <tr>
          <td class="n">${++n}</td>
          <td>${esc(item.texto)}</td>
          <td>${esc((item.motivo ?? "").trim() || "—")}</td>
        </tr>`
        )
        .join("");
      return `<h3>${esc(cat)}</h3>
        <table>
          <thead><tr><th style="width:8%">#</th><th style="width:46%">Punto de revision</th><th>Descripcion del problema</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>`;
    })
    .join("");

  const hallazgos =
    negativos.length > 0
      ? bloques
      : `<p class="ok">Sin observaciones: todos los puntos de revision fueron marcados conforme.</p>`;

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><title>Inspeccion</title>
<style>
@page { size: A4; margin: 18mm; }
body { font-family: Arial, Helvetica, sans-serif; color: #111; line-height: 1.45; }
h1 { text-align: center; font-size: 16pt; margin: 0 0 2mm; letter-spacing: 1px; }
.sistema { text-align: center; color: #294261; font-size: 10pt; margin: 0 0 8mm; text-transform: uppercase; letter-spacing: 2px; }
h2 { font-size: 11.5pt; border-bottom: 1.2px solid #1f2f45; padding-bottom: 2px; margin: 8mm 0 3mm; }
h3 { font-size: 10.5pt; margin: 5mm 0 2mm; color: #1f2f45; }
table { width: 100%; border-collapse: collapse; font-size: 10pt; }
th, td { border: 1px solid #999; padding: 5px 7px; text-align: left; vertical-align: top; }
th { background: #e8eef7; }
td.n { text-align: center; }
.datos td { border: none; padding: 2px 6px 2px 0; font-size: 10.5pt; }
.datos .lbl { color: #294261; font-weight: bold; width: 40%; }
.ok { background: #eef7ee; border: 1px solid #9c9; padding: 8px 10px; font-size: 10.5pt; }
.firmas { margin-top: 18mm; display: flex; justify-content: space-between; font-size: 9.5pt; }
.firmas div { width: 45%; border-top: 1px solid #333; padding-top: 4px; text-align: center; }
.pie { margin-top: 10mm; font-size: 8pt; color: #666; text-align: center; }
</style></head>
<body>
<h1>${data.titulo ? esc(data.titulo).toUpperCase() : "CHECKLIST DE INSPECCION"}</h1>
<p class="sistema">AlquilaYa ERP</p>
<h2>Datos de la inspeccion</h2>
<table class="datos">
  <tr><td class="lbl">N&uacute;mero de departamento:</td><td>${esc(data.numero || "—")}</td></tr>
  <tr><td class="lbl">Persona que inspecciona:</td><td>${esc(data.personaInspecciona)}</td></tr>
  <tr><td class="lbl">Departamento:</td><td>${esc(data.departamentoNombre)}</td></tr>
  <tr><td class="lbl">Fecha y hora:</td><td>${esc(fechaLegal(data.fecha))}</td></tr>
  <tr><td class="lbl">Asignado a reparacion / limpieza:</td><td>${esc(data.asignadoA || "—")}</td></tr>
  <tr><td class="lbl">Registrado en el sistema por:</td><td>${esc(data.inspectorNombre)}</td></tr>
  <tr><td class="lbl">Estado:</td><td>${esc(data.estado)}</td></tr>
</table>
<h2>Observaciones (revisiones no conformes)</h2>
${hallazgos}
<div class="firmas">
  <div>Persona que inspecciona: ${esc(data.personaInspecciona)}</div>
  <div>${data.asignadoA ? `Responsable de atencion: ${esc(data.asignadoA)}` : "Responsable de atencion"}</div>
</div>
<p class="pie">Documento generado por AlquilaYa ERP el ${esc(fechaLegal(new Date().toISOString()))}</p>
</body>
</html>`;
}
