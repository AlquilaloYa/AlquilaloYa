import type { ContractSnapshot } from "@contract/domain/snapshot";

function field(obj: Record<string, unknown> | undefined, keys: string[]): string {
  if (!obj) return "";
  for (const key of keys) {
    const v = obj[key];
    if (v !== undefined && v !== null && v !== "") return String(v);
  }
  return "";
}

function sectionTitle(text: string): string {
  return `<h2>${escapeHtml(text)}</h2>`;
}

function richRow(label: string, value: string): string {
  return `<tr><td class="label">${escapeHtml(label)}</td><td>${escapeHtml(value || "—")}</td></tr>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Renderiza el HTML del contrato a partir del snapshot congelado.
 * ÚNICAMENTE usa datos del snapshot: garantiza reproducción histórica e inmutabilidad.
 */
/** Anexo con salto de página para la copia de DNI (funciona con o sin plantilla). */
function buildDatosArrendatarioSheet(snapshot: ContractSnapshot): string {
  const cliente = snapshot.datosCliente as Record<string, unknown>;
  const contrato = snapshot.datosContrato as Record<string, unknown>;
  const ficha =
    contrato.datosArrendatario && typeof contrato.datosArrendatario === "object"
      ? (contrato.datosArrendatario as Record<string, unknown>)
      : {};

  const nombre = field(ficha, ["nombre"]) || field(cliente, ["nombres", "nombreCompleto", "razonSocial", "nomCliente"]);
  const apellido = field(ficha, ["apellido"]) || field(cliente, ["apellidos"]);
  const documentoIdentidad = field(ficha, ["documentoIdentidad"]) || field(cliente, ["documentoIdentidad", "documento", "ruc"]);
  const ruc = field(ficha, ["ruc"]) || field(cliente, ["ruc"]);
  const email = field(ficha, ["email"]) || field(cliente, ["email"]);
  const telefono = field(ficha, ["telefono"]) || field(cliente, ["telefono"]);
  const codigoPais = field(ficha, ["codigoPais"]) || field(cliente, ["codigoPais"]);
  const domicilio = field(ficha, ["domicilio"]) || field(cliente, ["domicilio"]);
  const nacionalidad = field(ficha, ["nacionalidad"]) || field(cliente, ["nacionalidad"]);
  const tipoPersona = field(ficha, ["tipoPersona"]) || "NATURAL";

  const emergencia = ficha.contactoEmergencia as Record<string, unknown> | null | undefined;
  const emergenciaTexto = emergencia
    ? [field(emergencia, ["nombre"]), field(emergencia, ["parentesco"]), field(emergencia, ["telefono"])]
        .filter(Boolean)
        .join(" · ")
    : "";
  const mascotasItems = Array.isArray(ficha.mascotasItems)
    ? ficha.mascotasItems.map(String).filter(Boolean)
    : Array.isArray(contrato.mascotasItems)
    ? (contrato.mascotasItems as unknown[]).map(String).filter(Boolean)
    : [];
  const tieneMascotas = Boolean(ficha.mascotas) || mascotasItems.length > 0;

  const nombreCompleto = [nombre, apellido].filter(Boolean).join(" ") || "________________";

  return `
  ${sectionTitle("Hoja de datos del arrendatario")}
  <table>
    ${richRow("Nombres", nombre)}
    ${richRow("Apellidos", apellido)}
    ${richRow("Tipo de persona", tipoPersona === "NATURAL" ? "Persona Natural" : tipoPersona === "JURIDICA" ? "Persona Jurídica" : tipoPersona)}
    ${richRow("Documento de identidad", documentoIdentidad)}
    ${richRow("RUC", ruc)}
    ${richRow("Domicilio", domicilio)}
    ${richRow("Nacionalidad", nacionalidad)}
    ${richRow("Correo electrónico", email)}
    ${richRow("Teléfono", telefono ? `${codigoPais ? `+${codigoPais} ` : ""}${telefono}` : "")}
    ${richRow("Contacto de emergencia", emergenciaTexto)}
    ${richRow("Mascotas", tieneMascotas ? (mascotasItems.length > 0 ? mascotasItems.join(", ") : "Sí") : "No")}
  </table>
  <div class="signature">
    <div>
      <span class="line">Firma del arrendador(a)</span><br />
      <span style="font-size:11px;">${escapeHtml(nombreCompleto)}</span><br />
      <span style="font-size:11px;">Documento: ${escapeHtml(documentoIdentidad || "—")}</span>
    </div>
    <div>
      <span class="line">Firma del arrendatario(a)</span><br />
      <span style="font-size:11px;">${escapeHtml(nombreCompleto)}</span><br />
      <span style="font-size:11px;">Documento: ${escapeHtml(documentoIdentidad || "—")}</span>
    </div>
  </div>`;
}

export function renderContractHtml(snapshot: ContractSnapshot): string {
  const cliente = snapshot.datosCliente as Record<string, unknown>;
  const departamento = snapshot.datosDepartamento as Record<string, unknown>;
  const contrato = snapshot.datosContrato as Record<string, unknown>;

  const clienteNombre = field(cliente, [
    "nombres",
    "nombreCompleto",
    "razonSocial",
    "nomCliente",
  ]);
  const clienteApellidos = field(cliente, ["apellidos"]);
  const clienteDocumento = field(cliente, [
    "documentoIdentidad",
    "documento",
    "ruc",
  ]);
  const clienteEmail = field(cliente, ["email"]);
  const clienteTelefono = field(cliente, ["telefono"]);

  const monto = field(contrato, ["montoCanonMensual"]);
  const garantia = field(contrato, ["depositoGarantia"]);
  const inicio = field(contrato, ["fechaInicio"]);
  const fin = field(contrato, ["fechaFin"]);
  const codigo = field(contrato, ["codigoContrato"]) || snapshot.codigoContrato;

  const clausulas = (snapshot.clausulas ?? [])
    .map(
      (c) => `<div class="clause"><p>${escapeHtml(c.contenido)}</p></div>`
    )
    .join("");

  const anexos = (snapshot.anexos ?? [])
    .map(
      (a) => `<div class="annex"><p>${escapeHtml(a.contenido)}</p></div>`
    )
    .join("");

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
  .clause, .annex { padding: 10px 0; font-size: 13px; }
  .clause + .clause, .annex + .annex, .clause + .annex { border-top: 1px solid #f3f4f6; }
  .signature { margin-top: 48px; display: flex; justify-content: space-between; }
  .signature div { width: 45%; text-align: center; }
  .signature .line { border-top: 1px solid #6b7280; padding-top: 6px; font-size: 12px; color: #4b5563; }
</style>
</head>
<body>
  <div class="header">
    <h1>CONTRATO DE ARRENDAMIENTO</h1>
    <div class="sub">${escapeHtml(codigo)}</div>
    <div class="meta">Documento generado a partir del snapshot contractual · ${escapeHtml(snapshot.id)}</div>
  </div>

  ${sectionTitle("Cliente")}
  <table>
    ${richRow("Nombre", [clienteNombre, clienteApellidos].filter(Boolean).join(" "))}
    ${richRow("Documento", clienteDocumento)}
    ${richRow("Email", clienteEmail)}
    ${richRow("Teléfono", clienteTelefono)}
  </table>

  ${sectionTitle("Departamento")}
  <table>
    ${richRow("Nombre", field(departamento, ["nombre", "nomDepartamento"]))}
    ${richRow("Código", field(departamento, ["codigo"]))}
  </table>

  ${sectionTitle("Condiciones contractuales")}
  <table>
    ${richRow("Canon mensual", monto)}
    ${richRow("Depósito de garantía", garantia)}
    ${richRow("Fecha de inicio", inicio)}
    ${richRow("Fecha de fin", fin)}
  </table>

  ${sectionTitle("Cláusulas")}
  ${clausulas || "<p class='sub'>Sin cláusulas registradas.</p>"}

  ${sectionTitle("Anexos")}
  ${anexos || "<p class='sub'>Sin anexos registrados.</p>"}

  ${buildDatosArrendatarioSheet(snapshot)}

  <div class="signature">
    <div><span class="line">Firma del arrendador</span></div>
    <div><span class="line">Firma del arrendatario</span></div>
  </div>
</body>
</html>`;
}