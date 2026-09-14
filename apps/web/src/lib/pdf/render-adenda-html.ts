import type { ContractSnapshot } from "@contract/domain/snapshot";

function field(obj: Record<string, unknown> | undefined, keys: string[]): string {
  if (!obj) return "";
  for (const key of keys) {
    const v = obj[key];
    if (v !== undefined && v !== null && v !== "") return String(v);
  }
  return "";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function richRow(label: string, value: string): string {
  return `<tr><td class="label">${escapeHtml(label)}</td><td>${escapeHtml(value || "—")}</td></tr>`;
}

/**
 * Renderiza el HTML de la ADENDA a partir de un snapshot de adenda,
 * donde el texto del anexo "ADENDA" vive en snapshot.anexos[0].contenido
 * y los comparecientes/inmueble se copian del snapshot contractual.
 */
export function renderAdendaHtml(snapshot: ContractSnapshot): string {
  const cliente = snapshot.datosCliente as Record<string, unknown>;
  const departamento = snapshot.datosDepartamento as Record<string, unknown>;
  const contrato = snapshot.datosContrato as Record<string, unknown>;

  const clienteNombre = field(cliente, ["nombres", "nombreCompleto", "razonSocial", "nomCliente"]);
  const clienteApellidos = field(cliente, ["apellidos"]);
  const clienteDocumento = field(cliente, ["documentoIdentidad", "documento", "ruc"]);

  const titulo = String(contrato.titulo ?? "ADENDA") || "ADENDA";
  const contenido =
    (snapshot.anexos ?? [])
      .map((a) => a.contenido)
      .filter(Boolean)
      .join("\n\n") ||
    "La presente adenda modifica, precisa o complementa los términos del contrato original.";

  const codigo = field(contrato, ["codigoContrato"]) || snapshot.codigoContrato;

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<style>
  @page { size: A4; margin: 24mm 20mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1f2937; margin: 0; line-height: 1.5; }
  .header { border-bottom: 3px solid #3f6212; padding-bottom: 16px; margin-bottom: 24px; }
  h1 { font-size: 22px; margin: 0 0 4px; color: #111827; }
  .sub { font-size: 13px; color: #6b7280; }
  .meta { font-size: 12px; color: #6b7280; margin-top: 8px; }
  h2 { font-size: 16px; margin: 24px 0 10px; color: #374151; text-transform: uppercase; letter-spacing: .03em; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0; }
  td { padding: 6px 8px; font-size: 13px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
  td.label { width: 40%; font-weight: 600; color: #4b5563; }
  .adenda { margin: 16px 0; padding: 16px; border: 1px solid #d1d5db; border-radius: 6px; }
  .adenda h3 { margin: 0 0 8px; font-size: 15px; color: #111827; }
  .adenda p { margin: 0; font-size: 13px; white-space: pre-wrap; }
  .signature { margin-top: 48px; display: flex; justify-content: space-between; }
  .signature div { width: 45%; text-align: center; }
  .signature .line { border-top: 1px solid #6b7280; padding-top: 6px; font-size: 12px; color: #4b5563; }
</style>
</head>
<body>
  <div class="header">
    <h1>ADENDA AL CONTRATO DE ARRENDAMIENTO</h1>
    <div class="sub">Contrato base: ${escapeHtml(codigo)}</div>
    <div class="meta">Documento generado a partir del snapshot de adenda · ${escapeHtml(snapshot.id)}</div>
  </div>

  ${titulo !== "ADENDA" ? `<h2>${escapeHtml(titulo)}</h2>` : ""}

  <div class="adenda">
    <h3>Contenido de la adenda</h3>
    <p>${escapeHtml(contenido)}</p>
  </div>

  <h2>Comparecientes</h2>
  <table>
    ${richRow("Arrendatario", [clienteNombre, clienteApellidos].filter(Boolean).join(" "))}
    ${richRow("Documento", clienteDocumento)}
    ${richRow("Inmueble", field(departamento, ["nombre", "nomDepartamento"]))}
    ${richRow("Código del departamento", field(departamento, ["codigo"]))}
  </table>

  <div class="signature">
    <div><span class="line">Firma del arrendador(a)</span></div>
    <div><span class="line">Firma del arrendatario</span></div>
  </div>
</body>
</html>`;
}