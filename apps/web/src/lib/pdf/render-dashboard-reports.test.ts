import { describe, expect, it } from "vitest";
import {
  renderDisponiblesHtml,
  renderReporteSemanalHtml,
} from "./render-dashboard-reports";

describe("renderDisponiblesHtml", () => {
  it("resume unidades no ocupadas y escapa los datos del inventario", () => {
    const html = renderDisponiblesHtml([
      {
        codigo: "A-101",
        nombre: "Suite <Ejecutiva>",
        numero: "101",
        piso: 1,
        precio: "1500.00",
        precioNegociable: true,
        activo: true,
        enMantenimiento: false,
        bloqueado: false,
      },
      {
        codigo: "A-102",
        nombre: "Unidad ocupada",
        numero: "102",
        activo: true,
        disponibilidad: { fechaFin: "2026-12-01", dias: 29 },
      },
      {
        codigo: "A-103",
        nombre: "Unidad inactiva",
        numero: "103",
        activo: false,
      },
    ]);

    expect(html).toContain("1 unidad disponible");
    expect(html).toContain("Suite &lt;Ejecutiva&gt;");
    expect(html).toMatch(/1,500\.00/);
    expect(html).not.toContain("<Ejecutiva>");
    expect(html).not.toContain("Unidad ocupada");
    expect(html).not.toContain("Unidad inactiva");
  });
});

describe("renderReporteSemanalHtml", () => {
  it("incluye resumen y todas las categorías de actividad con texto escapado", () => {
    const html = renderReporteSemanalHtml({
      inicioSemana: "2026-11-02",
      fechaCorte: "2026-11-02",
      renovaciones: [],
      reportesClientes: [
        {
          id: "incident-1",
          titulo: "Cliente <uno>",
          detalle: "Reporte & revisión",
          fecha: "2026-11-02T15:00:00.000Z",
        },
      ],
      reparaciones: [],
      contratosNuevos: [],
      adendasNuevas: [],
    });

    expect(html).toContain("1 actividades");
    expect(html).toContain("Cliente &lt;uno&gt;");
    expect(html).toContain("Reporte &amp; revisión");
    expect(html).toContain("Contratos renovados");
    expect(html).toContain("Reparaciones realizadas");
    expect(html).toContain("Nuevos contratos");
    expect(html).toContain("Nuevas adendas");
    expect(html).not.toContain("<uno>");
  });
});
