export interface BoletaSeparacionData {
  personaFirmante: string;
  dniFirmante: string;
  direccion: string;
  departamento: string;
  codigo: string;
  checkIn: string;
  checkOut: string;
  montoSeparacion: string;
  diaPago: string;
  personaPago: string;
  dniPersonaPago: string;
}

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre",
];

function dateLarga(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const partes =
    typeof iso === "string" ? iso.slice(0, 10).split("-") : null;
  if (partes && partes.length >= 3 && !Number.isNaN(Number(partes[1]))) {
    const d = Number(partes[2]);
    const m = Number(partes[1]);
    return `${d} de ${MESES[m - 1] ?? ""} de ${partes[0]}`;
  }
  try {
    return new Date(iso).toLocaleDateString("es-PE", {
      dateStyle: "long",
    });
  } catch {
    return typeof iso === "string" ? iso.slice(0, 10) : "—";
  }
}

export function formatMonto(n: number | string | null | undefined): string {
  const v = Number(n ?? 0);
  return v.toLocaleString("es-PE", { style: "currency", currency: "PEN" });
}

export function diaDePago(fechaInicio: string | Date | null | undefined): string {
  const partes =
    typeof fechaInicio === "string"
      ? fechaInicio.slice(0, 10).split("-")
      : fechaInicio instanceof Date
        ? [
            String(fechaInicio.getUTCFullYear()),
            String(fechaInicio.getUTCMonth() + 1).padStart(2, "0"),
            String(fechaInicio.getUTCDate()).padStart(2, "0"),
          ]
        : null;
  if (partes && partes.length >= 3 && !Number.isNaN(Number(partes[2]))) {
    return String(Number(partes[2])).padStart(2, "0");
  }
  return "05";
}

export interface BoletaInput {
  contacto?: {
    nombre?: string;
    apellido?: string;
    dni?: string;
    domicilio?: string;
  } | null;
  departamento?: {
    numero?: string;
    codigo?: string;
    personaPago?: string;
    precio?: string | number;
  } | null;
  separacion?: { montoSeparacion?: string | number } | null;
  contrato?: { fechaInicio?: string | Date; fechaFin?: string | Date } | null;
}

interface DatosArrendador {
  trat: string;
  nombres: string;
  apellidos: string;
  dni: string;
}

function datosArrendador(personaPago: string | undefined): DatosArrendador {
  const persona = (personaPago ?? "").trim().toLowerCase();
  if (persona.startsWith("miguel")) {
    return { trat: "el Sr.", nombres: "Miguel Anthony", apellidos: "Carpio Pinto", dni: "76373624" };
  }
  if (persona.startsWith("evel") || persona.startsWith("linda")) {
    return { trat: "la Sra.", nombres: "Linda Evelyn", apellidos: "Carpio Pinto", dni: "74768652" };
  }
  return { trat: "la Srta.", nombres: "Emely Alexandra", apellidos: "Carpio Pinto", dni: "76373620" };
}

/**
 * Compone todos los campos de la Boleta de Separación a partir de los datos
 * extraídos de contactos (persona firmante/DNI/domicilio) y de Uni/DEP
 * (departamento, código, persona a pagar) + separación/contrato asociados.
 * Solo el usuario elige cliente y departamento; el resto se deriva.
 */
export function buildBoletaSeparacion(input: BoletaInput): BoletaSeparacionData {
  const c = input.contacto;
  const d = input.departamento;
  const arr = datosArrendador(d?.personaPago);
  return {
    personaFirmante: [c?.nombre, c?.apellido].filter(Boolean).join(" ").trim(),
    dniFirmante: c?.dni ?? "",
    direccion: c?.domicilio ?? "",
    departamento: d?.numero ?? "",
    codigo: d?.codigo ?? "",
    checkIn: dateLarga(input.contrato?.fechaInicio),
    checkOut: dateLarga(input.contrato?.fechaFin),
    montoSeparacion: formatMonto(
      input.separacion?.montoSeparacion ?? d?.precio ?? 0
    ),
    diaPago: diaDePago(input.contrato?.fechaInicio),
    personaPago: `${arr.trat} ${arr.nombres} ${arr.apellidos}`.trim(),
    dniPersonaPago: arr.dni,
  };
}

