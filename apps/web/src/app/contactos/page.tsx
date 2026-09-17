"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { TableScroll } from "@/components/table-scroll";
import { BusquedaInput, filtrarFilas, ordenarColumna } from "@/components/tabla-busqueda";
import { Button } from "@contract/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@contract/ui/components/card";
import { Input } from "@contract/ui/components/input";
import { Label } from "@contract/ui/components/label";
import { PersonType } from "@contract/domain/client";
import { Plus, FileText, X, Check, Upload } from "lucide-react";
import {
  type ContactSeed as ContactView,
  obtenerContactos,
  crearContacto,
  actualizarContacto,
} from "@/lib/contactos-seed";
import { migrarDatosLocales } from "@/lib/migracion-local";
import type { DatosExtraidos } from "@/lib/pdf/extraer-datos-form";
import type { ArchivoAdjunto } from "@/lib/contactos-seed";
import { MASCOTAS, MASCOTAS_TOTAL, type GrupoChecklist } from "@/lib/catalogos";
import { PAISES_CODIGO } from "@/lib/paises-codigo";

const EMERGENCIA_VACIO = { nombre: "", parentesco: "", telefono: "" };

function normalizarTelefono(valor: string, codigoPais: string = "51"): string {
  let d = valor.replace(/[^0-9]/g, "");
  const codigo = (codigoPais ?? "51").replace(/[^0-9]/g, "");
  if (d.length >= codigo.length + 1 && d.startsWith(codigo)) d = d.slice(codigo.length);
  if (d.length > 9) d = d.slice(0, 9);
  return d;
}

function formatearTelefono(t: string | null | undefined, codigoPais: string = "51"): string {
  if (!t) return "—";
  const prefijo = `+${(codigoPais ?? "51").replace(/[^0-9]/g, "")}`;
  return t.startsWith(prefijo) ? t : `${prefijo} ${t}`;
}

function esFormatoAdmitido(f: File): boolean {
  return (
    ["application/pdf", "image/jpeg", "image/png"].includes(f.type) ||
    /\.(pdf|jpe?g|png)$/i.test(f.name)
  );
}

function TelefonoInput(props: {
  value: string;
  codigoPais: string;
  onCodigoPaisChange: (codigo: string) => void;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex h-10 items-stretch overflow-hidden rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring">
      <select
        value={props.codigoPais}
        disabled={props.disabled}
        onChange={(e) => props.onCodigoPaisChange(e.target.value)}
        title="Código de país del teléfono"
        className="h-10 min-w-0 basis-[7rem] border-r border-input bg-muted px-1.5 text-sm font-semibold text-on-surface-variant outline-none disabled:cursor-not-allowed"
      >
        {PAISES_CODIGO.map(({ codigo }) => (
          <option key={codigo} value={codigo}>+{codigo}</option>
        ))}
      </select>
      <input
        type="tel"
        inputMode="numeric"
        disabled={props.disabled}
        className="w-full min-w-0 bg-transparent px-3 py-2 text-sm outline-none disabled:cursor-not-allowed"
        value={props.value}
        onChange={(e) => props.onChange(normalizarTelefono(e.target.value, props.codigoPais))}
        placeholder="9XXXXXXXX"
      />
    </div>
  );
}

function ChecklistModal(props: {
  titulo: string;
  descripcion: string;
  grupos: readonly GrupoChecklist[];
  total: number;
  seleccionados: string[];
  editable: boolean;
  soloMarcados?: boolean;
  onToggle: (id: string) => void;
  onSetSeleccionados?: (ids: string[]) => void;
  onClose: () => void;
}) {
  const {
    titulo,
    descripcion,
    grupos,
    total,
    seleccionados,
    editable,
    soloMarcados,
    onToggle,
    onSetSeleccionados,
    onClose,
  } = props;
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const todosLosIds = grupos.flatMap((grupo) => grupo.items.map(([id]) => id));
  const todosSeleccionados = todosLosIds.length > 0 && todosLosIds.every((id) => seleccionados.includes(id));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div className="absolute inset-0 bg-black/70" />
      <div
        className="relative z-10 flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl border border-outline-variant bg-surface p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-outline-variant/50 pb-3">
          <div>
            <h3 className="font-headline-md text-on-surface">{titulo}</h3>
            <p className="text-sm text-on-surface-variant">{descripcion}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
            title="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-4 min-h-0 overflow-y-auto pr-1">
          <div className="grid gap-4 sm:grid-cols-2">
            {grupos.map((grupo) => {
              const visibles = soloMarcados
                ? grupo.items.filter(([id]) => seleccionados.includes(id))
                : grupo.items;
              if (visibles.length === 0) return null;
              return (
                <section
                  key={grupo.categoria}
                  className="min-h-0 rounded-lg border border-input bg-surface-container-lowest/40 p-3"
                >
                  <h4 className="mb-2 text-sm font-bold uppercase tracking-wide text-on-surface">
                    {grupo.categoria}
                    <span className="ml-2 font-medium normal-case text-on-surface-variant">
                      ({visibles.length})
                    </span>
                  </h4>
                  <div className="space-y-2">
                    {visibles.map(([id, descripcion]) =>
                      soloMarcados ? (
                        <div
                          key={id}
                          className="flex items-start gap-2 text-sm text-on-surface"
                        >
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                          <span>{descripcion}</span>
                        </div>
                      ) : (
                        <label
                          key={id}
                          className="flex cursor-pointer items-start gap-2 text-sm text-on-surface"
                        >
                          <input
                            type="checkbox"
                            checked={seleccionados.includes(id)}
                            disabled={!editable}
                            onChange={() => onToggle(id)}
                            className="mt-0.5 h-4 w-4 shrink-0"
                          />
                          <span>{descripcion}</span>
                        </label>
                      )
                    )}
                  </div>
                </section>
              );
            })}
          </div>
          {soloMarcados && seleccionados.length === 0 ? (
            <p className="py-6 text-center text-sm text-on-surface-variant">
              Sin elementos marcados.
            </p>
          ) : null}
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-outline-variant/50 pt-3 text-sm">
          <div className="flex items-center gap-3">
            <span className="text-on-surface-variant">Marcados: {seleccionados.length}/{total}</span>
            {editable && !soloMarcados && onSetSeleccionados ? (
              <button
                type="button"
                onClick={() => onSetSeleccionados(todosSeleccionados ? [] : todosLosIds)}
                className="font-label-md text-primary hover:underline"
              >
                {todosSeleccionados ? "Quitar todos" : "Seleccionar todo"}
              </button>
            ) : null}
          </div>
          <Button type="button" onClick={onClose} size="sm">Listo</Button>
        </div>
      </div>
    </div>
  );
}

