type Registro = Record<string, unknown>;

function field(obj: Registro | undefined, keys: string[]): string {
  if (!obj) return "";
  for (const key of keys) {
    const v = obj[key];
    if (v !== undefined && v !== null && v !== "") return String(v);
  }
  return "";
}

function escapeHtml(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function capitalizarNombre(value: string | null | undefined): string {
  const lower = (value ?? "").toLocaleLowerCase("es");
  let resultado = "";
  let inicioPalabra = true;

  for (const ch of lower) {
    const esLetra = ch.toLocaleUpperCase("es") !== ch.toLocaleLowerCase("es");
    if (esLetra) {
      resultado += inicioPalabra ? ch.toLocaleUpperCase("es") : ch;
      inicioPalabra = false;
    } else {
      resultado += ch;
      inicioPalabra =
        ch === " " || ch === "\t" || ch === "-" || ch === "'" || ch === "´";
    }
  }

  return resultado.trim();
}

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "setiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

function fmtFechaEs(iso: string | null | undefined): string {
  if (!iso) return "Sin fecha";
  const datePart = iso.split("T")[0];
  const parts = (datePart ?? "").split("-");
  if (parts.length < 3) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    return new Intl.DateTimeFormat("es-PE", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(date);
  }

  const d = Number.parseInt(parts[2] ?? "", 10);
  const m = Number.parseInt(parts[1] ?? "", 10);
  if (Number.isNaN(d) || Number.isNaN(m)) return iso;
  return `${d} de ${MESES[m - 1] ?? ""} del ${parts[0] ?? ""}`;
}

function codigoCorto(codigo: string): string {
  const s = (codigo ?? "").trim();
  if (!s) return s;
  const idx = s.lastIndexOf("-");
  if (idx < 0) return s;
  return s.slice(idx + 1).trim() || s;
}

interface DatosArrendador {
  trat: string;
  nombres: string;
  apellidos: string;
  dni: string;
}

/**
 * Resuelve el/la arrendador(a) según el campo personaPago del departamento,
 * igual que las adendas. En el edificio Angamos hay 3 dueños distintos
 * (Emely, Linda Evelyn y Miguel); en Benavides siempre es Emely.
 */
function datosArrendador(departamento: Registro): DatosArrendador {
  const persona = (field(departamento, ["personaPago"]) ?? "").trim().toLowerCase();
  if (persona.startsWith("miguel")) {
    return { trat: "el Sr.", nombres: "Miguel Anthony", apellidos: "Carpio Pinto", dni: "76373624" };
  }
  if (persona.startsWith("evel") || persona.startsWith("linda")) {
    return { trat: "la Sra.", nombres: "Linda Evelyn", apellidos: "Carpio Pinto", dni: "74768652" };
  }
  return { trat: "la Srta.", nombres: "Emely Alexandra", apellidos: "Carpio Pinto", dni: "76373620" };
}

/** Dirección del inmueble según el código del departamento (ANG -> Angamos). */
function direccionInmueble(departamento: Registro): string {
  const codigo = (field(departamento, ["codigo"]) || "").toUpperCase();
  const piso = field(departamento, ["piso"]) || "____";
  if (codigo.startsWith("ANG")) {
    return `Av. Angamos Este 170, Miraflores, Piso ${piso}, Lima Metropolitana, Lima`;
  }
  return `Av. Alfredo Benavides N° 2195 D, Miraflores, Piso ${piso}, provincia y departamento de Lima`;
}

const ORDINALES = ["PRIMERO", "SEGUNDO", "TERCERO"] as const;

/**
 * Renderiza el HTML de "PAGOS EXTRAS POR CONEXIÓN Y MEDIO DE CARGA" con el
 * mismo formato formal de las adendas (plantilla Benavides): encabezado
 * centrado subrayado, párrafos justificados, secciones numeradas, bloques de
 * firma con nombre/DNI y pie de página.
 */
export async function renderServiciosExtrasHtml(
  servicio: Registro,
  contract?: Registro,
  cliente?: Registro,
  departamento?: Registro,
): Promise<string> {
  const dep = departamento ?? {};
  const cli = cliente ?? {};
  const con = contract ?? {};

  const nombreBase =
    String(servicio.clienteNombre ?? "").trim() ||
    [field(cli, ["nombres", "nombreCompleto", "razonSocial"]), field(cli, ["apellidos"])]
      .filter(Boolean)
      .join(" ");
  const nombreCompleto = capitalizarNombre(nombreBase) || "________________";
  const clienteDocumento =
    String(servicio.clienteDocumento ?? "").trim() ||
    field(cli, ["documentoIdentidad", "documento", "ruc"]) ||
    "________________";
  const nacimiento = field(cli, ["nacionalidad"]) || "Peruano(a)";
  const domicilio = field(cli, ["domicilio"]) || "________________";

  const deptoNumero =
    String(servicio.departamentoNumero ?? "").trim() ||
    field(dep, ["numero"]) ||
    codigoCorto(field(dep, ["codigo"])) ||
    field(dep, ["codigo"]) ||
    field(dep, ["nombre"]) ||
    "________________";

  const codigoContrato = escapeHtml(
    String(servicio.codigoContrato ?? con.codigoContrato ?? "Sin código"),
  );

  const arrendador = datosArrendador(dep);
  const esAngamos = (field(dep, ["codigo"]) || "").toUpperCase().startsWith("ANG");
  const domicilioArrendador = esAngamos
    ? "Av. Angamos Este 170, distrito de Miraflores, Departamento y Provincia de Lima"
    : "Av. Alfredo Benavides 2195, distrito de Miraflores, Departamento y Provincia de Lima";

  const fechaOpcion = fmtFechaEs(
    String(servicio.fechaOpcion ?? con.fechaInicio ?? new Date().toISOString()),
  );
  const fechaPago = fmtFechaEs(
    String(servicio.fechaPago ?? con.fechaInicio ?? new Date().toISOString()),
  );

  const incluyeInternet = Boolean(servicio.incluyeInternet);
  const incluyeCarga = Boolean(servicio.incluyeCargaElectrica);

  const bloques: string[] = [];
  const siguienteOrdinal = (): string => ORDINALES[bloques.length] ?? "ADEMÁS";

  if (incluyeInternet) {
    bloques.push(`
      <div class="section-title">${siguienteOrdinal()}: SERVICIO EXTRA DE INTERNET</div>
      <p>EL ARRENDATARIO dispone de la opción de contratar el servicio extra de internet; EL ARRENDADOR ya explicó las posibles falencias de conexión. Detalles del servicio:</p>
      <ol>
        <li>Pago de S/. 39 soles.</li>
        <li>Conexión de alta latencia.</li>
        <li>Baja conectividad por actividad masiva.</li>
      </ol>
    `);
  }

  if (incluyeCarga) {
    bloques.push(`
      <div class="section-title">${siguienteOrdinal()}: CARGA ELÉCTRICA</div>
      <p>EL ARRENDATARIO dispone de la opción de contratar el servicio de carga de patinete, el cual EL ARRENDADOR determinó en este contrato. Detalles del cargo extra por carga eléctrica:</p>
      <ol>
        <li>Pago de S/. 60 soles.</li>
        <li>Patines pequeños / medianos.</li>
        <li>No debe comprometer ninguna conexión eléctrica; si el dispositivo del cliente genera algún problema con la infraestructura eléctrica de la vivienda, este deberá correr con los gastos de la reparación.</li>
        <li>Evitar la sobrecarga del monopatín/bicicleta eléctrica.</li>
      </ol>
      <p class="recomendacion">Recomendación: si desea emplear este servicio, lo mejor es comprar un transformador eléctrico para evitar cortos circuitos o tener el cargador oficial; recuerde que cualquier imprevisto eléctrico fuera de los regulares puede representar un peligro para usted y los habitantes del inmueble. Gracias.</p>
    `);
  }

  if (bloques.length === 0) {
    bloques.push(`
      <div class="section-title">PRIMERO: SIN SERVICIOS EXTRAS</div>
      <p>El cliente no eligió servicios extras adicionales en este contrato.</p>
    `);
  }

  return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>Pagos extras por conexión y medio de carga</title>
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
            margin-bottom: 12px;
            letter-spacing: 0.5px;
            text-decoration: underline;
        }
        p {
            font-size: 13px;
            line-height: 1.34;
            text-align: justify;
            margin-bottom: 6px;
        }
        .section-title {
            font-weight: bold;
            text-transform: uppercase;
            margin-top: 8px;
            margin-bottom: 4px;
            font-size: 13px;
        }
        ol {
            font-size: 13px;
            line-height: 1.34;
            margin: 4px 0 8px 20px;
            padding-left: 18px;
        }
        ol li {
            margin-bottom: 3px;
            text-align: justify;
        }
        .recomendacion {
            font-style: italic;
        }
        .date-line {
            margin-top: 10px;
            margin-bottom: 70px;
            text-align: left;
        }
        .signatures-container {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-top: 0;
            padding: 0 6px;
        }
        .signature-block {
            width: 42%;
            text-align: center;
        }
        .signature-line {
            border-top: 1px solid #000000;
            margin-bottom: 6px;
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
            margin-top: 10px;
            border-top: 1px solid #e5e7eb;
            padding-top: 5px;
            display: flex;
            justify-content: space-between;
            font-size: 11px;
            color: #6b7280;
        }
    </style>
</head>
<body>

    <h1>PAGOS EXTRAS POR CONEXIÓN Y MEDIO DE CARGA</h1>

    <p>Conste por el presente documento el acuerdo de <strong>PAGOS EXTRAS POR CONEXIÓN Y MEDIO DE CARGA</strong> correspondiente al contrato <strong>${codigoContrato}</strong>, que celebran de una parte ${arrendador.trat} <strong>${arrendador.nombres} ${arrendador.apellidos.toUpperCase()}</strong>, identificado con DNI N° <strong>${arrendador.dni}</strong>, domiciliado en <strong>${escapeHtml(domicilioArrendador)}</strong>, a quien en adelante se le denominará <strong>LA ARRENDADOR(A)</strong> y, de la otra parte, el Sr.(a) <strong>${escapeHtml(nombreCompleto)}</strong>, identificado con DNI / C.E. / Pasaporte N° <strong>${escapeHtml(clienteDocumento)}</strong>, de nacionalidad <strong>${escapeHtml(nacimiento)}</strong>, domiciliado en <strong>${escapeHtml(domicilio)}</strong>, a quien en adelante se denominará <strong>EL ARRENDATARIO</strong>, respecto del mini departamento N° <strong>${escapeHtml(deptoNumero)}</strong> ubicado en <strong>${escapeHtml(direccionInmueble(dep))}</strong>, en los términos y bajo las condiciones siguientes:</p>

    <p>EL ARRENDATARIO tomó la opción indicada con fecha <strong>${fechaOpcion}</strong> y el día de pago será el mismo del contrato de arrendamiento: <strong>${fechaPago}</strong>.</p>

    ${bloques.join("\n")}

    <p>En señal de conformidad, ambas partes suscriben el presente documento en dos ejemplares de igual tenor y validez, en esta ciudad.</p>

    <p class="date-line">Miraflores, <strong>${fechaOpcion}</strong>.</p>

    <div class="signatures-container">
        <div class="signature-block">
            <div class="signature-line"></div>
            <div class="signature-name">${arrendador.nombres} ${arrendador.apellidos}</div>
            <div class="signature-dni">DNI N° ${arrendador.dni}</div>
        </div>
        <div class="signature-block">
            <div class="signature-line"></div>
            <div class="signature-name" style="text-transform:none;">${escapeHtml(nombreCompleto)}</div>
            <div class="signature-dni">DNI / C.E. / PASAPORTE N° ${escapeHtml(clienteDocumento)}</div>
        </div>
    </div>

    <div class="footer-page">
        <span>Pagos extras por conexión y medio de carga</span>
        <span>Página 1</span>
    </div>

</body>
</html>`;
}
