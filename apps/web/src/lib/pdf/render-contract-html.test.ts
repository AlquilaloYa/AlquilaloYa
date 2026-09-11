import { describe, expect, it } from "vitest";
import type { ContractSnapshot } from "@contract/domain/snapshot";
import { renderContractHtml } from "./render-contract-html";

function snapshot(overrides?: Partial<ContractSnapshot>): ContractSnapshot {
  return {
    id: "snap-1",
    codigoContrato: "ANG156-L1",
    plantillaVersionId: "tv-1",
    datosCliente: {
      nombres: "Juan",
      apellidos: "Pérez",
      documentoIdentidad: "70000000",
      tipoPersona: "NATURAL",
      domicilio: "Av. Alfredo Benavides 2195, Miraflores, Lima",
    },
    datosDepartamento: { codigo: "L1", personaPago: "Juan Pérez", piso: 2 },
    datosContrato: {
      montoCanonMensual: "1500.00",
      mantenimiento: "50.00",
      depositoGarantia: "3000.00",
      fechaInicio: "2025-03-10",
      fechaFin: "2026-03-10",
      codigoContrato: "ANG156-L1",
      separacionDetalle: {
        tipo: "FLUCTUANTE",
        monto: "750.00",
        garantiaExtendida: false,
        fecha: "2025-03-05T00:00:00.000Z",
      },
      copiaDni: [{ nombre: "dni.png", tipo: "image/png", dataUrl: "data:image/png;base64,abc" }],
    },
    clausulas: [
      { versionId: "c1", contenido: "CLÁUSULA DE INVENTARIO DE MUEBLES — 01 puerta." },
      { versionId: "c2", contenido: "CLÁUSULA DE MASCOTAS — Perro." },
    ],
    anexos: [],
    inmutable: true,
    emitidoEn: "2025-03-10T00:00:00.000Z",
    createdAt: "2025-03-10T00:00:00.000Z",
    ...overrides,
  } as ContractSnapshot;
}

describe("renderContractHtml con plantilla (Benavides)", () => {
  const template = [
    "<h1>Contrato</h1>",
    "<p>El Sr.(a) [NOMBRE DEL ARRENDATARIO], D.N.I. [NÚMERO DNI].</p>",
    "<p>Firma: DNI / PASAPORTE: [NÚMERO].</p>",
    "<p>Domicilio: [DOMICILIO].</p>",
    "<p>Renta de S/ [MONTO RENTA] total S/ [TOTAL MONTO].</p>",
    "<p>Departamento N° [NÚMERO DE DEPTO] desde el [DÍA INICIO] de [MES INICIO] de [AÑO INICIO] hasta el [DÍA FIN] de [MES FIN] de [AÑO FIN].</p>",
    "<p>Garantía de S/ [MONTO GARANTÍA].</p>",
    "<p>[DETALLE GARANTIA]</p>",
    "<div>[DNI]</div>",
  ].join("\n");

  it("sustituye placeholders con datos del snapshot", () => {
    const html = renderContractHtml(snapshot(), template);
    expect(html).toContain("Juan Pérez");
    expect(html).toContain("70000000");
    expect(html).not.toContain("[NÚMERO]");
    expect(html).toContain("Av. Alfredo Benavides 2195, Miraflores, Lima");
    expect(html).toContain("1500.00");
    expect(html).toContain("1550.00"); // renta + 50 mantenimiento
    expect(html).toContain("3000.00");
    expect(html).toContain("L1");
    expect(html).toContain("10");
    expect(html).toContain("marzo");
    expect(html).toContain("2025");
    expect(html).toContain("2026");
    expect(html).toContain("separación fluctuante de S/ 750.00");
    expect(html).toContain("realizada el día 5 de marzo de 2025");
    expect(html).not.toContain("notarización del contrato");
    expect(html).toContain("al momento de la firma.");
    expect(html).toContain('<img src="data:image/png;base64,abc"');
  });

  it("no deja placeholders sin reemplazar", () => {
    const html = renderContractHtml(snapshot(), template);
    expect(html).not.toContain("[MONTO RENTA]");
    expect(html).not.toContain("[NOMBRE DEL ARRENDATARIO]");
    expect(html).not.toContain("[DOMICILIO]");
    expect(html).not.toContain("[MONTO GARANTÍA]");
  });

  it("anexa la copia de DNI al final si la plantilla no usa [DNI]", () => {
    const templateSinDni =
      "<h1>Contrato</h1><p>[NOMBRE DEL ARRENDATARIO]</p></body>";
    const html = renderContractHtml(snapshot(), templateSinDni);
    expect(html).toContain("Copia de DNI del arrendatario");
    expect(html).toContain('<img src="data:image/png;base64,abc"');
  });

  it("rellena [INVENTARIO] con los bienes entregados del snapshot", () => {
    const snp = snapshot();
    (snp.datosContrato as Record<string, unknown>).muebleriaItems = [
      "01 puerta",
      "01 isla",
    ];
    const html = renderContractHtml(snp, "<h1>Contrato</h1><p>[INVENTARIO]</p>");
    expect(html).toContain("01 puerta; 01 isla");
    expect(html).not.toContain("[INVENTARIO]");
  });
  it("rellena [ESPECIE] con las mascotas del snapshot", () => {
    const snp = snapshot();
    (snp.datosContrato as Record<string, unknown>).mascotasItems = ["Perro"];
    const html = renderContractHtml(
      snp,
      "<p>dueño responsable de la mascota especie [ESPECIE]</p>"
    );
    expect(html).toContain("mascota especie Perro");
    expect(html).not.toContain("[ESPECIE]");
  });

  it("usa el día de inicio del contrato como [DÍA DE PAGO]", () => {
    const html = renderContractHtml(
      snapshot(),
      "<p>los días [DÍA DE PAGO] de cada mes</p>"
    );
    expect(html).toContain("los días 10 de cada mes");
    expect(html).not.toContain("[DÍA DE PAGO]");
  });

  it("mantiene la proporción del DNI dentro del área imprimible A4", () => {
    const html = renderContractHtml(snapshot(), "<h1>Contrato</h1><div>[DNI]</div>");
    expect(html).toContain("max-width:165mm");
    expect(html).toContain("max-height:225mm");
    expect(html).toContain("width:auto;height:auto");
    expect(html).toContain("object-fit:contain");
    expect(html).not.toContain("max-width:175mm");
  });

  it("no usa embed para DNI en PDF (headless lo imprime como recuadro vacío)", () => {
    const snp = snapshot();
    (snp.datosContrato as Record<string, unknown>).copiaDni = [
      { nombre: "dni.pdf", tipo: "application/pdf", dataUrl: "data:application/pdf;base64,JVBERg==" },
    ];
    const html = renderContractHtml(snp, "<h1>Contrato</h1><div>[DNI]</div>");
    expect(html).not.toContain("<embed");
    expect(html).toContain("versión para notaría");
  });
});

describe("renderContractHtml sin plantilla (fallback)", () => {
  it("genera un contrato con datos y cláusulas del snapshot", () => {
    const html = renderContractHtml(snapshot());
    expect(html.toLowerCase()).toContain("contrato de arrendamiento");
    expect(html).toContain("Juan Pérez");
    expect(html).toContain("INVENTARIO DE MUEBLES");
    expect(html).toContain("MASCOTAS");
  });

  it("incluye el anexo de copia de DNI", () => {
    const html = renderContractHtml(snapshot());
    expect(html).toContain("Copia de DNI del arrendatario");
    expect(html).toContain('<img src="data:image/png;base64,abc"');
  });
});
