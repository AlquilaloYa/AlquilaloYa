import { PersonType } from "@contract/domain/client";

export interface ArchivoAdjunto {
  id: string;
  nombre: string;
  tipo: string;
  dataUrl: string;
}

export interface ContactSeed {
  id: string;
  nombre: string;
  apellido: string;
  tipoPersona: PersonType;
  dni: string;
  ruc?: string | null;
  domicilio?: string;
  email: string;
  telefono: string;
  copiaDni?: ArchivoAdjunto[];
  copiaBoletas?: ArchivoAdjunto[];
  copiaAntecedentes?: ArchivoAdjunto[];
  contactoEmergencia?: {
    nombre: string;
    parentesco: string;
    telefono: string;
  };
  mascotas?: boolean;
  mascotasItems?: string[];
}

export const CONTACTOS_STORAGE_KEY = "sc_contactos_v7";

const NATURALES: [string, string][] = [];

const JURIDICAS: string[] = [];

function numeroTelefono(i: number): string {
  const movil = String(900000000 + i * 13721);
  return "+51" + movil;
}

function booleanoDe(i: number, salto: number): boolean {
  return Math.floor(i / salto) % 2 !== 0;
}

export function seedContactos(): ContactSeed[] {
  const naturales: ContactSeed[] = NATURALES.map(([nombre, apellido], i) => ({
    id: `n${i + 1}`,
    nombre,
    apellido,
    tipoPersona: PersonType.NATURAL,
    dni: String(40000000 + i * 9843).padEnd(8, "0").slice(0, 8),
    ruc: null,
    email: `${nombre.toLowerCase().replace(/[^a-z]/g, "")}.${apellido.toLowerCase().replace(/[^a-z]/g, "")}@example.com`,
    telefono: numeroTelefono(i),
    copiaDni: [],
    copiaBoletas: [],
    copiaAntecedentes: [],
    mascotas: booleanoDe(i, 2),
  }));

  const juridicas: ContactSeed[] = JURIDICAS.map((nombre, i) => ({
    id: `j${i + 1}`,
    nombre,
    apellido: "",
    tipoPersona: PersonType.LEGAL,
    dni: `R20${String(300000000 + i * 1234)}`,
    ruc: String(20100000001 + i * 9873),
    email: `contacto${i + 1}@${nombre.toLowerCase().replace(/[^a-z]/g, "").slice(0, 12)}.pe`,
    telefono: "+51" + String(100000000 + i * 89121).slice(0, 9),
    copiaDni: [],
    copiaBoletas: [],
    copiaAntecedentes: [],
    mascotas: booleanoDe(i + 60, 4),
  }));

  return [...naturales, ...juridicas];
}

export function leerContactos(): ContactSeed[] {
  const stored = localStorage.getItem(CONTACTOS_STORAGE_KEY);
  if (stored) {
    try {
      return JSON.parse(stored) as ContactSeed[];
    } catch {
      return seedContactos();
    }
  }
  return seedContactos();
}
