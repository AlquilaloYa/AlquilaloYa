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

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre",
];

function parseFecha(iso: string): { dia: string; mes: string; año: string } | null {
  if (!iso) return null;
  const datePart = iso.split("T")[0];
  if (!datePart) return null;
  const parts = datePart.split("-");
  if (parts.length < 3) return null;
  const d = parseInt(parts[2] ?? "", 10);
  const m = parseInt(parts[1] ?? "", 10);
  if (isNaN(d) || isNaN(m)) return null;
  return { dia: String(d), mes: MESES[m - 1] ?? "", año: parts[0] ?? "" };
}

function numeroEnLetras(numero: number): string {
  const entero = Math.floor(numero);
  const unidades = ["cero", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve"];
  const especiales: Record<number, string> = { 10: "diez", 11: "once", 12: "doce", 13: "trece", 14: "catorce", 15: "quince", 20: "veinte" };
  const decenas = ["", "", "veinte", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"];
  const centenas = ["", "ciento", "doscientos", "trescientos", "cuatrocientos", "quinientos", "seiscientos", "setecientos", "ochocientos", "novecientos"];
  if (entero < 10) return unidades[entero] ?? "cero";
  if (especiales[entero]) return especiales[entero];
  if (entero < 100) return `${decenas[Math.floor(entero / 10)]}${entero % 10 ? ` y ${unidades[entero % 10]}` : ""}`;
  if (entero < 1000) {
    if (entero === 100) return "cien";
    const resto = entero % 100;
    return `${centenas[Math.floor(entero / 100)]}${resto ? ` ${numeroEnLetras(resto)}` : ""}`.trim();
  }
  if (entero < 1000000) {
    const miles = Math.floor(entero / 1000);
    const resto = entero % 1000;
    const milesTexto = miles === 1 ? "mil" : `${numeroEnLetras(miles)} mil`;
    return `${milesTexto}${resto ? ` ${numeroEnLetras(resto)}` : ""}`;
  }
  return String(entero);
}

function codigoCorto(codigo: string): string {
  const s = (codigo ?? "").trim();
  if (!s) return s;
  const idx = s.lastIndexOf("-");
  if (idx < 0) return s;
  return s.slice(idx + 1).trim() || s;
}

/**
 * Renderiza el HTML de la ADENDA a partir de un snapshot de adenda,
 * donde el texto del anexo "ADENDA" vive en snapshot.anexos[0].contenido
 * y los comparecientes/inmueble se copian del snapshot contractual.
 * Si el snapshot es de extensión (tipoDocumento ADENDA_EXTENSION) usa
 * el layout especial con las fechas de término anterior y nueva.
 * Si el snapshot de adenda incluye fechaInicioAdenda/fechaFinAdenda usa
 * la plantilla formal (modelo Benavides) con el nuevo plazo de la adenda.
 */
export function renderAdendaHtml(snapshot: ContractSnapshot): string {
  const contrato = snapshot.datosContrato as Record<string, unknown>;
  if (contrato.tipoDocumento === "ADENDA_EXTENSION") {
    return renderExtensionAdendaHtml(snapshot);
  }
  if (contrato.fechaInicioAdenda && contrato.fechaFinAdenda) {
    return renderAdendaPlantillaHtml(snapshot);
  }
  const cliente = snapshot.datosCliente as Record<string, unknown>;
  const departamento = snapshot.datosDepartamento as Record<string, unknown>;

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

/** Plantilla formal de adenda (modelo Benavides) usando datos del snapshot. */
export function renderAdendaPlantillaHtml(snapshot: ContractSnapshot): string {
  const contrato = snapshot.datosContrato as Record<string, unknown>;
  const cliente = snapshot.datosCliente as Record<string, unknown>;
  const departamento = snapshot.datosDepartamento as Record<string, unknown>;

  const clienteNombre = field(cliente, ["nombres", "nombreCompleto", "razonSocial", "nomCliente"]);
  const clienteApellidos = field(cliente, ["apellidos"]);
  const clienteDocumento = field(cliente, ["documentoIdentidad", "documento", "ruc"]);

  const numeroAdenda = field(contrato, ["numeroAdenda"]) || "1";
  const fechaInicioOriginal = parseFecha(field(contrato, ["fechaInicio"]));
  const fechaFinOriginal = parseFecha(field(contrato, ["fechaFin"]));
  const fechaInicioAdenda = parseFecha(field(contrato, ["fechaInicioAdenda"]));
  const fechaFinAdenda = parseFecha(field(contrato, ["fechaFinAdenda"]));
  const montoRenta = parseFloat(field(contrato, ["montoCanonMensual"])) || 0;

  const deptoNumero = field(departamento, ["numero"]) || codigoCorto(field(departamento, ["codigo"]));
  const piso = field(departamento, ["piso"]);
  const nombreCompleto = [clienteNombre, clienteApellidos].filter(Boolean).join(" ") || "________________";
  const domicilio = field(cliente, ["domicilio"]) || "________________";

  const nacimiento = field(cliente, ["nacionalidad"]) || "Peruano(a)";
  const montoRentaTxt = Math.round(montoRenta).toString();
  const montoLetras = `${numeroEnLetras(Math.floor(montoRenta))} y ${String(Math.round((montoRenta % 1) * 100)).padStart(2, "0")}/100 soles`;

  const fmt = (obj: { dia: string; mes: string; año: string } | null): string =>
    obj ? `${obj.dia} de ${obj.mes} del ${obj.año}` : "________________";

  const fmtMesFin = (obj: { dia: string; mes: string; año: string } | null): string =>
    obj ? `${obj.dia}, ${obj.mes} del ${obj.año}` : "________________";

  const finOriginal = fmt(fechaFinOriginal);
  const inicioOriginal = fmt(fechaInicioOriginal);
  const inicioAdenda = fmt(fechaInicioAdenda);
  const finAdenda = fmt(fechaFinAdenda);
  const finAdendaMesFin = fmtMesFin(fechaFinAdenda);

  return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>Primera Adenda al Contrato de Arrendamiento</title>
    <style>
        @page { size: A4; margin: 20mm; }
        body {
            font-family: Arial, sans-serif;
            font-size: 10pt;
            line-height: 1.4;
            color: #000000;
            background-color: #ffffff;
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            min-height: 297mm;
            height: auto;
        }
        h1 {
            text-align: center;
            font-size: 13pt;
            font-weight: bold;
            text-transform: uppercase;
            margin-top: 0;
            margin-bottom: 25px;
            line-height: 1.3;
        }
        h2 {
            font-size: 11pt;
            font-weight: bold;
            text-transform: uppercase;
            margin-top: 18px;
            margin-bottom: 8px;
        }
        p {
            font-size: 10pt;
            text-align: justify;
            margin-bottom: 12px;
        }
        .bold { font-weight: bold; }
        .section-block { page-break-inside: avoid; break-inside: avoid; margin-bottom: 12px; }
        .signature-section {
            margin-top: 50px;
            width: 100%;
            page-break-inside: avoid;
            break-inside: avoid;
        }
        .signature-table { width: 100%; border-collapse: collapse; }
        .signature-table td { width: 50%; vertical-align: top; padding: 0 15px; text-align: center; }
        .signature-line { border-top: 1px solid #000000; margin-top: 60px; margin-bottom: 8px; }
        .footer {
            margin-top: 40px;
            display: flex;
            justify-content: space-between;
            font-size: 9pt;
            color: #555555;
            border-top: 1px solid #cccccc;
            padding-top: 8px;
            page-break-inside: avoid;
            break-inside: avoid;
        }
    </style>
</head>
<body>

    <h1>ADENDA N° ${numeroAdenda} AL CONTRATO DE<br>ARRENDAMIENTO</h1>

    <div class="section-block">
        <p>Conste por el presente documento la <span class="bold">ADENDA AL CONTRATO DE ARRENDAMIENTO</span> de fecha <span class="bold">${inicioOriginal}</span> que celebran de una parte la Srta. <span class="bold">Emely Alexandra CARPIO PINTO</span>, identificada con D.N.I. N° <span class="bold">76373620</span>, domiciliada en <span class="bold">Av. Alfredo Benavides 2195, distrito de Miraflores, Departamento y Provincia de Lima</span>, a quien en adelante se le denominará <span class="bold">LA ARRENDADOR(A)</span>; y, de la otra parte, el Sr.(a) <span class="bold">${nombreCompleto}</span>, identificado(a) con D.N.I. / C.E. / Pasaporte N° <span class="bold">${clienteDocumento || "________________"}</span>, de nacionalidad <span class="bold">${nacimiento}</span>, domiciliado(a) en <span class="bold">${domicilio}</span>, a quien en adelante se denominará <span class="bold">EL ARRENDATARIO(A)</span>, en los términos y bajo las condiciones siguientes:</p>
    </div>

    <div class="section-block">
        <h2>ANTECEDENTES</h2>
        <p><span class="bold">PRIMERO.-</span> Con fecha del <span class="bold">${inicioOriginal} hasta el día ${finOriginal}</span>; las partes celebraron un Contrato de Arrendamiento respecto al mini departamento N° <span class="bold">${deptoNumero}</span> ubicado en <span class="bold">Av. Alfredo Benavides N° 2195 D, Miraflores, Piso ${piso}, provincia y departamento de Lima</span>; con una merced conductiva de S/ <span class="bold">${montoRentaTxt}.00 (${montoLetras})</span> mensuales, la cual incluye mantenimiento de S/ 50.00 (cincuenta con 00/100 soles) y los servicios de luz y agua, siendo cancelada en la Cta. de ahorros del banco BCP N° <span class="bold">19497202418059 CCI: 00219419720241805997</span>.</p>
    </div>

    <div class="section-block">
        <h2>OBJETO</h2>
        <p><span class="bold">SEGUNDO.-</span> Las partes acuerdan modificar la Cláusula QUINTA del contrato de arrendamiento del Mini departamento N° <span class="bold">${deptoNumero}</span>, bajo los siguientes términos:</p>

        <p><span class="bold">PLAZO DEL CONTRATO:</span></p>
        <p><span class="bold">QUINTA.-</span> Las partes convienen fijar un plazo de duración determinada para el presente contrato, el cual será del <span class="bold">${inicioAdenda} hasta el ${finAdendaMesFin}</span>; fecha en la que EL ARRENDATARIO está obligado a desocupar y devolver el bien arrendado.</p>
        <p>El presente contrato podrá ser renovado con una anticipación no menor de quince (15) días calendarios a la conclusión del arrendamiento y que exista acuerdo entre ambas partes confirmando via WhatsApp al telf. <span class="bold">937205274</span> o mediante adenda firmada.</p>
    </div>

    <div class="section-block">
        <h2>RATIFICACIÓN</h2>
        <p><span class="bold">TERCERO.</span> Salvo por la modificación señalada en la presente adenda, todas las demás cláusulas y condiciones del contrato de arrendamiento original se mantienen vigentes y sin alteración alguna.</p>

        <p>En señal de conformidad, ambas partes suscriben la presente adenda en dos ejemplares de igual tenor y validez, en esta ciudad.</p>

        <p>Miraflores, <span class="bold">${inicioAdenda}</span>.</p>
    </div>

    <div class="signature-section">
        <table class="signature-table">
            <tr>
                <td>
                    <div class="signature-line"></div>
                    <p><span class="bold">LA ARRENDADOR(A)</span><br>
                    Emely Alexandra Carpio Pinto<br>
                    DNI: 76373620</p>
                </td>
                <td>
                    <div class="signature-line"></div>
                    <p><span class="bold">EL ARRENDATARIO(A)</span><br>
                    ${nombreCompleto}<br>
                    DNI/PASAPORTE: ${clienteDocumento || "________________"}</p>
                </td>
            </tr>
        </table>
    </div>

    <div class="footer">
        <span>Adenda al Contrato de Arrendamiento</span>
        <span>Página 1</span>
    </div>

</body>
</html>`;
}

/**
 * Renderiza el HTML de una ADENDA DE EXTENSIÓN a partir de su snapshot.
 * El snapshot guarda en datosContrato: codigoBase, fechaFinAnterior y
 * fechaFin (nueva fecha de término); el texto completo vive en el anexo.
 */
export function renderExtensionAdendaHtml(snapshot: ContractSnapshot): string {
  const cliente = snapshot.datosCliente as Record<string, unknown>;
  const departamento = snapshot.datosDepartamento as Record<string, unknown>;
  const contrato = snapshot.datosContrato as Record<string, unknown>;

  const clienteNombre = field(cliente, ["nombres", "nombreCompleto", "razonSocial", "nomCliente"]);
  const clienteApellidos = field(cliente, ["apellidos"]);
  const clienteDocumento = field(cliente, ["documentoIdentidad", "documento", "ruc"]);

  const titulo = String(contrato.titulo ?? "ADENDA DE EXTENSIÓN") || "ADENDA DE EXTENSIÓN";
  const codigoBase = field(contrato, ["codigoBase"]) || snapshot.codigoContrato;
  const codigoAdenda = field(contrato, ["codigoContrato"]) || snapshot.codigoContrato;
  const finAnterior = field(contrato, ["fechaFinAnterior"]);
  const nuevaFin = field(contrato, ["fechaFin"]);
  const montoCanon = field(contrato, ["montoCanonMensual", "montoCanonMensualFormatted"]);
  const mantenimiento = field(contrato, ["mantenimiento"]);
  const contenido =
    (snapshot.anexos ?? [])
      .map((a) => a.contenido)
      .filter(Boolean)
      .join("\n\n") ||
    "Las partes acuerdan extender el plazo del contrato de arrendamiento.";

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
  .destacada { border: 2px solid #3f6212; border-radius: 6px; padding: 12px 14px; background: #f7f7f0; margin: 12px 0; }
  .destacada p { margin: 2px 0; font-size: 14px; font-weight: 600; color: #111827; }
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
    <h1>${escapeHtml(titulo)}</h1>
    <div class="sub">Contrato base: ${escapeHtml(codigoBase)} · Adenda: ${escapeHtml(codigoAdenda)}</div>
    <div class="meta">Documento generado a partir del snapshot de adenda · ${escapeHtml(snapshot.id)}</div>
  </div>

  <h2>Comparecientes</h2>
  <table>
    ${richRow("Arrendatario", [clienteNombre, clienteApellidos].filter(Boolean).join(" "))}
    ${richRow("Documento", clienteDocumento)}
    ${richRow("Inmueble", field(departamento, ["nombre", "nomDepartamento"]))}
    ${richRow("Código del departamento", field(departamento, ["codigo"]))}
  </table>

  <h2>Extensión del plazo</h2>
  <div class="destacada">
    <p>Fecha de término original: ${escapeHtml(finAnterior || "—")}</p>
    <p>Nueva fecha de término: ${escapeHtml(nuevaFin || "—")}</p>
  </div>
  <table>
    ${richRow("Canon mensual", montoCanon)}
    ${richRow("Mantenimiento mensual", mantenimiento)}
  </table>

  <div class="adenda">
    <h3>Contenido de la adenda</h3>
    <p>${escapeHtml(contenido)}</p>
  </div>

  <div class="signature">
    <div><span class="line">Firma del arrendador(a)</span></div>
    <div><span class="line">Firma del arrendatario</span></div>
  </div>
</body>
</html>`;
}