function ArchivoAdjunto(props: {
  archivo: ArchivoAdjunto;
  onQuitar: () => void;
}) {
  const { archivo, onQuitar } = props;
  const esImagen = archivo.tipo.startsWith("image/");
  const esPdf =
    archivo.tipo === "application/pdf" || /\.pdf$/i.test(archivo.nombre);
  return (
    <li className="flex items-center gap-2 rounded-md border border-input bg-background px-2 py-1 text-xs">
      {esImagen ? (
        <img
          src={archivo.dataUrl}
          alt={archivo.nombre}
          className="h-9 w-9 shrink-0 rounded-md border border-outline-variant bg-muted object-cover"
        />
      ) : esPdf ? (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-destructive/10 text-[10px] font-bold text-destructive">
          PDF
        </span>
      ) : (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-surface-container">
          <FileText className="h-4 w-4 text-muted-foreground" />
        </span>
      )}
      <span className="min-w-0 flex-1 truncate font-medium">{archivo.nombre}</span>
      <button
        type="button"
        onClick={onQuitar}
        className="shrink-0 text-muted-foreground hover:text-destructive"
        title="Quitar archivo"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}

function Miniatura({ archivo }: { archivo: ArchivoAdjunto }) {
  if (archivo.tipo.startsWith("image/")) {
    return (
      <img
        src={archivo.dataUrl}
        alt={archivo.nombre}
        className="h-8 w-8 shrink-0 rounded border border-outline-variant object-cover"
      />
    );
  }
  if (
    archivo.tipo === "application/pdf" ||
    /\.pdf$/i.test(archivo.nombre)
  ) {
    return (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-border bg-destructive/10 text-[9px] font-bold text-destructive">
        PDF
      </span>
    );
  }
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-border bg-surface-container">
      <FileText className="h-3.5 w-3.5 text-muted-foreground" />
    </span>
  );
}

