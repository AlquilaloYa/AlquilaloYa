import { describe, expect, it } from "vitest";
import { parseLocalRecord } from "./locales-records";

const localId = "c57a2f9e-861f-4dc2-a101-fb84cbda99bb";
const contactId = "a41e2835-1004-4fa2-9dd7-8fa9c3919812";

describe("local module records", () => {
  it("normalizes independent local contacts", () => {
    expect(
      parseLocalRecord({
        tipo: "contactos",
        localId,
        nombres: "  Ana ",
        apellidos: " Pérez ",
        documento: "123",
        telefono: "999",
        email: "ana@example.com",
      }),
    ).toEqual({
      value: {
        tipo: "contactos",
        localId,
        nombres: "Ana",
        apellidos: "Pérez",
        documento: "123",
        telefono: "999",
        email: "ana@example.com",
      },
    });
  });

  it("rejects malformed relation ids and invalid contract date ranges", () => {
    expect(
      parseLocalRecord({
        tipo: "separaciones",
        localId,
        contactId: "not-a-uuid",
        monto: 100,
        estado: "PENDIENTE",
        fecha: "2026-11-07",
        observaciones: "",
      }),
    ).toHaveProperty("error", "Selecciona un contacto válido.");
    expect(
      parseLocalRecord({
        tipo: "contratos",
        localId,
        contactId,
        separationId: "",
        codigo: "LOCAL-1",
        montoCanon: 100,
        fechaInicio: "2026-12-01",
        fechaFin: "2026-11-01",
        estado: "BORRADOR",
      }),
    ).toHaveProperty("error", "La fecha de fin no puede ser anterior a la fecha de inicio.");
  });

  it("normalizes service pricing and rejects invalid service frequencies", () => {
    expect(
      parseLocalRecord({
        tipo: "servicios",
        localId,
        nombre: "Limpieza",
        descripcion: "",
        monto: 15,
        frecuencia: "MENSUAL",
        activo: true,
      }),
    ).toMatchObject({ value: { monto: "15.00", activo: true } });
    expect(
      parseLocalRecord({
        tipo: "servicios",
        localId,
        nombre: "Limpieza",
        monto: 15,
        frecuencia: "SEMANAL",
        activo: true,
      }),
    ).toHaveProperty("error");
  });
});
