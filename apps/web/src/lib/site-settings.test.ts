import { describe, expect, it } from "vitest";
import { DEFAULT_SITE_SETTINGS, normalizeSettings } from "./site-settings";

describe("normalizeSettings", () => {
  it("devuelve los defaults cuando no llega configuración", () => {
    expect(normalizeSettings({})).toEqual(DEFAULT_SITE_SETTINGS);
  });

  it("fusiona secciones parciales con los defaults", () => {
    const merged = normalizeSettings({
      hero: { title: "Otro título" },
      seo: { description: "Nueva descripción" },
    });

    expect(merged.hero.title).toBe("Otro título");
    expect(merged.hero.eyebrow).toBe(DEFAULT_SITE_SETTINGS.hero.eyebrow);
    expect(merged.seo.description).toBe("Nueva descripción");
    expect(merged.seo.site_name).toBe(DEFAULT_SITE_SETTINGS.seo.site_name);
    expect(merged.contact.whatsapp).toBe(DEFAULT_SITE_SETTINGS.contact.whatsapp);
  });

  it("remplaza arrays completos solo si vienen con contenido", () => {
    const merged = normalizeSettings({
      about: { values: [{ title: "A", description: "B" }] },
      advanced: { amenities: [{ key: "pets_allowed", label: "Mascotas" }] },
    });

    expect(merged.about.values).toEqual([{ title: "A", description: "B" }]);
    expect(merged.advanced.amenities).toEqual([{ key: "pets_allowed", label: "Mascotas" }]);

    const empty = normalizeSettings({ about: { values: [] } });
    expect(empty.about.values).toBe(DEFAULT_SITE_SETTINGS.about.values);
  });

  it("mantiene tipos de advanced aunque falten campos", () => {
    const merged = normalizeSettings({ advanced: { max_price: 450000 } });
    expect(merged.advanced.max_price).toBe(450000);
    expect(merged.advanced.price_min).toBe(DEFAULT_SITE_SETTINGS.advanced.price_min);
    expect(merged.advanced.zones).toEqual(DEFAULT_SITE_SETTINGS.advanced.zones);
  });

  it("omite superficie heredada y conserva etiquetas personalizadas", () => {
    const merged = normalizeSettings({
      advanced: {
        surface_m2: 20,
        custom_tags: [{ key: "balcon-privado", label: "Balcón privado" }],
      },
    });

    expect(merged.advanced).not.toHaveProperty("surface_m2");
    expect(merged.advanced.custom_tags).toEqual([
      { key: "balcon-privado", label: "Balcón privado" },
    ]);
  });
});