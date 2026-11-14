import { describe, expect, it } from "vitest";
import {
  LOCAL_CODES,
  localNumberForCode,
  localSiteForCode,
} from "@contract/domain/locales";
import { parseLocal } from "./locales-validation";

describe("locales", () => {
  it("maps the eight local codes to their sites", () => {
    expect(LOCAL_CODES).toHaveLength(8);
    expect(LOCAL_CODES.filter((item) => item.sede === "Benavides")).toHaveLength(3);
    expect(LOCAL_CODES.filter((item) => item.sede === "Angamos")).toHaveLength(5);
    expect(localSiteForCode("BEN2195-A2")).toBe("Benavides");
    expect(localSiteForCode("ANG170-A3")).toBe("Angamos");
    expect(localSiteForCode("ANG170-A5")).toBe("Angamos");
    expect(localNumberForCode("BEN2195-A2")).toBe("A2");
    expect(localNumberForCode("ANG170-A5")).toBe("A5");
  });

  it("normalizes the local input and derives its site from the code", () => {
    expect(
      parseLocal({
        codigo: "BEN2195-A1",
        nombre: "  Tienda 1 ",
        areaM2: 75.5,
        precioAlquiler: 1200,
        garantia: 1200,
        mantenimiento: 50,
        servicios: "Agua",
        pagoLuzPorcentaje: 35,
        pagoAguaPorcentaje: 25,
        montoJardineria: 75,
        impuestoRentaPorcentaje: 5,
        letreroAltoCm: 200,
        letreroAnchoCm: 350,
        letreroProfundidadCm: 10,
      }),
    ).toEqual({
      value: {
        codigo: "BEN2195-A1",
        numero: "A1",
        sede: "Benavides",
        nombre: "Tienda 1",
        areaM2: "75.50",
        precioAlquiler: "1200.00",
        garantia: "1200.00",
        mantenimiento: "50.00",
        servicios: "Agua",
        pagoLuzPorcentaje: "35.00",
        pagoAguaPorcentaje: "25.00",
        montoJardineria: "75.00",
        impuestoRentaPorcentaje: "5.00",
        letreroAltoCm: "200.00",
        letreroAnchoCm: "350.00",
        letreroProfundidadCm: "10.00",
      },
    });
  });

  it("defaults the optional local service and signage fields", () => {
    expect(
      parseLocal({
        codigo: "ANG170-A1",
        nombre: "Local",
        areaM2: 1,
        precioAlquiler: 1,
        garantia: 1,
        mantenimiento: 1,
        servicios: "",
        pagoLuzPorcentaje: 0,
      }),
    ).toMatchObject({
      value: {
        pagoAguaPorcentaje: "0.00",
        montoJardineria: "0.00",
        impuestoRentaPorcentaje: "5.00",
        letreroAltoCm: "0.00",
        letreroAnchoCm: "0.00",
        letreroProfundidadCm: "0.00",
      },
    });
  });

  it("rejects unsupported codes and percentages above 100", () => {
    expect(parseLocal({ codigo: "OTHER-A1", nombre: "Local" })).toHaveProperty("error");
    expect(
      parseLocal({
        codigo: "ANG170-A1",
        nombre: "Local",
        areaM2: 1,
        precioAlquiler: 1,
        garantia: 1,
        mantenimiento: 1,
        servicios: "",
        pagoLuzPorcentaje: 101,
      }),
    ).toHaveProperty("error", "Pago luz % debe ser un número entre 0 y 100.");
    expect(
      parseLocal({
        codigo: "ANG170-A1",
        nombre: "Local",
        areaM2: 1,
        precioAlquiler: 1,
        garantia: 1,
        mantenimiento: 1,
        servicios: "",
        pagoLuzPorcentaje: 0,
        pagoAguaPorcentaje: 101,
      }),
    ).toHaveProperty("error", "Pago agua % debe ser un número entre 0 y 100.");
  });
});
