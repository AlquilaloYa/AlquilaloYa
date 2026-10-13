type Registro = Record<string, unknown>;

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

export async function renderServiciosExtrasHtml(
  servicio: Registro,
  contract?: Registro,
  cliente?: Registro,
  departamento?: Registro,
): Promise<string> {
  const nombreCliente = capitalizarNombre(
    String(
      servicio.clienteNombre ??
        cliente?.nombres ??
        cliente?.nombre ??
        "",
    ),
  );
  const dniCliente = String(
    servicio.clienteDocumento ??
      cliente?.documentoIdentidad ??
      cliente?.ruc ??
      "[DNI]",
  );
  const depto = String(
    servicio.departamentoNumero ??
      departamento?.codigo ??
      departamento?.nombre ??
      contract?.departamentoNumero ??
      "[N°DEPARTAMENTO]",
  );
  const fechaOpcion = fmtFechaEs(
    String(servicio.fechaOpcion ?? contract?.fechaInicio ?? new Date().toISOString()),
  );
  const fechaPago = fmtFechaEs(
    String(servicio.fechaPago ?? contract?.fechaInicio ?? new Date().toISOString()),
  );
  const codigoContrato = escapeHtml(
    String(servicio.codigoContrato ?? contract?.codigoContrato ?? "Sin código"),
  );

  const incluyeInternet = Boolean(servicio.incluyeInternet);
  const incluyeCarga = Boolean(servicio.incluyeCargaElectrica);
  const secciones: string[] = [];

  if (incluyeInternet) {
    secciones.push(`
      <div class="seccion">
        <p><strong>Yo, ${escapeHtml(nombreCliente)}, identificado(a), con DNI / Pasaporte / C.E. N° ${escapeHtml(dniCliente)}, en mi condición de arrendatario(a) del departamento ${escapeHtml(depto)}, dispongo de la opción de contratar el servicio extra de internet; El Arrendador ya explicó las posibles falencias de conexión.</strong></p>
        <p><strong>Detalles de internet:</strong></p>
        <ol>
          <li>Pago de S/. 39 soles.</li>
          <li>Conexión de alta latencia.</li>
          <li>Baja conectividad por actividad masiva.</li>
        </ol>
      </div>
    `);
  }

  if (incluyeCarga) {
    secciones.push(`
      <div class="seccion">
        <p><strong>Yo, ${escapeHtml(nombreCliente)}, identificado(a), con DNI / Pasaporte / C.E. N° ${escapeHtml(dniCliente)}, en mi condición de arrendatario(a) del departamento ${escapeHtml(depto)}, dispongo de la opción de contratar el servicio de carga de patinete el cual El Arrendador determinó en este contrato.</strong></p>
        <p><strong>Detalles del cargo extra por carga eléctrica:</strong></p>
        <ol>
          <li>Pago de S/. 60 soles.</li>
          <li>Patines pequeños / medianos.</li>
          <li>No debe comprometer ninguna conexión eléctrica; si el dispositivo del cliente genera algún problema con la infraestructura eléctrica de la vivienda, este deberá correr con los gastos de la reparación.</li>
          <li>Evitar la sobrecarga del monopatín/bicicleta eléctrica.</li>
        </ol>
        <p class="recomendacion">Recomendación: si desea emplear este servicio, lo mejor es comprar un transformador eléctrico para evitar cortos circuitos o tener el cargador oficial; recuerde que cualquier imprevisto eléctrico fuera de los regulares puede representar un peligro para usted y los habitantes del inmueble. Gracias.</p>
      </div>
    `);
  }

  const contenido =
    secciones.length > 0
      ? secciones.join("\n")
      : `
    <div class="seccion">
      <p><strong>El cliente no eligió servicios extras adicionales en este contrato.</strong></p>
    </div>
  `;

  const opcionTomada =
    incluyeInternet && incluyeCarga
      ? "Internet + carga eléctrica"
      : incluyeInternet
        ? "Internet"
        : incluyeCarga
          ? "Carga eléctrica"
          : "Sin servicio extra";

  return `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <style>
      @page { size: A4; margin: 24mm 20mm; }
      * { box-sizing: border-box; }
      body {
        font-family: "Segoe UI", Arial, sans-serif;
        color: #1f2937;
        margin: 0;
        line-height: 1.6;
      }
      .header {
        border-bottom: 3px solid #3f6212;
        padding-bottom: 16px;
        margin-bottom: 24px;
      }
      h1 {
        font-size: 20px;
        margin: 0 0 8px;
        color: #111827;
        text-align: center;
      }
      .meta {
        font-size: 12px;
        color: #6b7280;
        margin-top: 8px;
        text-align: center;
      }
      .seccion {
        margin: 24px 0;
        padding: 20px;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        background: #fafafa;
        page-break-inside: avoid;
      }
      .seccion p {
        margin: 12px 0;
        font-size: 13px;
      }
      .recomendacion {
        font-style: italic;
        color: #4b5563;
      }
      ol {
        margin: 12px 0;
        padding-left: 24px;
        font-size: 13px;
      }
      li { margin: 6px 0; }
      .linea-firma {
        display: flex;
        align-items: flex-end;
        margin-top: 40px;
      }
      .espacio {
        flex: 1;
        border-bottom: 1px solid #6b7280;
      }
      .texto {
        padding: 0 16px;
        font-size: 12px;
        color: #4b5563;
      }
      .footer-info {
        margin-top: 40px;
        font-size: 12px;
        color: #6b7280;
      }
    </style>
  </head>
  <body>
    <div class="header">
      <h1>PAGOS EXTRAS POR CONEXIÓN Y MEDIO DE CARGA</h1>
      <div class="meta">Contrato: ${codigoContrato}</div>
      <div class="meta">Fecha de opción tomada: ${fechaOpcion}</div>
      <div class="meta">Día de pago (según contrato): ${fechaPago}</div>
    </div>

    ${contenido}

    <div class="linea-firma">
      <div class="espacio"></div>
      <div class="texto">Firma del arrendador(a)</div>
      <div class="espacio"></div>
    </div>

    <div class="linea-firma">
      <div class="espacio"></div>
      <div class="texto">Firma del arrendatario</div>
      <div class="espacio"></div>
    </div>

    <div class="footer-info">
      <p>Nombre del arrendatario: ${escapeHtml(nombreCliente || "[Nombre del arrendatario]")}</p>
      <p>Documento: ${escapeHtml(dniCliente)}</p>
      <p>Departamento: ${escapeHtml(depto)}</p>
      <p>Opción tomada: ${opcionTomada}</p>
    </div>
  </body>
</html>`;
}
