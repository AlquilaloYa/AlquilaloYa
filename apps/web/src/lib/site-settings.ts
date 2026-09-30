"use client";

export interface SiteSettings {
  hero: {
    eyebrow: string;
    title: string;
    subtitle: string;
    background_image: string;
  };
  about: {
    title: string;
    subtitle: string;
    heading: string;
    paragraph: string;
    values_heading: string;
    values: { title: string; description: string }[];
    metrics: { value: string; label: string }[];
  };
  contact: {
    whatsapp: string;
    whatsapp_message: string;
    email: string;
    phone_display: string;
    address: string;
    schedule: string;
  };
  seo: {
    site_name: string;
    site_url: string;
    title: string;
    description: string;
  };
  advanced: {
    price_min: number;
    max_price: number;
    price_step: number;
    zones: { slug: "Angamos" | "Benavides"; label: string; address: string }[];
    amenities: { key: string; label: string }[];
    custom_tags: { key: string; label: string }[];
  };
}

export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  hero: {
    eyebrow: "Mini departamentos de alquiler",
    title: "Tu MiniDepa, a la medida de la ciudad y de tu presupuesto",
    subtitle:
      "Mini departamentos sobre los ejes Angamos y Benavides en Miraflores. Muebles de calidad, áreas comunes y excelente conectividad exclusivo para estudiantes y jóvenes profesionales.",
    background_image: "",
  },
  about: {
    title: "Sobre Nosotros",
    subtitle: "Alquila Ya · Miraflores",
    heading: "Mini departamentos pensados para la ciudad",
    paragraph:
      "Alquila Ya gestiona mini departamentos sobre los ejes Angamos y Benavides en Miraflores, diseñados para estudiantes y jóvenes profesionales que buscan practicidad, seguridad y cercanía a sus centros de estudio o trabajo.",
    values_heading: "Nuestros valores",
    values: [
      { title: "Ubicación", description: "Frente a estaciones del Metropolitano y a minutos de la PUCP." },
      { title: "Seguridad", description: "Ingreso controlado, edificios modernos y gestión profesional." },
      { title: "Comodidad", description: "Espacios eficientes, amoblados y listos para habitar." },
    ],
    metrics: [
      { value: "+60", label: "mini departamentos" },
      { value: "8", label: "edificios en Miraflores" },
      { value: "24/7", label: "gestión y soporte" },
      { value: "100%", label: "edificios con seguridad" },
    ],
  },
  contact: {
    whatsapp: "51924000000",
    whatsapp_message: "Hola, quiero información",
    email: "ventas@alquilaya.pe",
    phone_display: "+51 924 000 000",
    address: "Miraflores, Lima, Perú",
    schedule: "Lun a Sáb · 9:00 am – 7:00 pm",
  },
  seo: {
    site_name: "Alquila Ya",
    site_url: "https://alquilaya.pe",
    title: "Mini departamentos en Miraflores | Alquila Ya",
    description:
      "Mini departamentos de alquiler sobre los ejes Angamos y Benavides en Miraflores, Lima. Amoblados, seguros y listos para habitar. Consulta disponibilidad por WhatsApp.",
  },
  advanced: {
    price_min: 1500,
    max_price: 500000,
    price_step: 500,
    zones: [
      { slug: "Angamos", label: "Angamos", address: "Av. Angamos, Miraflores" },
      { slug: "Benavides", label: "Benavides", address: "Av. Benavides, Miraflores" },
    ],
    amenities: [
      { key: "is_furnished", label: "Amoblado" },
      { key: "pets_allowed", label: "Apto mascotas" },
      { key: "ventana_externa", label: "Ventana externa" },
      { key: "ventanas_altas", label: "Ventanas altas (privacidad máxima)" },
      { key: "monoambiente", label: "Monoambientes" },
      { key: "mini_departamento", label: "Mini departamento" },
      { key: "mini_con_tendal", label: "Mini con tendal" },
    ],
    custom_tags: [],
  },
};

export function normalizeSettings(
  raw: Record<string, Record<string, unknown>>
): SiteSettings {
  const defaults = DEFAULT_SITE_SETTINGS;
  const advanced = { ...defaults.advanced, ...(raw.advanced ?? {}) };
  delete (advanced as Record<string, unknown>).surface_m2;

  return {
    hero: { ...defaults.hero, ...(raw.hero ?? {}) },
    about: {
      ...defaults.about,
      ...(raw.about ?? {}),
      values:
        Array.isArray(raw.about?.values) && (raw.about.values as unknown[]).length > 0
          ? (raw.about.values as { title: string; description: string }[])
          : defaults.about.values,
      metrics:
        Array.isArray(raw.about?.metrics) && (raw.about.metrics as unknown[]).length > 0
          ? (raw.about.metrics as { value: string; label: string }[])
          : defaults.about.metrics,
    },
    contact: { ...defaults.contact, ...(raw.contact ?? {}) },
    seo: { ...defaults.seo, ...(raw.seo ?? {}) },
    advanced: {
      ...advanced,
      custom_tags: Array.isArray(raw.advanced?.custom_tags)
        ? (raw.advanced.custom_tags as { key: string; label: string }[])
        : defaults.advanced.custom_tags,
      zones:
        Array.isArray(raw.advanced?.zones) && (raw.advanced.zones as unknown[]).length > 0
          ? (raw.advanced.zones as { slug: "Angamos" | "Benavides"; label: string; address: string }[])
          : defaults.advanced.zones,
      amenities:
        Array.isArray(raw.advanced?.amenities) && (raw.advanced.amenities as unknown[]).length > 0
          ? (raw.advanced.amenities as { key: string; label: string }[])
          : defaults.advanced.amenities,
    },
  };
}