const INFORMACION: { titulo: string; cuerpo: string }[] = [
  {
    titulo: "1. Mascotas",
    cuerpo:
      "Se permite la convivencia con una mascota como máximo por departamento, previa coordinación y autorización de la administración.",
  },
  {
    titulo: "2. Servicios incluidos",
    cuerpo:
      "El departamento cuenta con los servicios de agua, electricidad y agua caliente, incluidos dentro de las condiciones establecidas para la estadía.",
  },
  {
    titulo: "3. Atención de desperfectos",
    cuerpo:
      "En caso de identificar algún desperfecto, avería o incidencia dentro del departamento, agradeceremos comunicarlo oportunamente a la administración. Se coordinará una visita para su revisión y, de corresponder, la atención del inconveniente en el menor tiempo posible.",
  },
  {
    titulo: "4. Número de residentes",
    cuerpo:
      "Cada departamento ha sido acondicionado para una ocupación máxima de dos personas, con el objetivo de garantizar condiciones adecuadas de comodidad y convivencia.",
  },
  {
    titulo: "5. Visitas",
    cuerpo:
      "Los residentes pueden recibir visitas de manera ocasional. Para preservar la tranquilidad y adecuada convivencia dentro de la propiedad, no podrán pernoctar más de dos personas en el departamento.",
  },
  {
    titulo: "6. Servicio de internet opcional",
    cuerpo:
      "La propiedad cuenta con un servicio adicional de internet, disponible por S/ 39 mensuales. En caso de presentarse alguna incidencia atribuible al proveedor u operador del servicio, los tiempos de atención y restablecimiento estarán sujetos a los plazos y condiciones establecidos por dicho proveedor, al tratarse de situaciones ajenas a la gestión y control de la administración. No obstante, se realizarán las coordinaciones correspondientes y el seguimiento necesario hasta la atención de la incidencia.",
  },
  {
    titulo: "7. Lavandería común de cortesía",
    cuerpo:
      "La propiedad dispone de una lavandería común de cortesía para uso de los residentes, disponible en el horario de 8:00 a. m. a 8:00 p. m. Con el propósito de garantizar un uso equitativo del servicio, cada residente podrá utilizar la lavandería hasta dos veces por semana.",
  },
  {
    titulo: "8. Disposición de residuos",
    cuerpo:
      "Con la finalidad de preservar la limpieza, el orden y las condiciones adecuadas de los espacios comunes, se solicita a los residentes retirar y disponer sus residuos después de las 8:00 p. m.",
  },
  {
    titulo: "9. Tranquilidad y convivencia",
    cuerpo:
      "La propiedad está orientada a ofrecer un entorno tranquilo, cómodo y adecuado para todos sus residentes. Por ello, no se permiten fiestas, reuniones o actividades que puedan generar ruidos excesivos, molestias o afectar la tranquilidad de los demás residentes.",
  },
];