function VistaDocs(props: {
  titulo: string;
  archivos: ArchivoAdjunto[];
  onClose: () => void;
}) {
  const { titulo, archivos, onClose } = props;
  const [idx, setIdx] = useState(0);
  const archivo = archivos[idx];
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);
  const esImagen = archivo?.tipo.startsWith("image/") ?? false;
  const esPdf =
    archivo?.tipo === "application/pdf" ||
    /\.pdf$/i.test(archivo?.nombre ?? "");
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div className="absolute inset-0 bg-black/70" />
      <div
        className="relative z-10 flex max-h-[85vh] w-full max-w-3xl flex-col rounded-xl border border-outline-variant bg-surface p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-outline-variant/50 pb-3">
          <div className="min-w-0">
            <h3 className="truncate font-headline-md text-on-surface">
              {titulo}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
            title="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-3 min-h-0 flex-1 overflow-auto rounded-lg bg-muted/50">
          {esImagen ? (
            <img
              src={archivo!.dataUrl}
              alt={archivo!.nombre}
              className="mx-auto max-h-[60vh] max-w-full object-contain"
            />
          ) : esPdf ? (
            <iframe
              src={archivo!.dataUrl}
              title={archivo!.nombre}
              className="h-[60vh] w-full bg-white"
            />
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 p-8 text-muted-foreground">
              <FileText className="h-10 w-10" />
              <span className="text-sm">{archivo?.nombre}</span>
            </div>
          )}
        </div>
        {archivos.length > 1 ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {archivos.map((f, i) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setIdx(i)}
                className={
                  "rounded-md border p-0.5 transition-colors " +
                  (i === idx
                    ? "border-primary ring-2 ring-primary/40"
                    : "border-outline-variant hover:border-on-surface-variant")
                }
                title={f.nombre}
              >
                <Miniatura archivo={f} />
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function ContactosPage() {
  const [contactos, setContactos] = useState<ContactView[]>([]);
  const [form, setForm] = useState<ContactView>({
    id: "",
    nombre: "",
    apellido: "",
    tipoPersona: PersonType.NATURAL,
    dni: "",
    ruc: null,
    domicilio: "",
    nacionalidad: "",
    email: "",
    telefono: "",
    codigoPais: "51",
    copiaDni: [],
    copiaBoletas: [],
    copiaAntecedentes: [],
    contactoEmergencia: { ...EMERGENCIA_VACIO },
    mascotas: false,
    mascotasItems: [],
  });
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    titulo: string;
    archivos: ArchivoAdjunto[];
  } | null>(null);
  const [mascotasAbierta, setMascotasAbierta] = useState(false);
  const [mascotasVista, setMascotasVista] = useState<string[] | null>(null);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const formCardRef = useRef<HTMLDivElement | null>(null);
  const [sortKey, setSortKey] = useState<
    "nombre" | "tipo" | "dni" | "ruc" | "email" | "telefono" | "mascotas" | null
  >(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [busqueda, setBusqueda] = useState("");
  const [pdfEstado, setPdfEstado] = useState<
    "inactivo" | "leyendo" | "listo" | "error"
  >("inactivo");
  const [pdfMensaje, setPdfMensaje] = useState<string | null>(null);
  const pdfInputRef = useRef<HTMLInputElement | null>(null);

  async function autorellenarDesdePdf(archivo: File) {
    setPdfEstado("leyendo");
    setPdfMensaje(null);
    try {
      const body = new FormData();
      body.append("archivo", archivo);
      const res = await fetch("/api/pdf/extraer", { method: "POST", body });
      const json = (await res.json()) as {
        datos?: DatosExtraidos;
        error?: string;
      };
      if (!res.ok || !json.datos) {
        throw new Error(json.error ?? "No se pudo leer el PDF.");
      }
      const d = json.datos;
      setForm((prev) => {
        const sgte = { ...prev };
        if (d.nombre) sgte.nombre = d.nombre;
        if (d.apellido) sgte.apellido = d.apellido;
        if (d.ruc) {
          sgte.tipoPersona = PersonType.LEGAL;
          sgte.ruc = d.ruc;
        } else if (d.dni) {
          sgte.tipoPersona = PersonType.NATURAL;
          sgte.dni = d.dni;
          sgte.ruc = null;
        }
        if (d.email) sgte.email = d.email;
        if (d.telefono) sgte.telefono = normalizarTelefono(d.telefono);
        return sgte;
      });
      const campos = [
        d.nombre ? "Nombre" : null,
        d.apellido ? "Apellido" : null,
        d.dni ? "DNI" : null,
        d.ruc ? "RUC" : null,
        d.email ? "Email" : null,
        d.telefono ? "Teléfono" : null,
      ].filter(Boolean);
      setPdfEstado("listo");
      setPdfMensaje(
        campos.length > 0
          ? `Se rellenaron automáticamente: ${campos.join(", ")}. Revisa antes de guardar.`
          : "No se detectaron datos. Verifica que el PDF tenga las respuestas del formulario."
      );
    } catch (err) {
      setPdfEstado("error");
      setPdfMensaje(
        err instanceof Error ? err.message : "No se pudo leer el PDF."
      );
    }
  }

  const contactoOrdenados = (() => {
    let filas = filtrarFilas(contactos, busqueda, (c) => [
      c.nombre,
      c.apellido,
      c.dni,
      c.ruc,
      c.email,
      c.telefono,
      c.contactoEmergencia?.nombre,
      c.contactoEmergencia?.telefono,
    ]);
    const valoradores: Record<string, (c: ContactView) => string | number | null | undefined> = {
      nombre: (c) => [c.nombre, c.apellido].filter(Boolean).join(" "),
      tipo: (c) => c.tipoPersona,
      dni: (c) => c.dni,
      ruc: (c) => c.ruc,
      email: (c) => c.email,
      telefono: (c) => c.telefono,
      mascotas: (c) => (c.mascotas ?? false ? 1 : 0),
    };
    if (sortKey) {
      filas = ordenarColumna(filas, sortKey, sortDir, valoradores[sortKey]!);
    }
    return filas;
  })();

  function cambiarOrden(clave: "nombre" | "tipo" | "dni" | "ruc" | "email" | "telefono" | "mascotas") {
    if (sortKey === clave) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(clave);
      setSortDir("asc");
    }
  }

  useEffect(() => {
    void (async () => {
      await migrarDatosLocales();
      setContactos(await obtenerContactos());
    })();
  }, []);

  function validate(): string | null {
    if (!form.nombre.trim() || !form.apellido.trim()) {
      return "El nombre y apellido son obligatorios.";
    }
    if (!form.dni.trim()) {
      return "El DNI/CE es obligatorio.";
    }
    if (form.tipoPersona === PersonType.LEGAL && !form.ruc?.trim()) {
      return "El RUC es obligatorio para persona jurídica.";
    }
    if (
      form.email.trim() &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())
    ) {
      return "El email no es válido.";
    }
    if (form.telefono.trim() && normalizarTelefono(form.telefono, form.codigoPais).length < 7) {
      return "El teléfono no es válido.";
    }
    if ((form.copiaDni ?? []).length === 0) {
      return "Debes adjuntar la copia de DNI.";
    }
    if ((form.copiaBoletas ?? []).length === 0) {
      return "Debes adjuntar la copia de boletas.";
    }
    const telEmergencia = normalizarTelefono(form.contactoEmergencia?.telefono ?? "", form.codigoPais);
    if (telEmergencia && telEmergencia.length < 7) {
      return "El teléfono del contacto de emergencia no es válido.";
    }
    return null;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const problema = validate();
    if (problema) {
      setError(problema);
      return;
    }
    const conPrefijo = (t: string) =>
      `+${(form.codigoPais ?? "51").replace(/[^0-9]/g, "")} ${normalizarTelefono(t, form.codigoPais)}`.trim();
    const emergenciaForm = form.contactoEmergencia;
    const emergenciaLlena = Boolean(
      emergenciaForm &&
        (emergenciaForm.nombre.trim() ||
          emergenciaForm.parentesco.trim() ||
          emergenciaForm.telefono.trim())
    );
    const nuevo: ContactView = {
      ...form,
      id: form.id || `c-${Date.now()}`,
      telefono: form.telefono.trim() ? conPrefijo(form.telefono) : "",
      codigoPais: (form.codigoPais ?? "51").replace(/[^0-9]/g, ""),
      contactoEmergencia: emergenciaLlena && emergenciaForm
        ? {
            ...emergenciaForm,
            telefono: emergenciaForm.telefono.trim()
              ? conPrefijo(emergenciaForm.telefono)
              : "",
          }
        : null,
      mascotas: (form.mascotasItems ?? []).length > 0,
      mascotasItems: form.mascotasItems ?? [],
    };
    try {
      if (form.id) {
        const guardado = await actualizarContacto(nuevo);
        setContactos((prev) => [
          guardado,
          ...prev.filter((c) => c.id !== guardado.id),
        ]);
        setEditandoId(null);
      } else {
        const guardado = await crearContacto(nuevo);
        setContactos((prev) => [guardado, ...prev]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
      return;
    }
    setForm({
      id: "",
      nombre: "",
      apellido: "",
      tipoPersona: PersonType.NATURAL,
      dni: "",
      ruc: null,
      domicilio: "",
      nacionalidad: "",
      email: "",
      telefono: "",
      codigoPais: "51",
      copiaDni: [],
      copiaBoletas: [],
      copiaAntecedentes: [],
      contactoEmergencia: { ...EMERGENCIA_VACIO },
      mascotas: false,
    });
  }

  function agregarArchivos(
    campo: "copiaDni" | "copiaBoletas" | "copiaAntecedentes",
    files: FileList | null
  ) {
      if (!files || files.length === 0) {
        setError("No se seleccionaron archivos.");
        return;
      }
    const admitidos = Array.from(files).filter(esFormatoAdmitido);
    if (admitidos.length === 0) {
      setError("Solo se permiten archivos PDF, JPG o PNG.");
      return;
    }
    if (admitidos.length < files.length) {
      setError(
        "Algunos archivos se omitieron: solo se permiten PDF, JPG o PNG."
      );
    }
    const nuevos: ArchivoAdjunto[] = [];
    admitidos.forEach((f) => {
      const reader = new FileReader();
      reader.onload = () => {
        nuevos.push({
          id: `${campo}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          nombre: f.name,
          tipo: f.type,
          dataUrl: String(reader.result),
        });
        if (nuevos.length === admitidos.length) {
          setForm({ ...form, [campo]: [...(form[campo] ?? []), ...nuevos] });
        }
      };
      reader.readAsDataURL(f);
    });
  }

  function quitarArchivo(
    campo: "copiaDni" | "copiaBoletas" | "copiaAntecedentes",
    id: string
  ) {
      const updatedFiles = (form[campo] ?? []).filter((a) => a.id !== id);
      setForm({
        ...form,
        [campo]: updatedFiles,
      });
      if (updatedFiles.length === 0) {
        setError(`No hay archivos en ${campo}.`);
      }
  }

  function iniciarEdicion(c: ContactView) {
    setEditandoId(c.id);
    const prefijoGuardado = /^\+([0-9]+)/.exec(c.telefono ?? "")?.[1];
    const codigoPais = c.codigoPais ?? prefijoGuardado ?? "51";
    setForm({
      id: c.id,
      nombre: c.nombre,
      apellido: c.apellido,
      tipoPersona: c.tipoPersona,
      dni: c.dni,
      ruc: c.ruc ?? null,
      domicilio: c.domicilio ?? "",
      nacionalidad: c.nacionalidad ?? "",
      email: c.email,
      telefono: normalizarTelefono(c.telefono ?? "", codigoPais),
      codigoPais,
      copiaDni: c.copiaDni ?? [],
      copiaBoletas: c.copiaBoletas ?? [],
      copiaAntecedentes: c.copiaAntecedentes ?? [],
      contactoEmergencia: c.contactoEmergencia ?? { ...EMERGENCIA_VACIO },
      mascotas: c.mascotas ?? false,
      mascotasItems: c.mascotasItems ?? [],
    });
    setError(null);
    requestAnimationFrame(() => {
      formCardRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }

  function cancelarEdicion() {
    setEditandoId(null);
    setForm({
      id: "",
      nombre: "",
      apellido: "",
      tipoPersona: PersonType.NATURAL,
      dni: "",
      ruc: null,
      domicilio: "",
      nacionalidad: "",
      email: "",
      telefono: "",
      codigoPais: "51",
      copiaDni: [],
      copiaBoletas: [],
      copiaAntecedentes: [],
      contactoEmergencia: { ...EMERGENCIA_VACIO },
      mascotas: false,
      mascotasItems: [],
    });
  }

  async function cambiarCodigoPais(c: ContactView, codigoPais: string) {
    if (codigoPais === (c.codigoPais ?? "51")) return;
    try {
      const nuevaTelefono = formatearTelefono(c.telefono, codigoPais);
      const actualizado = await actualizarContacto({
        ...c,
        codigoPais,
        telefono: nuevaTelefono === "—" ? "" : nuevaTelefono,
      });
      setContactos((prev) =>
        prev.map((x) => (x.id === c.id ? actualizado : x))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar el país.");
    }
  }

  function alternarMascota(id: string) {
    const actuales = form.mascotasItems ?? [];
    const mascotasItems = actuales.includes(id)
      ? actuales.filter((item) => item !== id)
      : [...actuales, id];
    setForm({ ...form, mascotasItems, mascotas: mascotasItems.length > 0 });
  }

  return (
    <DashboardShell>
      <div className="space-y-6">
        <Card ref={formCardRef}>
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <CardTitle className="flex items-center gap-2">
                <Plus className="h-4 w-4" />
                {editandoId ? "Editar contacto" : "Nuevo contacto"}
              </CardTitle>
              {editandoId ? (
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={cancelarEdicion}
                  >
                    Cancelar
                  </Button>
                  <Button type="submit" form="form-nuevo-contacto" size="sm">
                    Guardar cambios
                  </Button>
                </div>
              ) : (
                <Button type="submit" form="form-nuevo-contacto" size="sm">
                  Crear contacto
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-input bg-surface-container-lowest/40 p-3">
              <div className="flex items-center gap-2 text-sm font-medium text-on-surface">
                <FileText className="h-4 w-4 text-primary" />
                Autorellenar desde Google Form (PDF)
              </div>
              <input
                ref={pdfInputRef}
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                onChange={(e) => {
                  const archivo = e.target.files?.[0];
                  if (archivo) void autorellenarDesdePdf(archivo);
                  e.target.value = "";
                }}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => pdfInputRef.current?.click()}
                disabled={pdfEstado === "leyendo"}
              >
                <Upload className="h-4 w-4" />
                {pdfEstado === "leyendo" ? "Leyendo PDF…" : "Subir PDF"}
              </Button>
              {pdfMensaje ? (
                <p
                  className={
                    "text-sm " +
                    (pdfEstado === "error"
                      ? "text-destructive"
                      : "text-on-surface-variant")
                  }
                >
                  {pdfEstado === "listo" ? (
                    <Check className="mr-1 inline h-4 w-4 text-emerald-600" />
                  ) : null}
                  {pdfMensaje}
                </p>
              ) : null}
            </div>
            <form
              id="form-nuevo-contacto"
              onSubmit={handleSubmit}
              className="grid gap-4"
            >
              <fieldset className="grid gap-4 rounded-lg border border-input bg-surface-container-lowest/40 p-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5">
                <Label>Nombre *</Label>
                <Input
                  value={form.nombre}
                  onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Apellido *</Label>
                <Input
                  value={form.apellido}
                  onChange={(e) => setForm({ ...form, apellido: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Tipo de persona</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.tipoPersona}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      tipoPersona: e.target.value as PersonType,
                    })
                  }
                >
                  <option value={PersonType.NATURAL}>Persona Natural</option>
                  <option value={PersonType.LEGAL}>Persona Jurídica</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>DNI/CE *</Label>
                <Input
                  value={form.dni}
                  onChange={(e) => setForm({ ...form, dni: e.target.value })}
                  placeholder="Ej: 41239875"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Domicilio</Label>
                <Input
                  value={form.domicilio ?? ""}
                  onChange={(e) => setForm({ ...form, domicilio: e.target.value })}
                  placeholder="Dirección del cliente"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Nacionalidad</Label>
                <Input
                  value={form.nacionalidad ?? ""}
                  onChange={(e) => setForm({ ...form, nacionalidad: e.target.value })}
                  placeholder="Peruana"
                />
              </div>
              <div className="space-y-1.5">
                <Label>
                  RUC
                  {form.tipoPersona === PersonType.LEGAL ? " *" : ""}
                </Label>
                <Input
                  value={form.ruc ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, ruc: e.target.value || null })
                  }
                  placeholder="11111111111"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Email (opcional)</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Teléfono (opcional)</Label>
                <TelefonoInput
                  value={normalizarTelefono(form.telefono, form.codigoPais)}
                  codigoPais={form.codigoPais ?? "51"}
                  onCodigoPaisChange={(codigoPais) => setForm({ ...form, codigoPais })}
                  onChange={(telefono) => setForm({ ...form, telefono })}
                />
              </div>
              </fieldset>
              <fieldset className="grid gap-4 rounded-lg border border-input bg-surface-container-lowest/40 p-4 sm:grid-cols-2 lg:grid-cols-2">
              <div className="flex min-h-10 items-center justify-between gap-3 rounded-md border border-input px-3 py-2">
                <div>
                  <Label>Mascotas</Label>
                  <p className="text-xs text-muted-foreground">
                    {(form.mascotasItems ?? []).length}/{MASCOTAS_TOTAL} marcadas
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setMascotasAbierta(true)}
                >
                  Ver mascotas
                </Button>
              </div>
              </fieldset>
              <fieldset className="grid gap-4 rounded-lg border border-input bg-surface-container-lowest/40 p-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Copia de DNI *</Label>
                <label className="flex h-10 cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-input px-3 text-sm text-muted-foreground hover:border-primary hover:text-primary">
                  <FileText className="h-4 w-4" /> Subir archivo
                  <input
                    type="file"
                    multiple
                    accept="application/pdf,.pdf,image/jpeg,.jpg,.jpeg,image/png,.png"
                    className="hidden"
                    onChange={(e) => {
                      agregarArchivos("copiaDni", e.target.files);
                      e.target.value = "";
                    }}
                  />
                </label>
                {form.copiaDni && form.copiaDni.length > 0 ? (
                  <ul className="space-y-1">
                    {form.copiaDni.map((a) => (
                      <ArchivoAdjunto
                        key={a.id}
                        archivo={a}
                        onQuitar={() => quitarArchivo("copiaDni", a.id)}
                      />
                    ))}
                  </ul>
                ) : null}
              </div>
              <div className="space-y-1.5">
                <Label>Copia de boletas *</Label>
                <label className="flex h-10 cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-input px-3 text-sm text-muted-foreground hover:border-primary hover:text-primary">
                  <FileText className="h-4 w-4" /> Subir archivo
                  <input
                    type="file"
                    multiple
                    accept="application/pdf,.pdf,image/jpeg,.jpg,.jpeg,image/png,.png"
                    className="hidden"
                    onChange={(e) => {
                      agregarArchivos("copiaBoletas", e.target.files);
                      e.target.value = "";
                    }}
                  />
                </label>
                {form.copiaBoletas && form.copiaBoletas.length > 0 ? (
                  <ul className="space-y-1">
                    {form.copiaBoletas.map((a) => (
                      <ArchivoAdjunto
                        key={a.id}
                        archivo={a}
                        onQuitar={() => quitarArchivo("copiaBoletas", a.id)}
                      />
                    ))}
                  </ul>
                ) : null}
              </div>
              <div className="space-y-1.5">
                <Label>Copia de antecedentes penales (opcional)</Label>
                <label className="flex h-10 cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-input px-3 text-sm text-muted-foreground hover:border-primary hover:text-primary">
                  <FileText className="h-4 w-4" /> Subir archivo
                  <input
                    type="file"
                    multiple
                    accept="application/pdf,.pdf,image/jpeg,.jpg,.jpeg,image/png,.png"
                    className="hidden"
                    onChange={(e) => {
                      agregarArchivos("copiaAntecedentes", e.target.files);
                      e.target.value = "";
                    }}
                  />
                </label>
                {form.copiaAntecedentes && form.copiaAntecedentes.length > 0 ? (
                  <ul className="space-y-1">
                    {form.copiaAntecedentes.map((a) => (
                      <ArchivoAdjunto
                        key={a.id}
                        archivo={a}
                        onQuitar={() => quitarArchivo("copiaAntecedentes", a.id)}
                      />
                    ))}
                  </ul>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-3">
                Solo se permiten archivos PDF, JPG o PNG
              </p>
              </fieldset>
              <fieldset className="grid gap-4 rounded-lg border border-input bg-surface-container-lowest/40 p-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="sm:col-span-2 lg:col-span-3">
                  <Label className="text-sm font-semibold">
                    Contacto de emergencia (opcional)
                  </Label>
                </div>
                <div className="space-y-1.5">
                  <Label>Nombre</Label>
                  <Input
                    value={form.contactoEmergencia?.nombre ?? ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        contactoEmergencia: {
                          ...(form.contactoEmergencia ?? EMERGENCIA_VACIO),
                          nombre: e.target.value,
                        },
                      })
                    }
                    placeholder="Ej: María Gómez"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Parentesco</Label>
                  <Input
                    value={form.contactoEmergencia?.parentesco ?? ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        contactoEmergencia: {
                          ...(form.contactoEmergencia ?? EMERGENCIA_VACIO),
                          parentesco: e.target.value,
                        },
                      })
                    }
                    placeholder="Ej: madre, cónyuge, hermana"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Teléfono</Label>
                  <TelefonoInput
                    value={normalizarTelefono(
                      form.contactoEmergencia?.telefono ?? "",
                      form.codigoPais
                    )}
                    codigoPais={form.codigoPais ?? "51"}
                    onCodigoPaisChange={(codigoPais) => setForm({ ...form, codigoPais })}
                    onChange={(telefono) =>
                      setForm({
                        ...form,
                        contactoEmergencia: {
                          ...(form.contactoEmergencia ?? EMERGENCIA_VACIO),
                          telefono,
                        },
                      })
                    }
                  />
                </div>
              </fieldset>
              <div className="flex items-end">
                <div className="w-full">
                  {error ? (
                    <p className="text-sm text-destructive">{error}</p>
                  ) : null}
                </div>
              </div>
            </form>
            <p className="mt-3 text-xs text-muted-foreground">
              <span className="text-destructive">*</span> Los campos marcados
              son obligatorios.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <CardTitle>Contactos ({contactoOrdenados.length}/{contactos.length})</CardTitle>
              <BusquedaInput value={busqueda} onChange={setBusqueda} placeholder="Buscar contacto…" className="w-72" />
            </div>
          </CardHeader>
          <CardContent>
            {contactos.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Aún no hay contactos registrados.
              </p>
            ) : (
              <TableScroll className="w-full rounded-md border" contentClassName="max-h-[30rem]">
                <table className="w-full min-w-[2060px] table-fixed text-sm">
                  <colgroup>
                    <col style={{ width: "220px" }} />
                    <col style={{ width: "100px" }} />
                    <col style={{ width: "110px" }} />
                    <col style={{ width: "130px" }} />
                    <col style={{ width: "280px" }} />
                    <col style={{ width: "150px" }} />
                    <col style={{ width: "110px" }} />
                    <col style={{ width: "120px" }} />
                    <col style={{ width: "120px" }} />
                    <col style={{ width: "120px" }} />
                    <col style={{ width: "180px" }} />
                    <col style={{ width: "150px" }} />
                    <col style={{ width: "140px" }} />
                    <col style={{ width: "100px" }} />
                  </colgroup>
                  <thead className="sticky top-0 z-10 bg-muted text-left text-xs text-muted-foreground">
                    <tr>
                      <th
                        onClick={() => cambiarOrden("nombre")}
                        className={"cursor-pointer select-none px-3 py-2 font-medium transition-colors hover:bg-muted-foreground/10 " + (sortKey === "nombre" ? "font-semibold" : "")}
                        title="Ordenar por nombre"
                      >
                        Nombre{sortKey === "nombre" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                      </th>
                      <th
                        onClick={() => cambiarOrden("tipo")}
                        className={"cursor-pointer select-none px-3 py-2 font-medium transition-colors hover:bg-muted-foreground/10 " + (sortKey === "tipo" ? "font-semibold" : "")}
                        title="Ordenar por tipo"
                      >
                        Tipo{sortKey === "tipo" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                      </th>
                      <th
                        onClick={() => cambiarOrden("dni")}
                        className={"w-[110px] cursor-pointer select-none px-3 py-2 font-medium transition-colors hover:bg-muted-foreground/10 " + (sortKey === "dni" ? "font-semibold" : "")}
                        title="Ordenar por DNI/CE"
                      >
                        DNI/CE{sortKey === "dni" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                      </th>
                      <th
                        onClick={() => cambiarOrden("ruc")}
                        className={"w-[130px] cursor-pointer select-none px-3 py-2 font-medium transition-colors hover:bg-muted-foreground/10 " + (sortKey === "ruc" ? "font-semibold" : "")}
                        title="Ordenar por RUC"
                      >
                        RUC{sortKey === "ruc" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                      </th>
                      <th
                        onClick={() => cambiarOrden("email")}
                        className={"w-[280px] cursor-pointer select-none px-3 py-2 font-medium transition-colors hover:bg-muted-foreground/10 " + (sortKey === "email" ? "font-semibold" : "")}
                        title="Ordenar por email"
                      >
                        Email{sortKey === "email" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                      </th>
                      <th
                        onClick={() => cambiarOrden("telefono")}
                        className={"w-[150px] cursor-pointer select-none px-3 py-2 font-medium transition-colors hover:bg-muted-foreground/10 " + (sortKey === "telefono" ? "font-semibold" : "")}
                        title="Ordenar por teléfono"
                      >
                        Teléfono{sortKey === "telefono" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                      </th>
                      <th className="w-[110px] px-3 py-2 font-medium">País</th>
                      <th className="px-3 py-2 font-medium">C. DNI</th>
                      <th className="px-3 py-2 font-medium">C. Boletas</th>
                      <th className="px-3 py-2 font-medium">C. Antec. Penales</th>
                      <th className="w-[180px] px-3 py-2 font-medium">Contacto emergencia</th>
                      <th className="w-[150px] px-3 py-2 font-medium">Tel. emergencia</th>
                      <th
                        onClick={() => cambiarOrden("mascotas")}
                        className={"cursor-pointer select-none px-3 py-2 font-medium transition-colors hover:bg-muted-foreground/10 " + (sortKey === "mascotas" ? "font-semibold" : "")}
                        title="Ordenar por mascotas"
                      >
                        Mascotas{sortKey === "mascotas" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                      </th>
                      <th className="px-3 py-2 font-medium">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contactoOrdenados.map((c) => (
                      <tr key={c.id} className="border-t">
                        <td className="max-w-[220px] break-words px-3 py-2 font-medium">
                          {[c.nombre, c.apellido].filter(Boolean).join(" ")}
                        </td>
                        <td className="w-[100px] max-w-[100px] overflow-hidden px-3 py-2 text-ellipsis whitespace-nowrap">
                          {c.tipoPersona === PersonType.NATURAL
                            ? "Natural"
                            : "Jurídica"}
                        </td>
                        <td className="w-[110px] max-w-[110px] overflow-hidden px-3 py-2 text-ellipsis whitespace-nowrap" title={c.dni}>
                          {c.dni ?? "—"}
                        </td>
                        <td
                          className="w-[130px] max-w-[130px] overflow-hidden px-3 py-2 text-ellipsis whitespace-nowrap text-muted-foreground"
                          title={c.ruc ?? undefined}
                        >
                          {c.ruc ?? "—"}
                        </td>
                        <td
                          className="w-[280px] max-w-[280px] overflow-hidden px-3 py-2 text-ellipsis whitespace-nowrap text-muted-foreground"
                          title={c.email}
                        >
                          {c.email}
                        </td>
                        <td className="w-[150px] max-w-[150px] overflow-hidden px-3 py-2 text-ellipsis whitespace-nowrap text-muted-foreground">
                          {formatearTelefono(c.telefono, c.codigoPais ?? "51")}
                        </td>
                        <td className="w-[110px] px-3 py-2">
                          <select
                            value={c.codigoPais ?? "51"}
                            onChange={(e) => void cambiarCodigoPais(c, e.target.value)}
                            className="h-8 w-full rounded-md border border-input bg-background px-1 text-xs text-foreground"
                            title="Código de país del teléfono"
                          >
                            {PAISES_CODIGO.map(({ codigo }) => (
                              <option key={codigo} value={codigo}>
                                +{codigo}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          {(() => {
                            const docs = c.copiaDni ?? [];
                            return docs.length > 0 ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setPreview({
                                    titulo: `${[
                                      c.nombre,
                                      c.apellido,
                                    ].filter(Boolean).join(" ")} · Copia de DNI`,
                                    archivos: docs,
                                  })
                                }
                                className="flex items-center gap-1.5 rounded-md border border-outline-variant bg-surface-container-lowest px-1.5 py-1 transition-colors hover:bg-surface-container"
                                title="Ver documentos"
                              >
                                <Miniatura archivo={docs[0]!} />
                                <span className="text-xs font-medium text-on-surface-variant">
                                  {docs.length}
                                </span>
                              </button>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            );
                          })()}
                        </td>
                        <td className="px-3 py-2">
                          {(() => {
                            const docs = c.copiaBoletas ?? [];
                            return docs.length > 0 ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setPreview({
                                    titulo: `${[
                                      c.nombre,
                                      c.apellido,
                                    ].filter(Boolean).join(" ")} · Copia de boletas`,
                                    archivos: docs,
                                  })
                                }
                                className="flex items-center gap-1.5 rounded-md border border-outline-variant bg-surface-container-lowest px-1.5 py-1 transition-colors hover:bg-surface-container"
                                title="Ver documentos"
                              >
                                <Miniatura archivo={docs[0]!} />
                                <span className="text-xs font-medium text-on-surface-variant">
                                  {docs.length}
                                </span>
                              </button>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            );
                          })()}
                        </td>
                        <td className="px-3 py-2">
                          {(() => {
                            const docs = c.copiaAntecedentes ?? [];
                            return docs.length > 0 ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setPreview({
                                    titulo: `${[
                                      c.nombre,
                                      c.apellido,
                                    ].filter(Boolean).join(" ")} · Copia de antecedentes penales`,
                                    archivos: docs,
                                  })
                                }
                                className="flex items-center gap-1.5 rounded-md border border-outline-variant bg-surface-container-lowest px-1.5 py-1 transition-colors hover:bg-surface-container"
                                title="Ver documentos"
                              >
                                <Miniatura archivo={docs[0]!} />
                                <span className="text-xs font-medium text-on-surface-variant">
                                  {docs.length}
                                </span>
                              </button>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            );
                          })()}
                        </td>
                        <td
                          className="w-[180px] max-w-[180px] overflow-hidden px-3 py-2 text-ellipsis whitespace-nowrap"
                          title={c.contactoEmergencia ? `${c.contactoEmergencia.nombre} (${c.contactoEmergencia.parentesco})` : undefined}
                        >
                          {c.contactoEmergencia ? (
                            <span className="font-medium text-on-surface">
                              {c.contactoEmergencia.nombre} (
                              {c.contactoEmergencia.parentesco || "—"})
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="w-[150px] max-w-[150px] overflow-hidden px-3 py-2 text-ellipsis whitespace-nowrap text-muted-foreground">
                          {formatearTelefono(c.contactoEmergencia?.telefono, c.codigoPais ?? "51")}
                        </td>
                        <td className="px-3 py-2">
                          {(c.mascotasItems ?? []).length > 0 ? (
                            <button
                              type="button"
                              onClick={() =>
                                setMascotasVista(c.mascotasItems ?? [])
                              }
                              className="rounded-md border border-outline-variant bg-surface-container-lowest px-2 py-1 text-xs font-medium text-primary hover:bg-surface-container"
                              title="Ver mascotas"
                            >
                              Ver mascotas ({(c.mascotasItems ?? []).length}/
                              {MASCOTAS_TOTAL})
                            </button>
                          ) : c.mascotas ? (
                            <span className="font-medium text-emerald-600">Sí</span>
                          ) : (
                            <span className="text-muted-foreground">No</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => iniciarEdicion(c)}
                          >
                            Editar
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScroll>
            )}
          </CardContent>
        </Card>
      </div>
      {preview ? (
        <VistaDocs
          titulo={preview.titulo}
          archivos={preview.archivos}
          onClose={() => setPreview(null)}
        />
      ) : null}
      {mascotasAbierta ? (
        <ChecklistModal
          titulo="Mascotas"
          descripcion="Marca las mascotas que tiene la persona."
          grupos={MASCOTAS}
          total={MASCOTAS_TOTAL}
          seleccionados={form.mascotasItems ?? []}
          editable
          onToggle={alternarMascota}
          onClose={() => setMascotasAbierta(false)}
        />
      ) : null}
      {mascotasVista ? (
        <ChecklistModal
          titulo="Mascotas"
          descripcion="Mascotas registradas del contacto."
          grupos={MASCOTAS}
          total={MASCOTAS_TOTAL}
          seleccionados={mascotasVista}
          editable={false}
          soloMarcados
          onToggle={() => undefined}
          onClose={() => setMascotasVista(null)}
        />
      ) : null}
    </DashboardShell>
  );
}
