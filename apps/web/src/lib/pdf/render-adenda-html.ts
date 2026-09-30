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
 * Resuelve la dirección del inmueble según el edificio, deducido del código
 * del departamento ("BEN2195-*" -> Benavides, "ANG170-*" -> Angamos).
 * Si el código no permite determinarlo, cae al modelo Benavides.
 */
/**
 * Resuelve el PISO VIGENTE del departamento en la base de datos.
 * El snapshot congela el piso con el que se creó el contrato; si después se
 * corrige en la tabla departments, la adenda debe salir con el dato actual.
 * El import de @contract/db es perezoso para no abrir el pool en build-time.
 */
async function pisoVigenteDepartamento(
  departamento: Record<string, unknown>
): Promise<number | null> {
  try {
    const id = String(field(departamento, ["id"]) ?? "").trim();
    const codigo = String(field(departamento, ["codigo"]) ?? "").trim().toUpperCase();
    if (!id && !codigo) return null;
    const dbModule = (await import("@contract/db")) as typeof import("@contract/db");
    const { db, schema } = dbModule;
    const { eq } = await import("drizzle-orm");
    const filas = await db
      .select({ piso: schema.departments.piso })
      .from(schema.departments)
      .where(id ? eq(schema.departments.id, id) : eq(schema.departments.codigo, codigo))
      .limit(1);
    const piso = filas[0]?.piso;
    if (piso === null || piso === undefined) return null;
    const n = Number(piso);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function direccionInmueble(
  departamento: Record<string, unknown>,
  pisoVigente?: number | null
): string {
  const codigo = (field(departamento, ["codigo"]) || "").toUpperCase();
  const piso = pisoVigente ?? field(departamento, ["piso"]);
  if (codigo.startsWith("ANG")) {
    return `Av. Angamos Este 170, Miraflores, Piso ${piso}, Lima Metropolitana, Lima`;
  }
  return `Av. Alfredo Benavides N° 2195 D, Miraflores, Piso ${piso}, provincia y departamento de Lima`;
}

interface DatosArrendador {
  trat: string;
  nombres: string;
  apellidos: string;
  dni: string;
}

/**
 * Resuelve el/la arrendador(a) según el campo personaPago del departamento.
 * En el edificio Angamos hay 3 dueños distintos (Emely, Linda Evelyn y
 * Miguel); en Benavides siempre es Emely. Cae a Emely si no hay dato.
 */
function datosArrendador(departamento: Record<string, unknown>): DatosArrendador {
  const persona = (field(departamento, ["personaPago"]) ?? "").trim().toLowerCase();
  if (persona.startsWith("miguel")) {
    return { trat: "el Sr.", nombres: "Miguel Anthony", apellidos: "Carpio Pinto", dni: "76373624" };
  }
  if (persona.startsWith("evel") || persona.startsWith("linda")) {
    return { trat: "la Sra.", nombres: "Linda Evelyn", apellidos: "Carpio Pinto", dni: "74768652" };
  }
  return { trat: "la Srta.", nombres: "Emely Alexandra", apellidos: "Carpio Pinto", dni: "76373620" };
}

/**
 * Resuelve la cuenta bancaria donde se paga la renta según la persona de pago
 * del departamento (personaPago), igual que en las plantillas de contrato:
 * - Emely → BCP 194-97202418-0-59 / BBVA 0011-0138-0200468970 (Benavides)
 * - Miguel → BCP Soles 19495269435050 / CCI 00219419526943505096 (Angamos)
 * - Linda Evelyn → BCP 194-00894222053 (Angamos)
 */
function datosCuenta(departamento: Record<string, unknown>): string {
  const persona = (field(departamento, ["personaPago"]) ?? "").trim().toLowerCase();
  if (persona.startsWith("miguel")) {
    return "Cta. de ahorros del banco BCP Soles N° 19495269435050 / CCI: 00219419526943505096";
  }
  if (persona.startsWith("evel") || persona.startsWith("linda")) {
    return "Cta. de ahorros del banco BCP N° 194-00894222053";
  }
  return "Cta. de ahorros del banco BCP N° 194-97202418-0-59 / BBVA N° 0011-0138-0200468970";
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
export async function renderAdendaHtml(snapshot: ContractSnapshot): Promise<string> {
  const contrato = snapshot.datosContrato as Record<string, unknown>;
  if (contrato.tipoDocumento === "ADENDA_EXTENSION") {
    return renderExtensionAdendaHtml(snapshot);
  }
  if (contrato.fechaInicioAdenda && contrato.fechaFinAdenda) {
    const piso = await pisoVigenteDepartamento(
      (snapshot.datosDepartamento ?? {}) as Record<string, unknown>
    );
    return renderAdendaPlantillaHtml(snapshot, piso);
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

/**
 * Plantilla formal de adenda (modelo Benavides) usando datos del snapshot.
 * `pisoVigente` es el piso leído de la tabla departments al momento de generar
 * el PDF; si viene null se usa el congelado en el snapshot.
 */
export function renderAdendaPlantillaHtml(
  snapshot: ContractSnapshot,
  pisoVigente?: number | null
): string {
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
  const mantenimiento =
    parseFloat(field(contrato, ["mantenimiento"])) || 50;
  const montoTotal = montoRenta + mantenimiento;

  const deptoNumero = field(departamento, ["numero"]) || codigoCorto(field(departamento, ["codigo"]));
  const arrendador = datosArrendador(departamento);
  const nombreCompleto = [clienteNombre, clienteApellidos].filter(Boolean).join(" ") || "________________";
  const domicilio = field(cliente, ["domicilio"]) || "________________";

  const nacimiento = field(cliente, ["nacionalidad"]) || "Peruano(a)";
  const esAngamos = (field(departamento, ["codigo"]) || "").toUpperCase().startsWith("ANG");
  const domicilioArrendador = esAngamos
    ? "Av. Angamos Este 170, distrito de Miraflores, Departamento y Provincia de Lima"
    : "Av. Alfredo Benavides 2195, distrito de Miraflores, Departamento y Provincia de Lima";
  const telf = "937205274";

  const fmtMiles = (n: number): string =>
    n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const letrasDe = (n: number): string =>
    `${numeroEnLetras(Math.floor(n))} y ${String(Math.round((n % 1) * 100)).padStart(2, "0")}/100 soles`;
  const canonTxt = fmtMiles(montoRenta);
  const mantenimientoTxt = fmtMiles(mantenimiento);
  const totalTxt = fmtMiles(montoTotal);
  const canonLetras = letrasDe(montoRenta);
  const mantenimientoLetras = letrasDe(mantenimiento);
  const totalLetras = letrasDe(montoTotal);

  const ORDINALES = ["", "PRIMERA", "SEGUNDA", "TERCERA", "CUARTA", "QUINTA", "SEXTA", "SÉPTIMA", "OCTAVA", "NOVENA", "DÉCIMA"] as const;
  const nOrdinal = parseInt(numeroAdenda, 10) || 1;
  const ordinalAdenda = ORDINALES[nOrdinal] ?? `N° ${nOrdinal}ª`;

  const fmt = (obj: { dia: string; mes: string; año: string } | null): string =>
    obj ? `${obj.dia} de ${obj.mes} del ${obj.año}` : "________________";

  const fmtMesFin = (obj: { dia: string; mes: string; año: string } | null): string =>
    obj ? `${obj.dia}, ${obj.mes} del ${obj.año}` : "________________";

  const inicioOriginal = fmt(fechaInicioOriginal);
  const inicioAdenda = fmt(fechaInicioAdenda);
  const inicioPlazo = fmt(fechaInicioOriginal);
  const finAdendaMesFin = fmtMesFin(fechaFinAdenda);

  const tituloAdenda = String(contrato.titulo ?? "ADENDA").trim() || "ADENDA";
  const anexoTexto = (snapshot.anexos ?? [])
    .map((a) => a.contenido)
    .filter(Boolean)
    .join("\n\n")
    .trim();
  const contenidoAdenda = anexoTexto.replace(/^[^\n]*\n?\n?/, "").trim();
  const titularDistinto = tituloAdenda !== "ADENDA";
  const conContenido = Boolean(contenidoAdenda && contenidoAdenda !== tituloAdenda);

  return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>Primera Adenda al Contrato de Arrendamiento</title>
    <style>
        @page { size: A4; margin: 20mm; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: Arial, Helvetica, sans-serif;
            color: #111111;
            background-color: #ffffff;
            line-height: 1.6;
        }
        h1 {
            text-align: center;
            font-size: 15px;
            font-weight: bold;
            text-transform: uppercase;
            margin-bottom: 18px;
            letter-spacing: 0.5px;
            text-decoration: underline;
        }
        p {
            font-size: 13px;
            line-height: 1.42;
            text-align: justify;
            margin-bottom: 8px;
        }
        .section-title {
            font-weight: bold;
            text-transform: uppercase;
            margin-top: 10px;
            margin-bottom: 5px;
            font-size: 13px;
        }
        .left-dots {
            text-align: left;
            margin-bottom: 4px;
            font-weight: bold;
            letter-spacing: 2px;
        }
        .clause-title {
            font-weight: bold;
            margin-bottom: 8px;
            text-transform: uppercase;
            font-size: 13px;
        }
        .titulo-adenda {
            text-align: center;
            font-weight: bold;
            text-transform: uppercase;
            margin: 2px 0 14px;
            font-size: 13px;
        }
        .date-line {
            margin-top: 12px;
            margin-bottom: 16px;
            text-align: left;
        }
        .signatures-container {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-top: 16px;
            padding: 0 6px;
        }
        .signature-block {
            width: 42%;
            text-align: center;
        }
        .signature-line {
            border-top: 1px solid #000000;
            margin-bottom: 8px;
        }
        .signature-name {
            font-weight: bold;
            font-size: 12px;
            text-transform: uppercase;
        }
        .signature-dni {
            font-size: 12px;
            margin-top: 3px;
        }
        .footer-page {
            margin-top: 14px;
            border-top: 1px solid #e5e7eb;
            padding-top: 6px;
            display: flex;
            justify-content: space-between;
            font-size: 11px;
            color: #6b7280;
        }
    </style>
</head>
<body>

    <h1>ADENDA N° ${escapeHtml(numeroAdenda)} AL CONTRATO DE<br>ARRENDAMIENTO</h1>
    ${titularDistinto ? `<p class="titulo-adenda">${escapeHtml(tituloAdenda)}</p>` : ""}

    <p>Conste por el presente documento la <strong>${ordinalAdenda} ADENDA AL CONTRATO DE ARRENDAMIENTO</strong> de fecha <strong>${inicioOriginal}</strong>, que celebran de una parte ${arrendador.trat} <strong>${arrendador.nombres} ${arrendador.apellidos.toUpperCase()}</strong>, identificado con DNI N° <strong>${arrendador.dni}</strong>, domiciliado en <strong>${escapeHtml(domicilioArrendador)}</strong>, a quien en adelante se le denominará <strong>LA ARRENDADOR(A)</strong> y, de la otra parte, el Sr.(a) <strong>${escapeHtml(nombreCompleto)}</strong>, identificado con DNI / C.E. / Pasaporte N° <strong>${escapeHtml(clienteDocumento || "________________")}</strong>, de nacionalidad <strong>${escapeHtml(nacimiento)}</strong>, domiciliado en <strong>${escapeHtml(domicilio)}</strong>, a quien en adelante se denominará <strong>EL ARRENDATARIO</strong>, en los términos y bajo las condiciones siguientes:</p>

    <div class="section-title">PRIMERO: ANTECEDENTES</div>
    <p>Con fecha <strong>${inicioOriginal}</strong>, las partes celebraron un Contrato de Arrendamiento respecto al mini departamento N° <strong>${escapeHtml(deptoNumero)}</strong> ubicado en <strong>${escapeHtml(direccionInmueble(departamento, pisoVigente))}</strong> con una merced conductiva de S/ <strong>${canonTxt} (${canonLetras})</strong> más mantenimiento de S/ <strong>${mantenimientoTxt} (${mantenimientoLetras})</strong> un total de S/ <strong>${totalTxt} (${totalLetras})</strong> mensuales; e incluye los servicios de luz y agua, siendo cancelada en la ${datosCuenta(departamento)}.</p>

    <div class="section-title">SEGUNDO: OBJETO</div>
    <p>Las partes acuerdan modificar la Cláusula QUINTA del contrato de arrendamiento del Mini departamento N° <strong>${escapeHtml(deptoNumero)}</strong>, bajo los siguientes términos:</p>

    <div class="left-dots">...</div>

    <div class="clause-title">PLAZO DEL CONTRATO:</div>
    <p><strong>QUINTA.-</strong> Las partes convienen fijar un plazo de duración determinada para el presente contrato, el cual será del <strong>${inicioPlazo}</strong> hasta el día <strong>${finAdendaMesFin}</strong>; fecha en la que EL ARRENDATARIO(A) está obligado a desocupar y devolver el bien arrendado.</p>
    <p>El presente contrato podrá ser renovado con una anticipación no menor de quince (15) días calendarios a la conclusión del arrendamiento y que exista acuerdo entre ambas partes confirmando vía WhatsApp al telf. <strong>${telf}</strong> o mediante adenda firmada.</p>

    <div class="left-dots">...</div>

    <div class="section-title">TERCERO: RATIFICACIÓN</div>
    <p>Salvo por la modificación señalada en la presente adenda, todas las demás cláusulas y condiciones del contrato de arrendamiento original se mantienen vigentes y sin alteración alguna.</p>
    ${conContenido ? `<p>Otras precisiones convenidas: ${escapeHtml(contenidoAdenda).replace(/\n/g, "<br>")}</p>` : ""}
    <p>En señal de conformidad, ambas partes suscriben la presente adenda en dos ejemplares de igual tenor y validez, en esta ciudad.</p>

    <p class="date-line">Miraflores, <strong>${inicioAdenda}</strong>.</p>

    <div class="signatures-container">
        <div class="signature-block">
            <div class="signature-line"></div>
            <div class="signature-name">${arrendador.nombres} ${arrendador.apellidos}</div>
            <div class="signature-dni">DNI N° ${arrendador.dni}</div>
        </div>
        <div class="signature-block">
            <div class="signature-line"></div>
            <div class="signature-name">${escapeHtml(nombreCompleto.toUpperCase())}</div>
            <div class="signature-dni">DNI / C.E. / PASAPORTE N° ${escapeHtml(clienteDocumento || "________________")}</div>
        </div>
    </div>

    <div class="footer-page">
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
  const montoTotal = (Number(montoCanon) || 0) + (Number(mantenimiento) || 50);
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
    ${richRow("Total mensual", `S/ ${montoTotal.toFixed(2)}`)}
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