"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Download,
  FileStack,
  ListChecks,
  Mic,
  Pencil,
  Plus,
  Save,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  XCircle,
} from "lucide-react";

type InspeccionItem = {
  categoria?: string;
  texto: string;
  resultado: "OK" | "NEGATIVO" | "";
  motivo?: string;
};
type Inspeccion = {
  id: string;
  nombre: string;
  numero: string;
  personaInspecciona: string;
  inspectorNombre: string;
  departamentoId: string | null;
  departamentoNombre: string;
  asignadoA: string;
  fecha: string | null;
  estado: string;
  items: InspeccionItem[];
};
type GrupoPreguntas = { categoria: string; preguntas: string[] };
type Plantilla = { id: string; nombre: string; categorias: GrupoPreguntas[] };
type Departamento = { id: string; codigo: string; nombre: string; numero: string };
type Filtro = "borrador" | "completado" | "plantillas";

type SpeechAlternative = { transcript: string };
type SpeechResult = { isFinal: boolean; 0: SpeechAlternative };
type SpeechResultList = { length: number; [i: number]: SpeechResult };
type SpeechEvent = { resultIndex: number; results: SpeechResultList };
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

function fechaLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fmtFecha(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("es-PE", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function getSpeechCtor(): (new () => SpeechRecognitionLike) | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function sanitizeName(value: string): string {
  return value.trim().replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ");
}

function agruparPorCategoria(items: InspeccionItem[]): GrupoPreguntas[] {
  const grupos: GrupoPreguntas[] = [];
  for (const item of items) {
    const cat = (item.categoria ?? "").trim() || "General";
    let grupo = grupos.find((g) => g.categoria === cat);
    if (!grupo) {
      grupo = { categoria: cat, preguntas: [] };
      grupos.push(grupo);
    }
    grupo.preguntas.push(item.texto);
  }
  return grupos;
}

export default function InspeccionesPage() {
  const { user } = useAuth();
  const [vista, setVista] = useState<"lista" | "crear">("lista");
  const [filtro, setFiltro] = useState<Filtro>("borrador");
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [tipoMensaje, setTipoMensaje] = useState<"ok" | "error">("ok");
  const [busy, setBusy] = useState(false);

  const [departamentos, setDepartamentos] = useState<Departamento[]>([]);
  const [inspecciones, setInspecciones] = useState<Inspeccion[]>([]);
  const [plantillas, setPlantillas] = useState<Plantilla[]>([]);
  const [expandida, setExpandida] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, InspeccionItem[]>>({});
  const [plantillaExpandida, setPlantillaExpandida] = useState<string | null>(null);

  // Formulario crear/editar checklist
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [plantillaBaseId, setPlantillaBaseId] = useState("");
  const [nombre, setNombre] = useState("");
  const [numero, setNumero] = useState("");
  const [departamentoId, setDepartamentoId] = useState("");
  const [persona, setPersona] = useState("");
  const [fecha, setFecha] = useState(() => fechaLocalInput(new Date()));
  const [asignadoA, setAsignadoA] = useState("");
  const [grupos, setGrupos] = useState<GrupoPreguntas[]>([]);
  const [nuevaCategoria, setNuevaCategoria] = useState("");
  const [preguntaTexto, setPreguntaTexto] = useState<Record<string, string>>({});

  // Agregar pregunta dentro del checklist desplegado
  const [addCat, setAddCat] = useState("");
  const [addTexto, setAddTexto] = useState("");
  const [addTarget, setAddTarget] = useState<string | null>(null);

  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const [recitando, setRecitando] = useState<string | null>(null);

  const notify = useCallback((texto: string, ok = true) => {
    setMensaje(texto);
    setTipoMensaje(ok ? "ok" : "error");
  }, []);

  const cargar = useCallback(async () => {
    const [resIns, resPla] = await Promise.all([
      apiFetch("/api/inspecciones"),
      apiFetch("/api/inspecciones/plantillas"),
    ]);
    if (resIns.ok) setInspecciones((await resIns.json()) as Inspeccion[]);
    if (resPla.ok) setPlantillas((await resPla.json()) as Plantilla[]);
  }, []);

  useEffect(() => {
    void apiFetch("/api/departamentos")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => setDepartamentos(Array.isArray(rows) ? rows : []))
      .catch(() => undefined);
    void cargar();
    return () => recRef.current?.abort();
  }, [cargar]);

  useEffect(() => {
    if (!editandoId && (user?.name || user?.email))
      setPersona((prev) => prev || user?.name || user?.email || "");
  }, [user, editandoId]);

  const itemsDe = (ins: Inspeccion): InspeccionItem[] => edits[ins.id] ?? ins.items;

  function setItems(id: string, next: InspeccionItem[]) {
    setEdits((prev) => ({ ...prev, [id]: next }));
  }

  // ---------- CREAR / EDITAR CHECKLIST ----------

  function abrirCrear(desPlantilla?: Plantilla) {
    setEditandoId(null);
    setPlantillaBaseId(desPlantilla?.id ?? "");
    setNombre(desPlantilla?.nombre ?? "");
    setNumero("");
    setDepartamentoId("");
    setPersona(user?.name || user?.email || "");
    setFecha(fechaLocalInput(new Date()));
    setAsignadoA("");
    setGrupos(desPlantilla ? desPlantilla.categorias.map((g) => ({ ...g, preguntas: [...g.preguntas] })) : []);
    setNuevaCategoria("");
    setPreguntaTexto({});
    setVista("crear");
    setMensaje(null);
  }

  function onElegirPlantilla(id: string) {
    setPlantillaBaseId(id);
    const tpl = plantillas.find((p) => p.id === id);
    if (!tpl) return;
    setGrupos(tpl.categorias.map((g) => ({ ...g, preguntas: [...g.preguntas] })));
    setNombre((prev) => prev || tpl.nombre);
  }

  function abrirCompletarRapido(pl: Plantilla) {
    if (plantillaExpandida === pl.id) {
      setPlantillaExpandida(null);
      return;
    }
    setEditandoId(null);
    setPlantillaBaseId(pl.id);
    setNombre(`${pl.nombre} — ${new Date().toLocaleDateString("es-PE")}`);
    setNumero("");
    setDepartamentoId("");
    setPersona(user?.name || user?.email || "");
    setFecha(fechaLocalInput(new Date()));
    setAsignadoA("");
    setGrupos(pl.categorias.map((g) => ({ ...g, preguntas: [...g.preguntas] })));
    setPreguntaTexto({});
    setPlantillaExpandida(pl.id);
    setMensaje(null);
  }

  function abrirEditarDatos(ins: Inspeccion) {
    setEditandoId(ins.id);
    setPlantillaBaseId("");
    setNombre(ins.nombre);
    setNumero(ins.numero);
    setDepartamentoId(ins.departamentoId ?? "");
    setPersona(ins.personaInspecciona);
    setFecha(ins.fecha ? fechaLocalInput(new Date(ins.fecha)) : fechaLocalInput(new Date()));
    setAsignadoA(ins.asignadoA);
    setGrupos(agruparPorCategoria(ins.items));
    setNuevaCategoria("");
    setPreguntaTexto({});
    setVista("crear");
    setMensaje(null);
  }

  function onDepartamentoChange(id: string) {
    setDepartamentoId(id);
    const d = departamentos.find((x) => x.id === id);
    if (d) {
      setNumero(d.numero || d.codigo || "");
      if (!editandoId) setNombre((prev) => prev || d.numero || d.codigo || "");
    }
  }

  function gruposConPregunta(categoria: string, texto: string): GrupoPreguntas[] {
    const cat = categoria.trim() || "General";
    const idx = grupos.findIndex((g) => g.categoria.toLowerCase() === cat.toLowerCase());
    if (idx >= 0) {
      const next = [...grupos];
      const g = next[idx];
      if (!g) return grupos;
      next[idx] = { ...g, preguntas: [...g.preguntas, texto] };
      return next;
    }
    return [...grupos, { categoria: cat, preguntas: [texto] }];
  }

  function agregarPreguntaAGrupo(categoria: string) {
    const texto = (preguntaTexto[categoria] ?? "").trim();
    if (!texto) return;
    setGrupos(gruposConPregunta(categoria, texto));
    setPreguntaTexto((prev) => ({ ...prev, [categoria]: "" }));
  }

  function crearCategoria() {
    const cat = nuevaCategoria.trim();
    if (!cat) return;
    if (grupos.some((g) => g.categoria.toLowerCase() === cat.toLowerCase())) {
      setNuevaCategoria("");
      return;
    }
    setGrupos((prev) => [...prev, { categoria: cat, preguntas: [] }]);
    setNuevaCategoria("");
  }

  function eliminarGrupo(categoria: string) {
    setGrupos((prev) => prev.filter((g) => g.categoria !== categoria));
  }

  function eliminarPregunta(categoria: string, idx: number) {
    setGrupos((prev) =>
      prev.map((g) => (g.categoria === categoria ? { ...g, preguntas: g.preguntas.filter((_, j) => j !== idx) } : g))
    );
  }

  function itemsDesdeGrupos(): InspeccionItem[] {
    return grupos.flatMap((g) =>
      g.preguntas.map((texto) => ({ categoria: g.categoria, texto, resultado: "" as const, motivo: "" }))
    );
  }

  async function guardar(conPlantilla = true) {
    const departamento = departamentos.find((d) => d.id === departamentoId);
    if (!nombre.trim()) return notify("Poné un nombre al checklist (ej: Revisión de casa)", false);
    if (!persona.trim()) return notify("Indicá la persona que inspecciona", false);
    if (!departamento) return notify("Seleccioná el departamento", false);
    const items = itemsDesdeGrupos();
    if (items.length === 0) return notify("Agregá al menos una pregunta (opcionalmente agrupala en una categoría)", false);
    setBusy(true);
    try {
      const prev = editandoId ? inspecciones.find((i) => i.id === editandoId) : undefined;
      const itemsConRespuesta: InspeccionItem[] = items.map((nuevo) => {
        const previa = prev?.items.find((i) => i.texto === nuevo.texto);
        return { ...nuevo, resultado: previa?.resultado ?? "", motivo: previa?.motivo ?? "" };
      });
      const payload = {
        nombre: sanitizeName(nombre),
        numero,
        departamentoId: departamento.id,
        departamentoNombre: `${departamento.codigo} · ${departamento.nombre}`,
        personaInspecciona: persona.trim(),
        fecha: new Date(fecha).toISOString(),
        asignadoA,
        items: itemsConRespuesta,
      };
      const res = await apiFetch("/api/inspecciones", {
        method: editandoId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          editandoId ? { id: editandoId, estado: "BORRADOR", ...payload } : payload
        ),
      });
      const saved = (await res.json()) as Inspeccion & { error?: string };
      if (!res.ok) throw new Error(saved.error ?? "No se pudo guardar");
      if (conPlantilla) {
        try {
          // Guarda las preguntas (sin respuestas) como plantilla reutilizable.
          await sincronizarPlantilla(saved.nombre, items);
        } catch (errorPlantilla) {
          // No se pierde el guardado del checklist si la plantilla falla.
          void errorPlantilla;
        }
      }
      await cargar();
      setVista("lista");
      setFiltro("borrador");
      setPlantillaExpandida(null);
      setExpandida(saved.id);
      notify(
        editandoId
          ? "Checklist actualizado" + (conPlantilla ? " y plantilla guardada." : ".")
          : `Checklist "${saved.nombre}" guardado${conPlantilla ? " y guardado como plantilla." : ". Desplegalo para responder."}`
      );
    } catch (error) {
      notify((error as Error).message, false);
    } finally {
      setBusy(false);
    }
  }

  async function sincronizarPlantilla(nombreChecklist: string, items: InspeccionItem[]) {
    const categorias = agruparPorCategoria(items).filter((g) => g.preguntas.length > 0);
    if (!nombreChecklist || categorias.length === 0) return;
    const existente = plantillas.find((p) => p.nombre.toLowerCase() === nombreChecklist.toLowerCase());
    const res = await apiFetch("/api/inspecciones/plantillas", {
      method: existente ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        existente
          ? { id: existente.id, nombre: nombreChecklist, categorias }
          : { nombre: nombreChecklist, categorias }
      ),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error((body as { error?: string }).error ?? "No se pudo guardar la plantilla");
    }
  }

  // ---------- RESPONDER (LISTA DESPLEGABLE) ----------

  function toggleItem(ins: Inspeccion, idx: number, resultado: "OK" | "NEGATIVO") {
    const items = [...itemsDe(ins)];
    const actual = items[idx];
    if (!actual) return;
    if (actual.resultado === resultado) {
      items[idx] = { ...actual, resultado: "", motivo: "" };
    } else {
      items[idx] = {
        ...actual,
        resultado,
        motivo: resultado === "NEGATIVO" ? (actual.motivo ?? "") : "",
      };
    }
    setItems(ins.id, items);
  }

  function setMotivo(ins: Inspeccion, idx: number, motivo: string) {
    const items = [...itemsDe(ins)];
    const actual = items[idx];
    if (!actual) return;
    items[idx] = { ...actual, resultado: actual.resultado || "NEGATIVO", motivo };
    setItems(ins.id, items);
  }

  function toggleMic(ins: Inspeccion, idx: number) {
    const target = `${ins.id}:${idx}`;
    if (recitando === target) {
      recRef.current?.stop();
      setRecitando(null);
      return;
    }
    if (recitando) return;
    const Ctor = getSpeechCtor();
    if (!Ctor) {
      notify("Tu navegador no soporta dictado por voz. Usa Chrome o Edge.", false);
      return;
    }
    const rec = new Ctor();
    rec.lang = "es-PE";
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (event) => {
      let texto = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result?.isFinal) texto += (result[0]?.transcript ?? "") + " ";
      }
      if (!texto) return;
      setEdits((prev) => {
        const items = [...(prev[ins.id] ?? ins.items)];
        const actual = items[idx];
        if (!actual) return prev;
        items[idx] = {
          ...actual,
          resultado: actual.resultado || "NEGATIVO",
          motivo: (actual.motivo ?? "") + texto,
        };
        return { ...prev, [ins.id]: items };
      });
    };
    rec.onend = () => setRecitando(null);
    rec.onerror = () => setRecitando(null);
    rec.start();
    recRef.current = rec;
    setRecitando(target);
  }

  async function descargarPdf(ins: Inspeccion) {
    const res = await apiFetch("/api/inspecciones/pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: ins.id }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error((body as { error?: string }).error ?? "No se pudo generar el PDF");
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${sanitizeName(ins.numero || ins.nombre) || "inspeccion"}.pdf`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  async function guardarLista(ins: Inspeccion, completar: boolean) {
    const items = itemsDe(ins);
    if (completar) {
      if (items.some((i) => !i.resultado)) {
        return notify("Respondé todas las preguntas antes de finalizar", false);
      }
      if (items.some((i) => i.resultado === "NEGATIVO" && !i.motivo?.trim())) {
        return notify("Cada revisión negativa necesita la descripción del problema", false);
      }
    }
    setBusy(true);
    try {
      const res = await apiFetch("/api/inspecciones", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: ins.id,
          nombre: ins.nombre,
          numero: ins.numero,
          items,
          estado: completar ? "COMPLETADO" : "BORRADOR",
        }),
      });
      const saved = (await res.json()) as Inspeccion & { error?: string };
      if (!res.ok) throw new Error(saved.error ?? "No se pudo guardar");
      setEdits((prev) => {
        const next = { ...prev };
        delete next[ins.id];
        return next;
      });
      await cargar();
      if (completar) {
        await descargarPdf(saved);
        setFiltro("completado");
        notify("Checklist finalizado. PDF con las observaciones descargado.");
      } else {
        notify("Cambios guardados.");
      }
    } catch (error) {
      notify((error as Error).message, false);
    } finally {
      setBusy(false);
    }
  }

  async function accion(ins: Inspeccion, tipo: "eliminar" | "reabrir" | "pdf") {
    setBusy(true);
    try {
      if (tipo === "pdf") {
        await descargarPdf(ins);
        notify("PDF descargado");
      } else if (tipo === "eliminar") {
        const res = await apiFetch(`/api/inspecciones?id=${ins.id}`, { method: "DELETE" });
        if (!res.ok) throw new Error("No se pudo eliminar");
        await cargar();
        notify("Checklist eliminado");
      } else {
        const res = await apiFetch("/api/inspecciones", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: ins.id,
            nombre: ins.nombre,
            numero: ins.numero,
            items: ins.items,
            estado: "BORRADOR",
          }),
        });
        if (!res.ok) throw new Error("No se pudo reabrir");
        await cargar();
        setFiltro("borrador");
        notify("Reabierto. Al finalizar otra vez se regenera el PDF.");
      }
    } catch (error) {
      notify((error as Error).message, false);
    } finally {
      setBusy(false);
    }
  }

  async function eliminarPlantilla(pl: Plantilla) {
    const res = await apiFetch(`/api/inspecciones/plantillas?id=${pl.id}`, { method: "DELETE" });
    if (res.ok) {
      await cargar();
      notify("Plantilla eliminada");
    }
  }

  const listaFiltrada =
    filtro === "plantillas"
      ? []
      : inspecciones.filter((i) =>
          filtro === "completado" ? i.estado === "COMPLETADO" : i.estado !== "COMPLETADO"
        );

  function renderFilaPregunta(ins: Inspeccion, item: InspeccionItem, idx: number, numeroVisible: number) {
    const negativo = item.resultado === "NEGATIVO";
    const conforme = item.resultado === "OK";
    return (
      <div key={`${ins.id}-${idx}`} className="rounded-lg border border-outline-variant p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium text-on-surface">
            {numeroVisible}. {item.texto}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              title="Quitar respuesta"
              onClick={() =>
                setItems(ins.id, itemsDe(ins).map((x, j) => (j === idx ? { ...x, resultado: "", motivo: "" } : x)))
              }
              className={`rounded border px-2 py-1 text-xs ${item.resultado === "" ? "border-primary text-primary" : "border-outline-variant text-on-surface-variant"}`}
            >
              —
            </button>
            <button
              type="button"
              onClick={() => toggleItem(ins, idx, "OK")}
              className={`inline-flex items-center gap-1 rounded border px-3 py-1.5 text-sm ${conforme ? "border-emerald-600 bg-emerald-600 text-white" : "border-outline-variant text-on-surface-variant hover:border-emerald-600"}`}
            >
              <ThumbsUp className="h-4 w-4" />Conforme
            </button>
            <button
              type="button"
              onClick={() => toggleItem(ins, idx, "NEGATIVO")}
              className={`inline-flex items-center gap-1 rounded border px-3 py-1.5 text-sm ${negativo ? "border-destructive bg-destructive text-white" : "border-outline-variant text-on-surface-variant hover:border-destructive"}`}
            >
              <ThumbsDown className="h-4 w-4" />No conforme
            </button>
            {ins.estado !== "COMPLETADO" && item.resultado === "" ? (
              <button
                type="button"
                title="Quitar pregunta sin responder"
                onClick={() => setItems(ins.id, itemsDe(ins).filter((_, j) => j !== idx))}
                className="rounded border border-outline-variant px-2 py-1 text-destructive hover:bg-surface-container"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </div>
        {negativo ? (
          <div className="mt-3">
            <label className="mb-1 block text-xs font-medium text-on-surface-variant">
              Descripción del problema (escribí o dictá)
            </label>
            <div className="flex gap-2">
              <textarea
                value={item.motivo ?? ""}
                onChange={(e) => setMotivo(ins, idx, e.target.value)}
                rows={2}
                placeholder="Detallá el problema…"
                className="w-full rounded border border-outline-variant bg-transparent p-2 text-sm"
              />
              <button
                type="button"
                onClick={() => toggleMic(ins, idx)}
                title="Dictar por voz"
                className={`h-10 w-10 shrink-0 rounded border ${recitando === `${ins.id}:${idx}` ? "animate-pulse border-destructive bg-destructive text-white" : "border-outline-variant text-on-surface-variant hover:bg-surface-container"}`}
              >
                <Mic className="mx-auto h-5 w-5" />
              </button>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <DashboardShell>
      <div className="mx-auto max-w-5xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <ListChecks className="h-6 w-6 text-primary" />
            <div>
              <h2 className="font-headline-lg text-on-surface">Mis Checklists</h2>
              <p className="font-body-md text-on-surface-variant">
                Creá checklists con nombre propio y preguntas por categoría. Finalizá para generar el PDF.
              </p>
            </div>
          </div>
          {vista === "lista" ? (
            <button
              type="button"
              onClick={() => abrirCrear()}
              className="inline-flex items-center gap-1 rounded bg-primary px-3 py-2 text-sm text-on-primary hover:opacity-90"
            >
              <Plus className="h-4 w-4" />Nuevo checklist
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setVista("lista")}
              className="rounded border border-outline-variant px-3 py-2 text-sm text-on-surface-variant hover:bg-surface-container"
            >
              Volver a la lista
            </button>
          )}
        </div>

        {mensaje ? (
          <div
            className={`rounded-md border p-3 text-sm ${tipoMensaje === "ok" ? "border-primary/30 bg-primary/10 text-primary" : "border-destructive/40 bg-destructive/10 text-destructive"}`}
          >
            {mensaje}
          </div>
        ) : null}

        {vista === "lista" ? (
          <>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setFiltro("borrador")}
                className={`rounded-full px-4 py-1.5 text-sm ${filtro === "borrador" ? "bg-primary text-on-primary" : "border border-outline-variant text-on-surface-variant hover:bg-surface-container"}`}
              >
                Guardados ({inspecciones.filter((i) => i.estado !== "COMPLETADO").length})
              </button>
              <button
                type="button"
                onClick={() => setFiltro("completado")}
                className={`rounded-full px-4 py-1.5 text-sm ${filtro === "completado" ? "bg-primary text-on-primary" : "border border-outline-variant text-on-surface-variant hover:bg-surface-container"}`}
              >
                Completados ({inspecciones.filter((i) => i.estado === "COMPLETADO").length})
              </button>
              <button
                type="button"
                onClick={() => setFiltro("plantillas")}
                className={`inline-flex items-center gap-1 rounded-full px-4 py-1.5 text-sm ${filtro === "plantillas" ? "bg-primary text-on-primary" : "border border-outline-variant text-on-surface-variant hover:bg-surface-container"}`}
              >
                <FileStack className="h-4 w-4" />Mis plantillas ({plantillas.length})
              </button>
            </div>

            {filtro === "plantillas" ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <FileStack className="h-4 w-4 text-primary" />
                  <h3 className="font-headline-md text-on-surface">
                    Plantillas ({plantillas.length}) — desplegá una para ver sus preguntas y completarla
                  </h3>
                </div>
                {plantillas.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-outline-variant p-6 text-center text-sm text-on-surface-variant">
                    Todavía no tenés plantillas. Al crear un checklist usá &quot;Guardar checklist + crear
                    plantilla&quot; para reutilizarlo.
                  </p>
                ) : null}
                {plantillas.map((pl) => {
                  const totalPreguntas = pl.categorias.reduce((acc, g) => acc + g.preguntas.length, 0);
                  const abierta = plantillaExpandida === pl.id;
                  return (
                    <div key={pl.id} className="rounded-xl bg-surface-container-lowest shadow-sm">
                      <button
                        type="button"
                        onClick={() => abrirCompletarRapido(pl)}
                        className="flex w-full items-center justify-between gap-2 p-4 text-left"
                      >
                        <div>
                          <p className="font-label-md text-on-surface">
                            {abierta ? <ChevronUp className="mr-1 inline h-4 w-4" /> : <ChevronDown className="mr-1 inline h-4 w-4" />}
                            {pl.nombre}
                          </p>
                          <p className="text-xs text-on-surface-variant">
                            {pl.categorias.map((g) => g.categoria).join(", ")} · {totalPreguntas} preguntas
                          </p>
                        </div>
                        <span className="inline-flex items-center gap-1 rounded border border-primary/40 bg-primary/10 px-3 py-1.5 text-sm text-primary">
                          <ClipboardCheck className="h-4 w-4" />
                          {abierta ? "Ocultar" : "Ver y completar"}
                        </span>
                      </button>

                      {abierta ? (
                        <div className="border-t border-outline-variant p-4">
                          <div className="grid gap-4 md:grid-cols-2">
                            {pl.categorias.map((g) => (
                              <div key={g.categoria} className="rounded-lg border border-outline-variant p-3">
                                <p className="mb-1 font-label-md text-primary">{g.categoria}</p>
                                <ul className="list-disc space-y-0.5 pl-5 text-sm text-on-surface">
                                  {g.preguntas.map((p, j) => (
                                    <li key={`${g.categoria}-${j}`}>{p}</li>
                                  ))}
                                </ul>
                              </div>
                            ))}
                          </div>

                          <h4 className="mt-5 font-headline-md text-on-surface">Datos para esta inspección</h4>
                          <div className="mt-2 grid gap-3 md:grid-cols-2">
                            <div>
                              <label className="mb-1 block text-xs font-medium text-on-surface-variant">Departamento *</label>
                              <select
                                value={departamentoId}
                                onChange={(e) => onDepartamentoChange(e.target.value)}
                                className="h-10 w-full rounded border border-outline-variant bg-transparent px-3 text-sm"
                              >
                                <option value="">Seleccionar…</option>
                                {departamentos.map((d) => (
                                  <option key={d.id} value={d.id}>
                                    {d.codigo} · {d.nombre} (N° {d.numero})
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="mb-1 block text-xs font-medium text-on-surface-variant">
                                Nombre del checklist
                              </label>
                              <input
                                value={nombre}
                                onChange={(e) => setNombre(e.target.value)}
                                className="h-10 w-full rounded border border-outline-variant bg-transparent px-3 text-sm"
                              />
                            </div>
                            <div>
                              <label className="mb-1 block text-xs font-medium text-on-surface-variant">
                                Persona que inspecciona
                              </label>
                              <input
                                value={persona}
                                onChange={(e) => setPersona(e.target.value)}
                                className="h-10 w-full rounded border border-outline-variant bg-transparent px-3 text-sm"
                              />
                            </div>
                            <div>
                              <label className="mb-1 block text-xs font-medium text-on-surface-variant">Fecha y hora</label>
                              <input
                                type="datetime-local"
                                value={fecha}
                                onChange={(e) => setFecha(e.target.value)}
                                className="h-10 w-full rounded border border-outline-variant bg-transparent px-3 text-sm"
                              />
                            </div>
                            <div>
                              <label className="mb-1 block text-xs font-medium text-on-surface-variant">
                                Asignado a reparación / limpieza
                              </label>
                              <input
                                value={asignadoA}
                                onChange={(e) => setAsignadoA(e.target.value)}
                                placeholder="Opcional"
                                className="h-10 w-full rounded border border-outline-variant bg-transparent px-3 text-sm"
                              />
                            </div>
                          </div>
                          <div className="mt-4 flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void guardar(false)}
                              className="inline-flex items-center gap-2 rounded bg-primary px-4 py-2 text-sm text-on-primary disabled:opacity-50"
                            >
                              <ClipboardCheck className="h-4 w-4" />Crear y responder ahora
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => abrirCrear(pl)}
                              className="inline-flex items-center gap-2 rounded border border-outline-variant px-4 py-2 text-sm text-on-surface-variant hover:bg-surface-container"
                            >
                              <Pencil className="h-4 w-4" />Editar preguntas antes de usar
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void eliminarPlantilla(pl)}
                              className="inline-flex items-center gap-2 rounded border border-outline-variant px-4 py-2 text-sm text-destructive hover:bg-surface-container"
                            >
                              <Trash2 className="h-4 w-4" />Eliminar plantilla
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : null}

            {filtro !== "plantillas" && listaFiltrada.length === 0 ? (
              <p className="rounded-lg border border-dashed border-outline-variant p-8 text-center text-sm text-on-surface-variant">
                Todavía no hay checklists {filtro === "completado" ? "completados" : "guardados"}.
                Creá uno con &quot;Nuevo checklist&quot;.
              </p>
            ) : null}

            {listaFiltrada.map((ins) => {
                const items = itemsDe(ins);
                const negativos = items.filter((i) => i.resultado === "NEGATIVO").length;
                const respondidas = items.filter((i) => i.resultado !== "").length;
                const abierta = expandida === ins.id;
                const gruposItems: { categoria: string; filas: { item: InspeccionItem; idx: number }[] }[] = [];
                items.forEach((item, idx) => {
                  const cat = (item.categoria ?? "").trim() || "General";
                  let g = gruposItems.find((x) => x.categoria === cat);
                  if (!g) {
                    g = { categoria: cat, filas: [] };
                    gruposItems.push(g);
                  }
                  g.filas.push({ item, idx });
                });
                return (
                  <div key={ins.id} className="rounded-xl bg-surface-container-lowest shadow-sm">
                    <button
                      type="button"
                      onClick={() => setExpandida(abierta ? null : ins.id)}
                      className="flex w-full flex-wrap items-center justify-between gap-2 p-4 text-left"
                    >
                      <div>
                        <p className="font-label-md text-on-surface">
                          {abierta ? <ChevronUp className="mr-1 inline h-4 w-4" /> : <ChevronDown className="mr-1 inline h-4 w-4" />}
                          {ins.nombre || ins.departamentoNombre}
                        </p>
                        <p className="text-xs text-on-surface-variant">
                          N° {ins.numero || "—"} · {ins.departamentoNombre} · {fmtFecha(ins.fecha)} · Inspecciona:{" "}
                          {ins.personaInspecciona} · Registró: {ins.inspectorNombre}
                          {ins.asignadoA ? ` · Asignado: ${ins.asignadoA}` : ""}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs">
                        <span className="rounded-full border border-outline-variant px-2 py-0.5 text-on-surface-variant">
                          {respondidas}/{items.length} respondidas
                        </span>
                        {negativos > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-destructive">
                            <XCircle className="h-3 w-3" />
                            {negativos} {negativos === 1 ? "observación" : "observaciones"}
                          </span>
                        ) : respondidas > 0 && respondidas === items.length ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-primary">
                            <CheckCircle2 className="h-3 w-3" />
                            Sin observaciones
                          </span>
                        ) : null}
                        <span
                          className={`rounded-full px-2 py-0.5 ${ins.estado === "COMPLETADO" ? "bg-primary/15 text-primary" : "border border-outline-variant text-on-surface-variant"}`}
                        >
                          {ins.estado === "COMPLETADO" ? "Completado" : "Guardado"}
                        </span>
                      </div>
                    </button>

                    {abierta ? (
                      <div className="border-t border-outline-variant p-4">
                        {(() => {
                          let contador = 0;
                          return gruposItems.map((grupo) => (
                            <div key={grupo.categoria} className="mb-4">
                              <h3 className="mb-2 font-headline-md text-primary">{grupo.categoria}</h3>
                              <div className="space-y-2">
                                {grupo.filas.map(({ item, idx }) => {
                                  contador += 1;
                                  return renderFilaPregunta(ins, item, idx, contador);
                                })}
                              </div>
                            </div>
                          ));
                        })()}

                        {ins.estado !== "COMPLETADO" ? (
                          <div className="mt-2 rounded-lg border border-dashed border-outline-variant p-3">
                            <p className="mb-2 text-xs font-medium text-on-surface-variant">
                              Agregar pregunta a este checklist
                            </p>
                            <div className="flex flex-wrap gap-2">
                              <input
                                list={`cats-${ins.id}`}
                                value={addTarget === ins.id ? addCat : ""}
                                onChange={(e) => {
                                  setAddTarget(ins.id);
                                  setAddCat(e.target.value);
                                }}
                                placeholder="Categoría (baño, sala…)"
                                className="h-10 w-44 rounded border border-outline-variant bg-transparent px-3 text-sm"
                              />
                              <datalist id={`cats-${ins.id}`}>
                                {agruparPorCategoria(items).map((g) => (
                                  <option key={g.categoria} value={g.categoria} />
                                ))}
                              </datalist>
                              <input
                                value={addTarget === ins.id ? addTexto : ""}
                                onChange={(e) => {
                                  setAddTarget(ins.id);
                                  setAddTexto(e.target.value);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" && addTexto.trim()) {
                                    setItems(ins.id, [
                                      ...items,
                                      { categoria: addCat.trim() || "General", texto: addTexto.trim(), resultado: "", motivo: "" },
                                    ]);
                                    setAddTexto("");
                                  }
                                }}
                                placeholder="Escribí la pregunta y presioná Enter…"
                                className="h-10 w-full flex-1 rounded border border-outline-variant bg-transparent px-3 text-sm"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  if (!addTexto.trim()) return;
                                  setItems(ins.id, [
                                    ...items,
                                    { categoria: addCat.trim() || "General", texto: addTexto.trim(), resultado: "", motivo: "" },
                                  ]);
                                  setAddTexto("");
                                }}
                                className="inline-flex shrink-0 items-center gap-1 rounded border border-outline-variant px-3 py-2 text-sm text-primary hover:bg-surface-container"
                              >
                                <Plus className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        ) : null}

                        <div className="mt-4 flex flex-wrap gap-2">
                          {ins.estado !== "COMPLETADO" ? (
                            <>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void guardarLista(ins, false)}
                                className="inline-flex items-center gap-2 rounded bg-primary px-4 py-2 text-sm text-on-primary disabled:opacity-50"
                              >
                                <Save className="h-4 w-4" />Guardar respuestas
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void guardarLista(ins, true)}
                                className="inline-flex items-center gap-2 rounded border border-primary/40 bg-primary/10 px-4 py-2 text-sm text-primary disabled:opacity-50"
                              >
                                <ClipboardCheck className="h-4 w-4" />Finalizar y generar PDF
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => abrirEditarDatos(ins)}
                                className="inline-flex items-center gap-2 rounded border border-outline-variant px-4 py-2 text-sm text-on-surface-variant hover:bg-surface-container"
                              >
                                <Pencil className="h-4 w-4" />Editar datos y preguntas
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void accion(ins, "pdf")}
                                className="inline-flex items-center gap-2 rounded bg-primary px-4 py-2 text-sm text-on-primary disabled:opacity-50"
                              >
                                <Download className="h-4 w-4" />Descargar PDF
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void accion(ins, "reabrir")}
                                className="inline-flex items-center gap-2 rounded border border-outline-variant px-4 py-2 text-sm text-on-surface-variant hover:bg-surface-container"
                              >
                                Reabrir y editar
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void accion(ins, "eliminar")}
                            className="inline-flex items-center gap-2 rounded border border-outline-variant px-4 py-2 text-sm text-destructive hover:bg-surface-container"
                          >
                            <Trash2 className="h-4 w-4" />Eliminar
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
          </>
        ) : (
          <div className="rounded-xl bg-surface-container-lowest p-5 shadow-sm">
            <h3 className="font-headline-md text-on-surface">
              {editandoId ? "Editar checklist" : "Nuevo checklist"}
            </h3>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-on-surface">Nombre del checklist</label>
                <input
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Ej: Revisión de casa"
                  className="h-10 w-full rounded border border-outline-variant bg-transparent px-3 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-on-surface">
                  Partir de una plantilla (opcional)
                </label>
                <select
                  value={plantillaBaseId}
                  onChange={(e) => onElegirPlantilla(e.target.value)}
                  className="h-10 w-full rounded border border-outline-variant bg-transparent px-3 text-sm"
                >
                  <option value="">Sin plantilla (preguntas en blanco)</option>
                  {plantillas.map((pl) => (
                    <option key={pl.id} value={pl.id}>
                      {pl.nombre} ({pl.categorias.reduce((a, g) => a + g.preguntas.length, 0)} preguntas)
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-on-surface">Departamento</label>
                <select
                  value={departamentoId}
                  onChange={(e) => onDepartamentoChange(e.target.value)}
                  className="h-10 w-full rounded border border-outline-variant bg-transparent px-3 text-sm"
                >
                  <option value="">Seleccionar departamento…</option>
                  {departamentos.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.codigo} · {d.nombre} (N° {d.numero})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-on-surface">Número de departamento</label>
                <input
                  value={numero}
                  onChange={(e) => setNumero(e.target.value)}
                  placeholder="Se autocompleta al elegir el departamento"
                  className="h-10 w-full rounded border border-outline-variant bg-transparent px-3 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-on-surface">Persona que inspecciona</label>
                <input
                  value={persona}
                  onChange={(e) => setPersona(e.target.value)}
                  className="h-10 w-full rounded border border-outline-variant bg-transparent px-3 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-on-surface">Fecha y hora</label>
                <input
                  type="datetime-local"
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                  className="h-10 w-full rounded border border-outline-variant bg-transparent px-3 text-sm"
                />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium text-on-surface">
                  Asignado a reparación / limpieza
                </label>
                <input
                  value={asignadoA}
                  onChange={(e) => setAsignadoA(e.target.value)}
                  placeholder="Nombre de la persona responsable (opcional)"
                  className="h-10 w-full rounded border border-outline-variant bg-transparent px-3 text-sm"
                />
              </div>
            </div>

            <h4 className="mt-6 font-headline-md text-on-surface">Preguntas por categoría</h4>
            <div className="mt-2 flex gap-2">
              <input
                value={nuevaCategoria}
                onChange={(e) => setNuevaCategoria(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") crearCategoria();
                }}
                placeholder="Nueva categoría (baño, sala, comedor…)"
                className="h-10 w-full rounded border border-outline-variant bg-transparent px-3 text-sm"
              />
              <button
                type="button"
                onClick={crearCategoria}
                className="inline-flex shrink-0 items-center gap-1 rounded border border-outline-variant px-3 py-2 text-sm text-primary hover:bg-surface-container"
              >
                <Plus className="h-4 w-4" />Categoría
              </button>
            </div>

            {grupos.length === 0 ? (
              <p className="mt-3 rounded-lg border border-dashed border-outline-variant p-4 text-center text-sm text-on-surface-variant">
                Creá una categoría (ej: Baño) o usá una plantilla, y agregá preguntas con Enter.
              </p>
            ) : null}

            <div className="mt-4 space-y-4">
              {grupos.map((grupo) => (
                <div key={grupo.categoria} className="rounded-lg border border-outline-variant p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="font-label-md text-primary">{grupo.categoria}</p>
                    <button
                      type="button"
                      onClick={() => eliminarGrupo(grupo.categoria)}
                      title="Quitar categoría"
                      className="rounded border border-outline-variant px-2 py-1 text-xs text-destructive hover:bg-surface-container"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <input
                      value={preguntaTexto[grupo.categoria] ?? ""}
                      onChange={(e) => setPreguntaTexto((prev) => ({ ...prev, [grupo.categoria]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") agregarPreguntaAGrupo(grupo.categoria);
                      }}
                      placeholder="Nueva pregunta y Enter…"
                      className="h-9 w-full rounded border border-outline-variant bg-transparent px-3 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => agregarPreguntaAGrupo(grupo.categoria)}
                      className="inline-flex shrink-0 items-center rounded border border-outline-variant px-2 text-sm text-primary hover:bg-surface-container"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                  <ul className="mt-2 space-y-1">
                    {grupo.preguntas.map((p, idx) => (
                      <li
                        key={`${grupo.categoria}-${idx}`}
                        className="flex items-center justify-between gap-2 rounded border border-outline-variant/60 px-2 py-1"
                      >
                        <span className="text-sm text-on-surface">
                          {idx + 1}. {p}
                        </span>
                        <button
                          type="button"
                          onClick={() => eliminarPregunta(grupo.categoria, idx)}
                          className="text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    ))}
                    {grupo.preguntas.length === 0 ? (
                      <li className="px-2 py-1 text-xs text-on-surface-variant">Sin preguntas todavía.</li>
                    ) : null}
                  </ul>
                </div>
              ))}
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void guardar()}
                className="inline-flex items-center gap-2 rounded bg-primary px-4 py-2 text-sm text-on-primary disabled:opacity-50"
              >
                <Save className="h-4 w-4" />{editandoId ? "Guardar cambios" : "Guardar checklist"}
              </button>
            </div>
            <p className="mt-2 text-xs text-on-surface-variant">
              Al guardar, además de crearse/actualizarse el checklist en Guardados, sus preguntas (sin
              respuestas) se almacenan como plantilla en &quot;Mis plantillas&quot; para reutilizarlas.
            </p>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