export function renderBoletaSeparacionHtml(data: BoletaSeparacionData): string {
  const esc2 = esc;
  const monto = data.montoSeparacion || "—";
  const codigoDep = data.codigo || "—";

  const filasHtml = [
    ["Persona Firmante", data.personaFirmante, "data"],
    ["DNI persona firmante", data.dniFirmante, "data"],
    ["Dirección de la persona", data.direccion, "data"],
    ["Departamento", data.departamento, "data"],
    ["Código", data.codigo, "data"],
    ["Check-in", data.checkIn, "data"],
    ["Check-out", data.checkOut, "data"],
    ["Separación", monto, "monto"],
    ["Día de pago", data.diaPago, "data"],
    ["Persona a pagar", data.personaPago, "data"],
    ["DNI persona a pagar", data.dniPersonaPago, "data"],
  ]
    .map(
      ([label, valor, tipo]: string[]) =>
        `<tr><td class="${tipo === "monto" ? "lbl lbl-monto" : "lbl"}">${esc2(label ?? "")}</td><td class="${tipo === "monto" ? "monto" : "data"}">${esc2(valor || "—")}</td></tr>`
    )
    .join("");

  const infoHtml = INFORMACION.map(
    (bloque) =>
      `<li><div class="info-titulo">${esc2(bloque.titulo)}</div><div class="info-cuerpo">${esc2(bloque.cuerpo)}</div></li>`
  ).join("");

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><title>Boleta de Separación</title>
<style>
@page { size: A4; margin: 10mm; }
* { box-sizing: border-box; }
body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #141414; line-height: 1.4; margin: 0; }
/* Marco característico de boleta: doble borde exterior */
.marco {
  border: 3px solid #0d1b2a;
  outline: 1.2px solid #0d1b2a;
  outline-offset: -2.2mm;
  padding: 18mm 16mm 14mm;
}
/* Cabecera emisor */
.cabecera { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2.5px solid #0d1b2a; padding-bottom: 4mm; margin-bottom: 5mm; }
.emisor-nombre { font-size: 15pt; font-weight: 800; letter-spacing: 1.5px; color: #0d1b2a; text-transform: uppercase; }
.emisor-lema { font-size: 8.5pt; color: #446; margin-top: 1mm; }
.caja-num { text-align: right; }
.caja-num .idi { font-size: 7pt; color: #555; letter-spacing: 2px; text-transform: uppercase; }
.caja-num .nro { font-weight: 800; font-size: 12pt; border: 2px solid #0d1b2a; padding: 2mm 5mm; margin-top: 1.5mm; display: inline-block; }
/* Título del documento */
.titulo { text-align: center; margin: 3mm 0 4mm; }
.titulo h1 { font-size: 17pt; letter-spacing: 3px; margin: 0; color: #0d1b2a; text-transform: uppercase; }
.titulo .sub { font-size: 8.5pt; color: #446; letter-spacing: 1px; text-transform: uppercase; margin-top: 1mm; }
/* Tabla de datos con celdas bordeadas */
table.datos { width: 100%; border-collapse: collapse; font-size: 10pt; }
table.datos td { border: 1px solid #0d1b2a; padding: 2.6mm 3mm; vertical-align: middle; }
table.datos .lbl { background: #eef2f6; color: #0d1b2a; font-weight: 700; width: 38%; }
table.datos .lbl-monto { background: #dce6ef; }
table.datos .data { font-weight: 500; }
table.datos .monto { font-weight: 800; font-size: 11.5pt; color: #0d1b2a; text-align: right; }
/* Información en caja con borde */
.info { border: 2px solid #0d1b2a; margin-top: 6mm; padding: 4mm 5mm; }
.info h2 { font-size: 11.5pt; letter-spacing: 1px; text-transform: uppercase; color: #fff; background: #0d1b2a; margin: -4mm -5mm 3mm; padding: 2.5mm 5mm; text-align: center; }
.info ul { list-style: none; margin: 0; padding: 0; }
.info li { margin-bottom: 2.6mm; }
.info .info-titulo { font-weight: 700; font-size: 9.8pt; color: #0d1b2a; }
.info .info-cuerpo { font-size: 9pt; text-align: justify; margin-top: 0.6mm; }
.info .cierre { font-size: 9.5pt; margin-top: 1mm; }
/* Firmas */
.firmas { margin-top: 10mm; display: flex; justify-content: space-between; }
.firmas .firma { width: 46%; text-align: center; }
.firmas .linea { border-top: 1.5px solid #0d1b2a; padding-top: 1.5mm; font-size: 9pt; color: #333; }
.firmas .rol { font-size: 7.5pt; color: #555; text-transform: uppercase; letter-spacing: 1px; margin-top: 1mm; }
/* Pie */
.pie { margin-top: 6mm; font-size: 7.5pt; color: #666; text-align: center; }
.pie .nota { border: 1px solid #999; display: inline-block; padding: 1.5mm 4mm; }
</style></head>
<body>
<div class="marco">
  <div class="cabecera">
    <div>
      <div class="emisor-nombre">AlquilaYa ERP</div>
      <div class="emisor-lema">Departamentos amueblados · Separatas de departamento</div>
    </div>
    <div class="caja-num">
      <div class="idi">Código de departamento</div>
      <div class="nro">${esc2(codigoDep)}</div>
    </div>
  </div>

  <div class="titulo">
    <h1>Boleta de Separación</h1>
    <div class="sub">Comprobante de dinero en custodia — Concepto no remunerativo</div>
  </div>

  <table class="datos">${filasHtml}</table>

  <div class="info">
    <h2>Información para una buena estadía</h2>
    <p class="info-cuerpo" style="margin:0 0 3mm;">Con el objetivo de garantizar una estadía cómoda, tranquila y agradable, así como una adecuada convivencia entre todos los residentes, compartimos las siguientes consideraciones de uso y convivencia de la propiedad.</p>
    <ul>${infoHtml}</ul>
    <p class="info-cuerpo">Agradecemos su colaboración y compromiso con el adecuado uso de las instalaciones y el respeto de las normas de convivencia.</p>
    <p class="info-cuerpo cierre"><strong>Nuestro objetivo es mantener un espacio ordenado, seguro, tranquilo y agradable para todos.</strong></p>
  </div>

  <div class="firmas">
    <div class="firma">
      <div class="linea">Persona Firmante: ${esc2(data.personaFirmante || "—")}</div>
      <div class="rol">Firma</div>
    </div>
    <div class="firma">
      <div class="linea">Administración: ${esc2(data.personaPago || "—")}</div>
      <div class="rol">Firma</div>
    </div>
  </div>

  <p class="pie">Documento generado por AlquilaYa ERP el ${esc2(new Date().toLocaleDateString("es-PE", { dateStyle: "long" }))}</p>
  <p class="pie"><span class="nota">El monto otorgado en concepto de separación será imputado a la primera renta del contrato de alquiler.</span></p>
</div>
</body>
</html>`;
}