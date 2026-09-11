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

/**
 * Regresa solo el segmento final del codigo del departamento (despues del
 * ultimo guion). Ej: "BEN2195-18" -> "18", "ANG170-8C" -> "8C". Si no hay
 * guion, devuelve el codigo tal cual.
 */
function codigoCorto(codigo: string): string {
  const s = (codigo ?? "").trim();
  if (!s) return s;
  const idx = s.lastIndexOf("-");
  if (idx < 0) return s;
  return s.slice(idx + 1).trim() || s;
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

function montoNumerico(val: string): number {
  const n = parseFloat(val);
  return isNaN(n) ? 0 : n;
}

function formatCurrency(val: string): string {
  return montoNumerico(val).toFixed(2);
}

function numeroEnLetras(numero: string): string {
  const entero = Math.floor(montoNumerico(numero));
  const unidades = ["cero", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve"];
  const especiales: Record<number, string> = { 10: "diez", 11: "once", 12: "doce", 13: "trece", 14: "catorce", 15: "quince", 20: "veinte" };
  const decenas = ["", "", "veinte", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"];
  const centenas = ["", "ciento", "doscientos", "trescientos", "cuatrocientos", "quinientos", "seiscientos", "setecientos", "ochocientos", "novecientos"];
  if (entero < 10) return unidades[entero] ?? "cero";
  if (especiales[entero]) return especiales[entero];
  if (entero < 100) return `${decenas[Math.floor(entero / 10)]}${entero % 10 ? ` y ${unidades[entero % 10]}` : ""}`;
  if (entero < 1000) {
    if (entero === 100) return "cien";
    return `${centenas[Math.floor(entero / 100)]} ${numeroEnLetras(String(entero % 100))}`.trim();
  }
  if (entero < 1000000) {
    const miles = Math.floor(entero / 1000);
    const resto = entero % 1000;
    const milesTexto = miles === 1 ? "mil" : `${numeroEnLetras(String(miles))} mil`;
    return `${milesTexto}${resto ? ` ${numeroEnLetras(String(resto))}` : ""}`;
  }
  return String(entero);
}

function montoEnLetras(val: string): string {
  const numero = montoNumerico(val);
  const centimos = Math.round((numero - Math.floor(numero)) * 100).toString().padStart(2, "0");
  return `${numeroEnLetras(val)} con ${centimos}/100 soles`;
}

function dniMarkup(attachments: unknown): string {
  if (!Array.isArray(attachments) || attachments.length === 0) {
    return "<p>No se adjuntó copia de DNI.</p>";
  }
  return attachments
    .filter((item): item is { dataUrl: string; tipo?: string; nombre?: string } =>
      Boolean(item && typeof item === "object" && typeof (item as { dataUrl?: unknown }).dataUrl === "string")
    )
    .map((item) => {
      const src = escapeHtml(item.dataUrl);
      const nombre = escapeHtml(item.nombre ?? "Copia de DNI");
      if ((item.tipo ?? "").toLowerCase() === "application/pdf" || item.dataUrl.startsWith("data:application/pdf")) {
        return `<p class="dni-note" style="text-align:center;font-size:11pt;">Se adjunta copia del DNI en formato PDF ( "${nombre}" ). Las páginas reales se incorporan en la versión para notaría.</p>`;
      }
      if (item.dataUrl.startsWith("data:image/")) {
        return `<img src="${src}" alt="${nombre}" class="dni-image" style="display:block;margin:0 auto 8mm;width:auto;height:auto;max-width:165mm;max-height:225mm;object-fit:contain;" />`;
      }
      return `<p>Archivo de DNI no compatible: ${nombre}</p>`;
    })
    .join("\n");
}

/** Anexo con salto de página para la copia de DNI (funciona con o sin plantilla). */
function buildDniAnnex(dni: string): string {
  return (
    '<div style="page-break-before:always;text-align:center;">' +
    '<h2 style="text-align:center;">Copia de DNI del arrendatario</h2>' +
    dni +
    "</div>"
  );
}

function tieneCopiaDni(attachments: unknown): boolean {
  return Array.isArray(attachments) && attachments.length > 0;
}

/** Marca para la "Copia de baucher" (dataURL o nota si no hay). */
function baucherMarkup(baucher: string): string {
  if (!baucher) {
    return '<p style="text-align:center;">No se adjuntó copia de baucher.</p>';
  }
  if (baucher.startsWith("data:application/pdf")) {
    return '<p class="dni-note" style="text-align:center;font-size:11pt;">Se adjunta copia del baucher en formato PDF. La página real se incorpora en la versión para notaría.</p>';
  }
  const src = escapeHtml(baucher);
  return `<img src="${src}" alt="Copia de baucher" class="dni-image" style="display:block;margin:16px auto 0;width:auto;height:auto;max-width:165mm;max-height:200mm;object-fit:contain;" />`;
}

function detalleGarantia(
  garantia: string,
  separacionDetalle: Record<string, unknown>,
  firma = ""
): string {
  const tipo = field(separacionDetalle, ["tipo"]);
  const monto = field(separacionDetalle, ["monto"]) || "500.00";
  const fecha = field(separacionDetalle, ["fecha"]);
  const fSep = parseFecha(fecha);
  const fechaTexto = fSep ? `${fSep.dia} de ${fSep.mes} de ${fSep.año}` : "________";
  const garantiaTexto = formatCurrency(garantia);
  const garantiaLetras = montoEnLetras(garantia);
  const apertura = `En la fecha del presente documento, EL ARRENDATARIO(A) deberá de entregar a LA ARRENDADORA la garantía total de S/ ${garantiaTexto} (${garantiaLetras}).`;

  if (tipo === "FLUCTUANTE") {
    return `${apertura} El arrendatario ha reservado previamente el inmueble mediante una separación fluctuante de S/ ${formatCurrency(monto)} (${montoEnLetras(monto)}), realizada el día ${fechaTexto}, quedando obligado a cancelar el saldo restante al momento de la firma y notarización del contrato${firma}.`;
  }
  if (tipo === "TOTAL") {
    return `${apertura} El arrendatario la entregará íntegramente a la firma de este documento${firma}.`;
  }
  return `${apertura} El arrendatario ha reservado previamente el inmueble mediante una separación de S/ 500.00 (quinientos con 00/100 soles), realizada el día ${fechaTexto}, quedando obligado a cancelar el saldo restante al momento de la firma y notarización del contrato${firma}.`;
}

/**
 * Renderiza el HTML del contrato a partir del snapshot congelado.
 * Si se provee `templateHtml`, reemplaza [PLACEHOLDERS] con datos del snapshot;
 * de lo contrario usa el formato genérico del sistema.
 */
export function renderContractHtml(
  snapshot: ContractSnapshot,
  templateHtml?: string | null
): string {
  const cliente = snapshot.datosCliente as Record<string, unknown>;
  const departamento = snapshot.datosDepartamento as Record<string, unknown>;
  const contrato = snapshot.datosContrato as Record<string, unknown>;

  const codigoDepto = codigoCorto(field(departamento, ["codigo"]));
  const piso = field(departamento, ["piso"]);

  const clienteNombre = field(cliente, ["nombres", "nombreCompleto", "razonSocial", "nomCliente"]);
  const clienteApellidos = field(cliente, ["apellidos"]);
  const clienteDocumento = field(cliente, ["documentoIdentidad", "documento", "ruc"]);
  const clienteNombreCompleto = [clienteNombre, clienteApellidos].filter(Boolean).join(" ");

  const monto = field(contrato, ["montoCanonMensual"]);
  const garantia = field(contrato, ["depositoGarantia"]);
  const inicio = field(contrato, ["fechaInicio"]);
  const fin = field(contrato, ["fechaFin"]);
  const separacionDetalle = (contrato.separacionDetalle ?? {}) as Record<string, unknown>;
  const montoSeparacion = field(separacionDetalle, ["monto"]);
  const tipoSeparacion = field(separacionDetalle, ["tipo"]);
  const fechaSeparacion = field(separacionDetalle, ["fecha"]);
  const dni = dniMarkup(contrato.copiaDni);
  const dniAnnex = buildDniAnnex(dni);
  const hayDni = tieneCopiaDni(contrato.copiaDni);
  const baucher = baucherMarkup(field(separacionDetalle, ["baucherSeparacion"]));

  const totalMonto = (montoNumerico(monto) + 50).toFixed(2);

  const inicioFecha = parseFecha(inicio);
  const finFecha = parseFecha(fin);

  const clausulas = (snapshot.clausulas ?? [])
    .map((c) => `<p>${escapeHtml(c.contenido)}</p>`)
    .join("\n");

  // ── Si hay HTML de plantilla, reemplazar [PLACEHOLDERS] ──
  if (templateHtml) {
    const replacements: Record<string, string> = {
      "[NOMBRE DEL ARRENDATARIO]": clienteNombreCompleto || "________________",
      "[NOMBRE COMPLETO]": clienteNombreCompleto || "________________",
      "[NÚMERO DNI]": clienteDocumento || "________________",
      "[NÚMERO]": clienteDocumento || "________________",
      "[NACIONALIDAD]": "Peruana",
      "[DOMICILIO]": field(cliente, ["domicilio"]) || "________________",
      "[NÚMERO DE DEPTO]": codigoDepto || "________________",
      "[PISO]": piso,
      "[MONTO RENTA]": formatCurrency(monto),
      "[TOTAL MONTO]": totalMonto,
      "[DÍA DE PAGO]": inicioFecha ? inicioFecha.dia.padStart(2, "0") : "05",
      "[MONTO GARANTÍA]": formatCurrency(garantia),
      "[MONTO TOTAL GARANTÍA NUMEROS]": formatCurrency(garantia),
      "[MONTO TOTAL GARANTÍA LETRAS]": formatCurrency(garantia),
      "[MONTO FLUCTUANTE NUMEROS]": montoSeparacion || "________",
      "[MONTO FLUCTUANTE LETRAS]": montoSeparacion || "________",
      "[FECHA DE ABONO]": fechaSeparacion?.split("T")[0] ?? "________",
      "[TIPO SEPARACION]": tipoSeparacion || "________",
      "[DETALLE GARANTIA]": detalleGarantia(
        garantia,
        separacionDetalle,
        inicioFecha ? ` el día ${inicioFecha.dia} de ${inicioFecha.mes} del ${inicioFecha.año}` : ""
      ),
      "[INVENTARIO]": (Array.isArray(contrato.muebleriaItems) ? contrato.muebleriaItems : [])
        .map(String)
        .join("; ") || "________________",
      "[ESPECIE]": (Array.isArray(contrato.mascotasItems) ? contrato.mascotasItems : [])
        .map(String)
        .join(", ") || "________________",
      "[DÍA]": inicioFecha?.dia ?? "___",
      "[MES]": inicioFecha?.mes ?? "__________",
      "[AÑO]": inicioFecha?.año ?? "______",
      "[DÍA INICIO]": inicioFecha?.dia ?? "___",
      "[MES INICIO]": inicioFecha?.mes ?? "__________",
      "[AÑO INICIO]": inicioFecha?.año ?? "______",
      "[DÍA FIN]": finFecha?.dia ?? "___",
      "[MES FIN]": finFecha?.mes ?? "__________",
      "[AÑO FIN]": finFecha?.año ?? "______",
    };

    let html = templateHtml;
    for (const [key, value] of Object.entries(replacements)) {
      html = html.split(key).join(escapeHtml(value));
    }
    if (html.includes("[DNI]")) {
      html = html.split("[DNI]").join(dni);
    } else if (hayDni) {
      // La plantilla no define [DNI]: anexamos la copia al final (para notaría).
      html = /<\/body>/i.test(html)
        ? html.replace(/<\/body>/i, dniAnnex + "</body>")
        : html + dniAnnex;
    }
    if (html.includes("[BAUCHER]")) {
      html = html.split("[BAUCHER]").join(baucher);
    }
    return html;
  }

  // ── Formato genérico del sistema (fallback) ──
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<style>
  @page { size: A4; margin: 24mm 20mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, sans-serif; color: #000; margin: 0; padding: 20px; line-height: 1.25; }
  h1 { text-align: center; font-size: 16pt; font-weight: bold; text-transform: uppercase; margin-bottom: 24px; border-bottom: 2px solid #000; padding-bottom: 8px; }
  h2 { font-size: 12pt; font-weight: bold; text-transform: uppercase; margin-top: 18px; margin-bottom: 8px; border-bottom: 1px solid #000; padding-bottom: 4px; }
  p { font-size: 10pt; text-align: justify; margin-bottom: 10px; }
  .bold { font-weight: bold; }
  .signature-section { margin-top: 60px; width: 100%; }
  .signature-table { width: 100%; border-collapse: collapse; }
  .signature-table td { width: 50%; vertical-align: top; padding: 0 20px; text-align: center; }
  .signature-line { border-top: 1px solid #000; margin-top: 50px; margin-bottom: 8px; }
</style>
</head>
<body>
  <h1>Contrato de Arrendamiento de Bien Inmueble a Plazo Determinado</h1>

  <p>Conste el contrato de arrendamiento que celebran de una parte la Srta. <span class="bold">LA ARRENDADORA</span>, y de otra parte el Sr.(a) <span class="bold">${escapeHtml(clienteNombreCompleto || "________________")}</span>, identificado con D.N.I. N° <span class="bold">${escapeHtml(clienteDocumento || "________________")}</span>, de nacionalidad <span class="bold">Peruana</span>, domiciliado en <span class="bold">${escapeHtml(field(cliente, ["domicilio"]) || "________________")}</span> y a quien en lo sucesivo se denominará <span class="bold">EL ARRENDATARIO (A)</span>; en los términos contenidos en las cláusulas siguientes:</p>

  <h2>Antecedentes</h2>
  <p><span class="bold">PRIMERA.-</span> LA ARRENDADORA es propietaria y alquila el departamento N° <span class="bold">${escapeHtml(codigoDepto || "________________")}</span>${piso ? `, Piso ${escapeHtml(piso)}` : ""} ubicado en ${escapeHtml(field(departamento, ["personaPago"]) || "________________")}, al cual en adelante se le denominará EL INMUEBLE.</p>

  <h2>Renta: Forma y Oportunidad de Pago</h2>
  <p><span class="bold">CUARTA.-</span> Las partes acuerdan que el monto de la renta que pagará EL ARRENDATARIO(A) asciende a la suma de S/ <span class="bold">${escapeHtml(formatCurrency(monto))}</span> más mantenimiento de S/ 50.00, un total de S/ <span class="bold">${escapeHtml(totalMonto)}</span> por mes.</p>

  <h2>Plazo del Contrato</h2>
  <p><span class="bold">QUINTA.-</span> Las partes convienen fijar un plazo de duración determinada para el presente contrato, el cual será del <span class="bold">${escapeHtml(inicioFecha?.dia ?? "___")}</span> de <span class="bold">${escapeHtml(inicioFecha?.mes ?? "__________")}</span> hasta el día <span class="bold">${escapeHtml(finFecha?.dia ?? "___")}</span> de <span class="bold">${escapeHtml(finFecha?.mes ?? "__________")}</span>.</p>

  <h2>Cláusula de Garantía</h2>
  <p><span class="bold">DÉCIMO SEXTA.-</span> EL ARRENDATARIO(A) entregará a LA ARRENDADORA la suma de S/ <span class="bold">${escapeHtml(formatCurrency(garantia))}</span> en calidad de depósito, en garantía del cumplimiento de todas las obligaciones asumidas.</p>

  ${clausulas ? `<h2>Cláusulas Específicas</h2>\n${clausulas}` : ""}

  <div class="signature-section">
    <table class="signature-table">
      <tr>
        <td>
          <div class="signature-line"></div>
          <p><span class="bold">LA ARRENDADORA</span></p>
        </td>
        <td>
          <div class="signature-line"></div>
          <p><span class="bold">EL ARRENDATARIO(A)</span><br>${escapeHtml(clienteNombreCompleto || "________________")}</p>
        </td>
      </tr>
    </table>
  </div>
  ${hayDni ? dniAnnex : ""}
</body>
</html>`;
}
