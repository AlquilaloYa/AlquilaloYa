import { describe, expect, it } from "vitest";
import {
  renderAsistenciaHtml,
  type AsistenciaPdfRegistro,
} from "./render-asistencia-html";

const row: AsistenciaPdfRegistro = {
  nombre: "Ana <Rojas>",
  dni: "12345678",
  entradaAt: new Date("2026-10-12T13:00:00Z"),
  salidaAt: null,
  refrigerioInicioAt: null,
  refrigerioFinAt: null,
  asistio: true,
  createdAt: new Date("2026-10-12T13:00:00Z"),
};

describe("renderAsistenciaHtml", () => {
  it("includes each table point and a signature for each unique worker", () => {
    const html = renderAsistenciaHtml("2026-10", [row, row]);

    expect(html).toContain("Hora de inicio");
    expect(html).toContain("Hora de salida");
    expect(html).toContain("Refrigerio inicio");
    expect(html).toContain("Refrigerio fin");
    expect(html).toContain("Asistió");
    expect(html).toContain("Ana &lt;Rojas&gt;");
    expect(html.match(/DNI: 12345678/g)).toHaveLength(1);
  });

  it("renders a clear empty-month report", () => {
    expect(renderAsistenciaHtml("2026-10", [])).toContain(
      "No hay asistencias registradas en este mes.",
    );
  });
});
