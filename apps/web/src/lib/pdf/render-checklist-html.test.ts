import { describe, expect, it } from "vitest";
import { renderChecklistHtml } from "./render-checklist-html";

describe("renderChecklistHtml", () => {
  it("rellena datos del contacto y la lista", () => {
    const html = renderChecklistHtml(
      "<h1>{{CONTACTO_NOMBRE_COMPLETO}}</h1><p>{{CONTACTO_DOCUMENTO}}</p><ul>{{CHECKLIST_ITEMS}}</ul>",
      {
        nombre: "Ana",
        apellido: "Perez",
        dni: "12345678",
        ruc: null,
        domicilio: "Av. Lima 123",
        email: "ana@example.com",
        telefono: "+51999999999",
      },
      ["Llaves", "Control remoto"]
    );
    expect(html).toContain("Ana Perez");
    expect(html).toContain("12345678");
    expect(html).toContain("<li>Llaves</li>");
    expect(html).not.toContain("{{CONTACTO_");
  });
});
