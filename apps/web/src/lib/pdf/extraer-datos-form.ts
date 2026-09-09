export interface DatosExtraidos {
  nombre?: string;
  apellido?: string;
  dni?: string;
  ruc?: string;
  email?: string;
  telefono?: string;
}

const normalizar = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w@.+ -]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const METADATA = /^(formulario|google forms|p[aá]gina|page\s|.*respuesta.*|.*translated.*|.*traducido.*)/i;

const ETIQUETAS_PATRONES = [
  { campo: "nombre" as const, re: /^(nombre completo|nombre y apellido|nombres?)$/ },
  { campo: "apellido" as const, re: /^apellidos?$/ },
  {
    campo: "dni" as const,
    re: /^(dni\/ce|dni o ce|documento de identidad|carnet de extranjer[ií]a|n[°o] de documento|numero de documento|dni)$/,
  },
  { campo: "ruc" as const, re: /^ruc$/ },
  {
    campo: "email" as const,
    re: /^(correo electr[oó]nico|correo electronico|correo|e-mail|email)$/,
  },
  {
    campo: "telefono" as const,
    re: /^(tel[eé]fono|telefono|celular|n[uú]mero de tel[eé]fono|numero de telefono)$/,
  },
];

const esEtiqueta = (norm: string): boolean => {
  const limpia = norm.replace(/^[\d.)·•\-*:>\s]+/, "");
  if (limpia.length === 0 || limpia.length > 40) return false;
  return ETIQUETAS_PATRONES.some(({ re }) => re.test(limpia));
};

export function extraerDatosForm(texto: string): DatosExtraidos {
  const datos: DatosExtraidos = {};

  const lineas = texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const normalizadas = lineas.map(normalizar);

  lineas.forEach((linea, i) => {
    const norm = normalizadas[i] ?? "";
    if (METADATA.test(norm)) return;

    if (!datos.email) {
      const emailMatch = linea.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
      if (emailMatch) datos.email = emailMatch[0];
    }
    if (!datos.ruc) {
      const ruc = linea.match(/\b\d{11}\b/);
      if (ruc) datos.ruc = ruc[0];
    }
    if (!datos.dni && !datos.ruc) {
      const dni = linea.match(/\b(\d{8})\b/);
      if (dni && !dni[1]!.startsWith("9")) datos.dni = dni[1]!;
    }
    if (!datos.telefono) {
      const telefono = linea.match(/9\d{8}/);
      if (telefono) datos.telefono = telefono[0];
    }
  });

  for (let i = 0; i < lineas.length; i++) {
    const norm = normalizadas[i] ?? "";
    if (!esEtiqueta(norm) || (datos.nombre && datos.apellido && datos.dni && datos.ruc && datos.email && datos.telefono)) {
      continue;
    }
    for (const { campo, re } of ETIQUETAS_PATRONES) {
      const limpia = norm.replace(/^[\d.)·•\-*:>\s]+/, "");
      if (!re.test(limpia) || datos[campo]) continue;
      const enLinea = limpia.includes(":");
      if (enLinea) {
        const valor = (lineas[i] ?? "").split(":")[1]?.trim();
        if (valor && valor.length > 1 && valor.length < 120) {
          datos[campo] = valor;
          continue;
        }
      }
      let j = i + 1;
      while (j < lineas.length) {
        const normJ = normalizadas[j] ?? "";
        const valor = lineas[j] ?? "";
        if (esEtiqueta(normJ) || METADATA.test(normJ)) {
          j++;
          continue;
        }
        if (valor.length > 1 && valor.length < 120) {
          datos[campo] = valor;
          break;
        }
        j++;
      }
    }
  }

  if (datos.nombre && !datos.apellido) {
    const partes = datos.nombre.split(/\s+/);
    const primero = partes.shift();
    if (primero && partes.length >= 1) {
      datos.nombre = primero;
      datos.apellido = partes.join(" ");
    }
  }

  if (datos.telefono) {
    const digitos = datos.telefono.replace(/\D/g, "");
    const limpio = digitos.startsWith("51") ? digitos.slice(2) : digitos;
    datos.telefono = limpio.length === 9 ? `+51 ${limpio}` : datos.telefono;
  }

  return datos;
}