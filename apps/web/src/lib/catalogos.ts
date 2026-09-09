export type GrupoChecklist = {
  categoria: string;
  items: readonly (readonly [string, string])[];
};

export const INVENTARIO_MUEBLERIA: readonly GrupoChecklist[] = [
  {
    categoria: "Living",
    items: [
      ["living-puerta", "01 puerta"],
      ["living-sillones", "02 sillones personales"],
      ["living-tv", "01 TV JVC de 43 y control c/pilas"],
      ["living-decodificador", "01 decodificador con control c/pilas"],
      ["living-mesa", "01 mesa de centro"],
      ["living-persiana", "01 persiana"],
      ["living-luminarias", "Luminarias"],
    ],
  },
  {
    categoria: "Cocina",
    items: [
      ["cocina-isla", "01 isla"],
      ["cocina-bancos", "02 bancos con asientos blancos"],
      ["cocina-cocina", "01 cocina empotrada 4 hornillas"],
      ["cocina-gas", "01 balón de gas + manguera"],
      ["cocina-lavadero", "01 lavadero con grifería"],
      ["cocina-frigider", "01 frigider 2 puertas Miray"],
      ["cocina-microondas", "01 microondas Miray"],
      ["cocina-campana", "01 campana Klimatic"],
      ["cocina-mueble", "01 mueble alto y bajo"],
      ["cocina-tacho", "01 tacho de basura"],
      ["cocina-luminarias", "Luminarias"],
    ],
  },
  {
    categoria: "Dormitorio",
    items: [
      ["dormitorio-cama", "01 cama de 2 plazas con respaldar blanco"],
      ["dormitorio-colchon", "01 colchón de 2 plazas"],
      ["dormitorio-cubre", "01 cubre colchón"],
      ["dormitorio-repisas", "02 repisas de noche"],
      ["dormitorio-closet", "01 closet de 2 puertas y maletero"],
      ["dormitorio-persiana", "01 persiana"],
      ["dormitorio-mesita", "01 mesita empotrada"],
      ["dormitorio-luminaria", "Luminaria"],
    ],
  },
  {
    categoria: "Baño",
    items: [
      ["bano-espejo", "01 espejo"],
      ["bano-lavamanos", "01 lavamanos c/grifería"],
      ["bano-ducha", "01 ducha"],
      ["bano-mampara", "01 mampara de vidrio"],
      ["bano-inodoro", "01 inodoro con tapa"],
      ["bano-accesorios", "01 accesorio de toallas, PH"],
      ["bano-tacho", "01 tacho de basura"],
      ["bano-isopo", "01 isopo de baño"],
      ["bano-luminarias", "Luminarias"],
    ],
  },
];

export const INVENTARIO_MUEBLERIA_TOTAL = INVENTARIO_MUEBLERIA.reduce(
  (total, grupo) => total + grupo.items.length,
  0
);

export const MASCOTAS: readonly GrupoChecklist[] = [
  {
    categoria: "Mascotas",
    items: [
      ["perro", "Perro"],
      ["gato", "Gato"],
      ["hamster", "Hámster"],
      ["otros", "Otros"],
    ],
  },
];

export const MASCOTAS_TOTAL = MASCOTAS.reduce(
  (total, grupo) => total + grupo.items.length,
  0
);

/**
 * Convierte los IDs marcados en la ficha a sus etiquetas de catálogo
 * (p. ej. "living-puerta" -> "01 puerta"; "perro" -> "Perro").
 * Los IDs desconocidos se conservan tal cual.
 */
export function etiquetasDeIds(
  grupos: readonly GrupoChecklist[],
  ids: readonly string[] | undefined
): string[] {
  const mapa = new Map<string, string>();
  for (const grupo of grupos) {
    for (const [id, etiqueta] of grupo.items) {
      mapa.set(id, etiqueta);
    }
  }
  return (ids ?? [])
    .map((id) => mapa.get(id) ?? id)
    .filter(Boolean);
}