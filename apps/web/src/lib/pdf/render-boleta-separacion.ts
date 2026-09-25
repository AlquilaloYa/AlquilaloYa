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
  const filasValidacion: [string, string][] = [
    ["Persona Firmante", data.personaFirmante],
    ["DNI persona firmante", data.dniFirmante],
    ["Dirección de la persona", data.direccion],
    ["Departamento", data.departamento],
    ["Código", data.codigo],
    ["Check-in", data.checkIn],
    ["Check-out", data.checkOut],
    ["Separación", data.montoSeparacion],
    ["Día de pago", data.diaPago],
    ["Persona a pagar", data.personaPago],
    ["DNI persona a pagar", data.dniPersonaPago],
  ];

  const filasHtml = filasValidacion
    .map(
      ([label, valor]) =>
        `<tr><td class="lbl">${esc(label)}</td><td>${esc(valor || "—")}</td></tr>`
    )
    .join("");

  const infoHtml = INFORMACION.map(
    (bloque) => `<h3>${esc(bloque.titulo)}</h3><p>${esc(bloque.cuerpo)}</p>`
  ).join("");

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><title>Boleta de Separación</title>
<style>
@page { size: A4; margin: 18mm; }
body { font-family: Arial, Helvetica, sans-serif; color: #111; line-height: 1.45; }
h1 { text-align: center; font-size: 16pt; margin: 0 0 2mm; letter-spacing: 1px; }
.sistema { text-align: center; color: #294261; font-size: 10pt; margin: 0 0 8mm; text-transform: uppercase; letter-spacing: 2px; }
h2 { font-size: 11.5pt; border-bottom: 1.2px solid #1f2f45; padding-bottom: 2px; margin: 8mm 0 3mm; }
h3 { font-size: 10.5pt; margin: 5mm 0 1mm; color: #1f2f45; }
p { font-size: 10pt; margin: 0 0 4mm; text-align: justify; }
table.datos { width: 100%; border-collapse: collapse; font-size: 10.5pt; }
table.datos td { padding: 3px 6px; }
table.datos .lbl { color: #294261; font-weight: bold; width: 34%; }
.firmas { margin-top: 18mm; display: flex; justify-content: space-between; font-size: 9.5pt; }
.firmas div { width: 45%; border-top: 1px solid #333; padding-top: 4px; text-align: center; }
.pie { margin-top: 12mm; font-size: 8pt; color: #666; text-align: center; }
</style></head>
<body>
<h1>BOLETA DE SEPARACIÓN</h1>
<p class="sistema">AlquilaYa ERP</p>
<table class="datos">
  ${filasHtml}
</table>
<h2>Información para una buena estadía</h2>
<p>Con el objetivo de garantizar una estadía cómoda, tranquila y agradable, así como una adecuada convivencia entre todos los residentes, compartimos las siguientes consideraciones de uso y convivencia de la propiedad.</p>
${infoHtml}
<p>Agradecemos su colaboración y compromiso con el adecuado uso de las instalaciones y el respeto de las normas de convivencia.</p>
<p><strong>Nuestro objetivo es mantener un espacio ordenado, seguro, tranquilo y agradable para todos.</strong></p>
<div class="firmas">
  <div>Persona Firmante: ${esc(data.personaFirmante || "—")}</div>
  <div>Administración: ${esc(data.personaPago || "—")}</div>
</div>
<p class="pie">Documento generado por AlquilaYa ERP el ${esc(new Date().toLocaleDateString("es-PE", { dateStyle: "long" }))}</p>
</body>
</html>`;
}