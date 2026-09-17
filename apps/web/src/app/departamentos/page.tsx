"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { TableScroll } from "@/components/table-scroll";
import { Button } from "@contract/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@contract/ui/components/card";
import { Label } from "@contract/ui/components/label";
import { apiFetch } from "@/lib/api";
import { RefreshCw, Upload } from "lucide-react";
import { obtenerContactos, type ContactSeed as ContactoAsig } from "@/lib/contactos-seed";
import {
  CUSTOM_ITEM_CATEGORIAS,
  guardarInventarioDepartamento,
  cargarInventarios,
  inventariosCache,
  gruposModal,
  agregarElementoCatalogo,
} from "@/lib/inventarios-departamento";
import {
  type SeparacionRecord,
  leerSeparaciones,
  guardarSeparacion,
  quitarSeparacion,
} from "@/lib/separaciones";
import { migrarDatosLocales } from "@/lib/migracion-local";

interface DepartmentView {
  id: string;
  codigo: string;
  nombre: string;
  numero: string;
  tipo: string;
  personaPago: string;
  piso: number;
  precio: string;
  garantia: string;
  mantenimiento: string;
  servicios: string;
  activo: boolean;
  disponibilidad: { disponible: false; fechaFin: string; dias: number } | null;
}

export default function DepartamentosPage() {
  const [departments, setDepartments] = useState<DepartmentView[]>([]);
  const [sortKey, setSortKey] = useState<
    | "codigo"
    | "numero"
    | "nombre"
    | "piso"
    | "personaPago"
    | "precio"
    | "garantia"
    | "mantenimiento"
    | "servicios"
    | "estado"
    | "tiempo"
    | "garantiaExtendida"
    | "separadoPor"
  >("codigo");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [searchTerm, setSearchTerm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [contactos, setContactos] = useState<ContactoAsig[]>([]);
  const [separaciones, setSeparaciones] = useState<SeparacionRecord[]>([]);
  const [elegidoId, setElegidoId] = useState<string | null>(null);
  const [contactoAsignado, setContactoAsignado] = useState<string | null>(null);
  const [, setProtocoloSeleccionado] = useState<string>("");
  const [baucherUrl, setBaucherUrl] = useState<string>("");
  const [fechaSeparacion, setFechaSeparacion] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [tipoSeparacion, setTipoSeparacion] = useState<"500" | "TOTAL" | "FLUCTUANTE">("500");
  const [montoFluctuante, setMontoFluctuante] = useState("");
  const [diasTiempo, setDiasTiempo] = useState("1");
  const [, setTick] = useState(0);
  const [garantiaModalDeptId, setGarantiaModalDeptId] = useState<string | null>(null);
  const [garantiaModalModo, setGarantiaModalModo] = useState<"activar" | "ver">("activar");
  const [baucherGarantiaUrl, setBaucherGarantiaUrl] = useState<string>("");
  const [inventarioDeptId, setInventarioDeptId] = useState<string | null>(null);
  const [inventarioItems, setInventarioItems] = useState<string[]>([]);
  const [nuevoItemInventario, setNuevoItemInventario] = useState("");
  const [nuevoItemCategoria, setNuevoItemCategoria] = useState<string>(CUSTOM_ITEM_CATEGORIAS[0]);
  const [editandoPrecio, setEditandoPrecio] = useState<{ id: string; campo: "precio" | "garantia"; valor: string } | null>(null);

  function abrirInventario(departamentoId: string) {
    setInventarioDeptId(departamentoId);
    setInventarioItems(inventariosCache()[departamentoId] ?? []);
    setNuevoItemInventario("");
    setNuevoItemCategoria(CUSTOM_ITEM_CATEGORIAS[0]);
  }

  async function anadirItemInventario() {
    const texto = nuevoItemInventario.trim();
    if (!texto) return;
    try {
      const { id } = await agregarElementoCatalogo(nuevoItemCategoria, texto);
      setInventarioItems((items) => (items.includes(id) ? items : [...items, id]));
      setNuevoItemInventario("");
    } catch (err) {
      setError((err as Error).message ?? "No se pudo añadir el elemento al catálogo");
    }
  }

  function alternarInventarioItem(itemId: string) {
    setInventarioItems((items) => items.includes(itemId) ? items.filter((id) => id !== itemId) : [...items, itemId]);
  }

  // Actualizar contadores cada minuto
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(interval);
  }, []);

  function obtenerTiempoRestante(sep: SeparacionRecord) {
    if (sep.estado === "PERDER_TODO") return { texto: "DINERO PERDIDO", color: "text-red-600" };
    if (sep.estado === "CONTRATO_REAL") return { texto: "CONTRATO ACTIVO", color: "text-green-600" };
    if (sep.estado === "CONTRATO_PREVIO") return { texto: "—", color: "text-muted-foreground" };

    const fechaLimite = getFechaLimiteActiva(sep);
    const diff = new Date(fechaLimite).getTime() - Date.now();
    if (diff <= 0) return { texto: "VENCIDO", color: "text-red-600" };
    
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const urgent = d < 1; 
    return { 
      texto: `${d}d ${h}h ${m}m`, 
      color: urgent ? "text-red-600" : "text-amber-600" 
    };
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/api/departamentos");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Error ${res.status}`);
      }
      const loadedDepartments = (await res.json()) as DepartmentView[];
      setDepartments(loadedDepartments);

      await migrarDatosLocales();
      const [seps, ctos] = await Promise.all([
        leerSeparaciones(),
        obtenerContactos(),
      ]);
      await cargarInventarios(true);
      setSeparaciones(seps);
      setContactos(ctos);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function getTipoSeparacion(sep: SeparacionRecord): "500" | "TOTAL" | "FLUCTUANTE" {
    if (sep.tipoSeparacion) return sep.tipoSeparacion;
    return sep.montoSeparacion === 500 ? "500" : "TOTAL";
  }

  function getFechaLimiteActiva(sep: SeparacionRecord): string {
    if (sep.fechaLimiteManual) return sep.fechaLimiteManual;
    if (sep.diasTiempo && sep.fechaSeparacion) {
      return new Date(new Date(sep.fechaSeparacion).getTime() + sep.diasTiempo * 86400000).toISOString();
    }
    if (getTipoSeparacion(sep) === "TOTAL") {
      return sep.fechaLimite168h;
    }
    if (sep.garantiaExtendida) {
      return sep.fechaLimite168h;
    }
    return sep.fechaLimite48h;
  }

  function getEstadoActual(sep: SeparacionRecord): string {
    const ahora = Date.now();
    if (sep.estado === "PERDER_TODO" || sep.estado === "CONTRATO_REAL") return sep.estado;
    if (sep.estado === "CONTRATO_PREVIO") return "CONTRATO_PREVIO";
    if (sep.estado === "GARANTIA_COMPLETADA") return "GARANTIA_COMPLETADA";
    const fechaLimite = new Date(getFechaLimiteActiva(sep)).getTime();
    if (ahora > fechaLimite) {
      if (["500", "FLUCTUANTE"].includes(getTipoSeparacion(sep)) && !sep.garantiaExtendida) return "PERDER_TODO";
      return "INACTIVO_168H";
    }
    return "SEPARADO";
  }

  function estaSeparado(dept: DepartmentView): boolean {
    const sep = separaciones.find((s) => s.departamentoId === dept.id);
    if (!sep) return false;
    const estado = getEstadoActual(sep);
    return !["PERDER_TODO", "INACTIVO_48H", "INACTIVO_168H"].includes(estado);
  }

  function estadoDepartamento(dept: DepartmentView): "OCUPADO" | "SEPARADO" | "DISPONIBLE" {
    if (dept.disponibilidad) return "OCUPADO";
    if (estaSeparado(dept)) return "SEPARADO";
    return "DISPONIBLE";
  }

  function cambiarOrden(clave: typeof sortKey) {
    if (sortKey === clave) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(clave); setSortDir("asc"); }
  }

  const ordenados = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLocaleLowerCase("es");
    const filtrados = normalizedSearch
      ? departments.filter((department) => {
          const sep = separaciones.find((item) => item.departamentoId === department.id);
          const contacto = sep ? contactos.find((item) => item.id === sep.contactoId) : null;
          const searchable = [
            department.codigo,
            department.numero,
            department.nombre,
            department.personaPago,
            department.servicios,
            department.tipo,
            department.precio,
            department.garantia,
            department.mantenimiento,
            sep ? getEstadoActual(sep) : estadoDepartamento(department),
            sep ? getTipoSeparacion(sep) : "",
            sep?.montoSeparacion,
            contacto?.nombre,
            contacto?.apellido,
          ]
            .filter((value) => value !== undefined && value !== null)
            .join(" ")
            .toLocaleLowerCase("es");
          return searchable.includes(normalizedSearch);
        })
      : departments;
    const copia = [...filtrados].sort((a, b) => {
      const sepA = separaciones.find((s) => s.departamentoId === a.id);
      const sepB = separaciones.find((s) => s.departamentoId === b.id);
      const contactoA = sepA ? contactos.find((c) => c.id === sepA.contactoId) : null;
      const contactoB = sepB ? contactos.find((c) => c.id === sepB.contactoId) : null;
      const estadoA = estadoDepartamento(a);
      const estadoB = estadoDepartamento(b);
      const tiempoA = sepA ? new Date(getFechaLimiteActiva(sepA)).getTime() : 0;
      const tiempoB = sepB ? new Date(getFechaLimiteActiva(sepB)).getTime() : 0;
      const garantiaA = sepA ? (sepA.garantiaExtendida ? "Activa" : "No activa") : "—";
      const garantiaB = sepB ? (sepB.garantiaExtendida ? "Activa" : "No activa") : "—";
      const separadoPorA = contactoA ? `${contactoA.nombre} ${contactoA.apellido}` : "";
      const separadoPorB = contactoB ? `${contactoB.nombre} ${contactoB.apellido}` : "";
      let cmp: number;
      if (["piso", "precio", "garantia", "mantenimiento"].includes(sortKey)) {
        const values = {
          piso: [a.piso, b.piso],
          precio: [Number(a.precio), Number(b.precio)],
          garantia: [Number(a.garantia), Number(b.garantia)],
          mantenimiento: [Number(a.mantenimiento), Number(b.mantenimiento)],
        } as Record<string, number[]>;
        cmp = (values[sortKey]?.[0] ?? 0) - (values[sortKey]?.[1] ?? 0);
      } else if (sortKey === "tiempo") {
        cmp = tiempoA - tiempoB;
      } else {
        const values = {
          codigo: [a.codigo, b.codigo],
          numero: [a.numero, b.numero],
          nombre: [a.nombre, b.nombre],
          personaPago: [a.personaPago, b.personaPago],
          servicios: [a.servicios, b.servicios],
          estado: [estadoA, estadoB],
          garantiaExtendida: [garantiaA, garantiaB],
          separadoPor: [separadoPorA, separadoPorB],
        } as Record<string, string[]>;
        cmp = (values[sortKey]?.[0] ?? "").localeCompare(values[sortKey]?.[1] ?? "", "es");
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copia;
  }, [departments, separaciones, contactos, searchTerm, sortKey, sortDir]);

  function fmtPrecio(val: string): string {
    return `S/ ${Number(val).toLocaleString("es-PE", { minimumFractionDigits: 0 })}`;
  }

  async function guardarEdicionPrecio(edit: { id: string; campo: "precio" | "garantia"; valor: string }) {
    setEditandoPrecio(null);
    if (!edit.valor || !(Number(edit.valor) >= 0)) return;
    try {
      const res = await apiFetch(`/api/departamentos/${edit.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [edit.campo]: edit.valor }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error ?? `Error ${res.status}`);
      }
      const upd = (await res.json()) as { precio?: string; garantia?: string };
      setDepartments((prev) =>
        prev.map((d) =>
          d.id === edit.id
            ? {
                ...d,
                precio: upd.precio ?? d.precio,
                garantia: upd.garantia ?? d.garantia,
              }
            : d
        )
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function inicioEdicionPrecio(id: string, campo: "precio" | "garantia", valorActual: string) {
    setEditandoPrecio({ id, campo, valor: valorActual });
  }

  function manejarBaucher(file: File | null) {
    if (!file) return;
    if (!file.type.includes("image")) {
      setError("El baucher debe ser una imagen.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      setBaucherUrl(dataUrl);
    };
    reader.readAsDataURL(file);
  }

  function asignarDepartamento() {
    if (!elegidoId || !contactoAsignado || !elegido) {
      setError("Completa departamento y contacto.");
      return;
    }
    if (!baucherUrl) {
      setError("Es obligatorio subir el baucher de la separación.");
      return;
    }
    const dept = departments.find((d) => d.id === elegidoId);
    if (!dept) {
      setError("Departamento no encontrado.");
      return;
    }
    const contacto = contactos.find((c) => c.id === contactoAsignado);
    if (!contacto) {
      setError("Contacto no encontrado.");
      return;
    }

    // Calcular monto según selección
    const monto = tipoSeparacion === "TOTAL" ? Number(dept.precio) : tipoSeparacion === "FLUCTUANTE" ? Number(montoFluctuante) : 500;
    if (tipoSeparacion === "FLUCTUANTE" && (!Number.isFinite(monto) || monto < 500)) {
      setError("La separación fluctuante debe ser de al menos S/ 500.");
      return;
    }
    const dias = Number.parseInt(diasTiempo, 10);
    if (!Number.isInteger(dias) || dias < 1) {
      setError("Debes indicar al menos 1 día de tiempo restante.");
      return;
    }

    const base = fechaSeparacion
      ? new Date(`${fechaSeparacion}T12:00:00`)
      : new Date();
    if (Number.isNaN(base.getTime())) {
      setError("La fecha de separación no es válida.");
      return;
    }
    const fechaLimiteManual = new Date(base.getTime() + dias * 24 * 60 * 60 * 1000).toISOString();
    const nuevaSep: SeparacionRecord = {
      departamentoId: elegidoId,
      contactoId: contactoAsignado,
      montoSeparacion: monto,
      tipoSeparacion: tipoSeparacion,
      garantiaExtendida: false,
      fechaSeparacion: base.toISOString(),
      diasTiempo: dias,
      fechaLimiteManual,
      fechaLimite48h: fechaLimiteManual,
      fechaLimite120h: fechaLimiteManual,
      fechaLimite168h: fechaLimiteManual,
      baucherSeparacion: baucherUrl,
      estado: "SEPARADO",
    };
    setSeparaciones((prev) => [...prev.filter((s) => s.departamentoId !== elegidoId), nuevaSep]);
    void guardarSeparacion(nuevaSep).catch((err: Error) => {
      setError(err.message ?? "No se pudo registrar la separación");
      void load();
    });
    setError(null);
    setElegidoId(null);
    setContactoAsignado(null);
    setProtocoloSeleccionado("");
    setBaucherUrl("");
    setFechaSeparacion(new Date().toISOString().slice(0, 10));
    setTipoSeparacion("500");
    setMontoFluctuante("");
    setDiasTiempo("1");
  }

  function quitarAsignacion(deptId: string) {
    setSeparaciones((prev) => prev.filter((s) => s.departamentoId !== deptId));
    void quitarSeparacion(deptId).catch((err: Error) => {
      setError(err.message ?? "No se pudo quitar la separación");
      void load();
    });
    if (elegidoId === deptId) {
      setElegidoId(null);
      setContactoAsignado(null);
      setProtocoloSeleccionado("");
      setBaucherUrl("");
      setTipoSeparacion("500");
      setMontoFluctuante("");
      setDiasTiempo("1");
    }
  }

  function abrirModalGarantia(deptId: string, modo: "activar" | "ver") {
    setGarantiaModalDeptId(deptId);
    setGarantiaModalModo(modo);
    if (modo === "activar") {
      setBaucherGarantiaUrl("");
    } else {
      const sep = separaciones.find((s) => s.departamentoId === deptId);
      setBaucherGarantiaUrl(sep?.baucherGarantiaExtendida ?? "");
    }
  }

  function cerrarModalGarantia() {
    setGarantiaModalDeptId(null);
    setBaucherGarantiaUrl("");
  }

  function manejarBaucherGarantia(file: File | null) {
    if (!file) return;
    const esJpgPng = ["image/jpeg", "image/png"].includes(file.type) || /\.(jpe?g|png)$/i.test(file.name);
    if (!esJpgPng) {
      setError("El baucher debe ser un archivo JPG o PNG.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setBaucherGarantiaUrl(typeof reader.result === "string" ? reader.result : "");
    };
    reader.readAsDataURL(file);
  }

  function activarGarantiaExtendida(deptId: string) {
    if (!baucherGarantiaUrl) {
      setError("Es obligatorio subir el baucher de la garantía extendida.");
      return;
    }
    setSeparaciones((prev) =>
      prev.map((s) =>
        s.departamentoId === deptId
          ? {
              ...s,
              garantiaExtendida: true,
              baucherGarantiaExtendida: baucherGarantiaUrl,
              fechaGarantiaExtendida: new Date().toISOString(),
            }
          : s
      )
    );
    const actual = separaciones.find((s) => s.departamentoId === deptId);
    if (actual) {
      void guardarSeparacion({
        ...actual,
        garantiaExtendida: true,
        baucherGarantiaExtendida: baucherGarantiaUrl,
        fechaGarantiaExtendida: new Date().toISOString(),
      }).catch((err: Error) => {
        setError(err.message ?? "No se pudo activar la garantía");
        void load();
      });
    }
    setError(null);
    cerrarModalGarantia();
  }

  const elegido = useMemo(() => departments.find((d) => d.id === elegidoId), [departments, elegidoId]);

  return (
    <DashboardShell>
      <div className="flex flex-col gap-6">
        {/* Formulario de asignación */}
        <Card>
          <CardHeader>
            <CardTitle>Asignar departamento a contacto</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5">
                <Label>Departamento</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={elegidoId ?? ""}
                  onChange={(e) => setElegidoId(e.target.value || null)}
                >
                  <option value="" disabled>Selecciona…</option>
                  {departments.filter((d) => d.activo).map((d) => (
                    <option key={d.id} value={d.id} disabled={estadoDepartamento(d) !== "DISPONIBLE"}>
                      {d.codigo} — {d.nombre} (N°{d.numero})
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Contacto</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={contactoAsignado ?? ""}
                  onChange={(e) => setContactoAsignado(e.target.value || null)}
                >
                  <option value="" disabled>Selecciona…</option>
                  {contactos.map((c) => (
                    <option key={c.id} value={c.id}>
                      {[c.nombre, c.apellido].filter(Boolean).join(" ")}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Protocolo de pago</Label>
                <div className="flex h-10 w-full items-center rounded-md border border-input bg-muted/50 px-3 text-sm font-medium text-on-surface">
                  {elegido ? elegido.personaPago : "—"}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Tipo de separación</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={tipoSeparacion}
                  onChange={(e) => setTipoSeparacion(e.target.value as "500" | "TOTAL" | "FLUCTUANTE")}
                >
                  <option value="500">Separación (S/ 500)</option>
                  <option value="TOTAL">Garantía Total ({elegido ? fmtPrecio(elegido.precio) : "S/ 0"})</option>
                  <option value="FLUCTUANTE">Separación fluctuante</option>
                </select>
              </div>
              {tipoSeparacion === "FLUCTUANTE" ? (
                <div className="space-y-1.5">
                  <Label>Monto de separación (mínimo S/ 500)</Label>
                  <input
                    type="number"
                    min="500"
                    step="0.01"
                    className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={montoFluctuante}
                    onChange={(e) => setMontoFluctuante(e.target.value)}
                    placeholder="500.00"
                  />
                </div>
              ) : null}
              <div className="space-y-1.5">
                <Label>Tiempo restante (días)</Label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={diasTiempo}
                  onChange={(e) => setDiasTiempo(e.target.value)}
                  placeholder="Ej. 7"
                />
                <p className="text-xs text-muted-foreground">El vencimiento se calculará desde la fecha de separación.</p>
              </div>
              <div className="space-y-1.5">
                <Label>Fecha de separación</Label>
                <input
                  type="date"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={fechaSeparacion}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setFechaSeparacion(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Día en que se realizó la separación.</p>
              </div>
              <div className="space-y-1.5">
                <Label>Baucher</Label>
                <label className="flex h-10 cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent">
                  <Upload className="h-4 w-4" />
                  {baucherUrl ? "Cambiar" : "Adjuntar"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => manejarBaucher(e.target.files?.[0] ?? null)}
                  />
                </label>
              </div>
            </div>
            {elegido && (
              <div className="mt-4 flex items-center gap-4 rounded-lg bg-muted/50 p-3 text-sm">
                <span className="font-medium">Seleccionado:</span>
                <span>{elegido.codigo} · Piso {elegido.piso} · {fmtPrecio(elegido.precio)}/mes</span>
              </div>
            )}
            {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
            <div className="mt-4 flex gap-2">
              <Button onClick={asignarDepartamento} disabled={!elegidoId || !contactoAsignado || !baucherUrl}>
                Asignar departamento
              </Button>
              <Button variant="outline" onClick={() => { setElegidoId(null); setContactoAsignado(null); setProtocoloSeleccionado(""); setBaucherUrl(""); setFechaSeparacion(new Date().toISOString().slice(0, 10)); }}>
                Limpiar
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Tabla de departamentos */}
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle>Departamentos ({ordenados.length} de {departments.length})</CardTitle>
              <div className="flex items-center gap-2">
                <label className="sr-only" htmlFor="buscar-departamentos">
                  Buscar en departamentos
                </label>
                <input
                  id="buscar-departamentos"
                  type="search"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar persona, departamento..."
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-on-surface outline-none transition-shadow placeholder:text-muted-foreground focus:ring-2 focus:ring-ring sm:w-72"
                />
                <Button variant="ghost" size="sm" onClick={load} title="Recargar">
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {error && !loading ? (
              <p className="text-sm text-destructive">{error}</p>
            ) : loading ? (
              <p className="text-sm text-muted-foreground">Cargando…</p>
            ) : departments.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin departamentos.</p>
            ) : (
              <TableScroll className="max-h-[32rem] w-full rounded-md border">
                <div className="max-h-[30rem] overflow-y-auto">
                  <table className="w-full min-w-[1100px] text-sm">
                    <thead className="sticky top-0 z-10 bg-[#151a24] text-left text-xs text-white/80">
                      <tr>
                        <th onClick={() => cambiarOrden("codigo")} className="cursor-pointer select-none px-3 py-2 font-medium transition-colors hover:bg-white/10">
                          Código{sortKey === "codigo" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                        </th>
                        <th className="px-3 py-2 font-medium">Inventario</th>
                        <th onClick={() => cambiarOrden("numero")} className="cursor-pointer select-none px-3 py-2 font-medium transition-colors hover:bg-white/10">
                          N°{sortKey === "numero" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                        </th>
                        <th onClick={() => cambiarOrden("nombre")} className="cursor-pointer select-none px-3 py-2 font-medium transition-colors hover:bg-white/10">
                          Edificio{sortKey === "nombre" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                        </th>
                        <th onClick={() => cambiarOrden("piso")} className="cursor-pointer select-none px-3 py-2 font-medium transition-colors hover:bg-white/10">
                          Piso{sortKey === "piso" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                        </th>
                        <th onClick={() => cambiarOrden("personaPago")} className="cursor-pointer select-none px-3 py-2 font-medium transition-colors hover:bg-white/10">
                          Persona pago{sortKey === "personaPago" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                        </th>
                          <th onClick={() => cambiarOrden("precio")} className="cursor-pointer select-none px-3 py-2 font-medium transition-colors hover:bg-white/10">
                            Mensualidad{sortKey === "precio" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                          </th>
                          <th onClick={() => cambiarOrden("garantia")} className="cursor-pointer select-none px-3 py-2 font-medium transition-colors hover:bg-white/10">
                            Garantía{sortKey === "garantia" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                          </th>
                        <th onClick={() => cambiarOrden("mantenimiento")} className="cursor-pointer select-none px-3 py-2 font-medium transition-colors hover:bg-white/10">
                          Mant.{sortKey === "mantenimiento" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                        </th>
                        <th onClick={() => cambiarOrden("servicios")} className="cursor-pointer select-none px-3 py-2 font-medium transition-colors hover:bg-white/10">
                          Servicios{sortKey === "servicios" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                        </th>
                        <th onClick={() => cambiarOrden("estado")} className="cursor-pointer select-none px-3 py-2 font-medium transition-colors hover:bg-white/10">
                          Estado{sortKey === "estado" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                        </th>
                        <th onClick={() => cambiarOrden("tiempo")} className="cursor-pointer select-none px-3 py-2 font-medium transition-colors hover:bg-white/10">
                          Tiempo Restante{sortKey === "tiempo" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                        </th>
                        <th onClick={() => cambiarOrden("garantiaExtendida")} className="cursor-pointer select-none px-3 py-2 font-medium transition-colors hover:bg-white/10">
                          Garantía Extendida{sortKey === "garantiaExtendida" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                        </th>
                        <th onClick={() => cambiarOrden("separadoPor")} className="cursor-pointer select-none px-3 py-2 font-medium transition-colors hover:bg-white/10">
                          Separado por{sortKey === "separadoPor" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {ordenados.map((d) => {
                        const sep = separaciones.find((s) => s.departamentoId === d.id);
                        const sepContacto = sep ? contactos.find((c) => c.id === sep.contactoId) : null;

                        return (
                          <tr
                            key={d.id}
                            data-selected={selectedId === d.id}
                            onClick={() => setSelectedId(selectedId === d.id ? null : d.id)}
                            className={`border-t cursor-pointer transition-colors ${
                              selectedId === d.id
                                ? "bg-muted ring-2 ring-inset ring-primary/60"
                                : "hover:bg-muted/50"
                            }`}
                          >
                            <td className="px-3 py-2 font-mono-label font-medium">{d.codigo}</td>
                            <td className="px-3 py-2">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-xs"
                                onClick={(e) => { e.stopPropagation(); abrirInventario(d.id); }}
                              >
                                Ver / editar
                              </Button>
                            </td>
                            <td className="px-3 py-2">{d.numero}</td>
                            <td className="px-3 py-2">{d.nombre}</td>
                            <td className="px-3 py-2 text-center">{d.piso}</td>
                            <td className="px-3 py-2">{d.personaPago}</td>
                            <td className="px-3 py-2">
                              {editandoPrecio?.id === d.id && editandoPrecio.campo === "precio" ? (
                                <input
                                  autoFocus
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  className="h-7 w-24 rounded border border-primary bg-background px-1 text-right text-sm text-primary"
                                  value={editandoPrecio.valor}
                                  onClick={(e) => e.stopPropagation()}
                                  onChange={(e) => setEditandoPrecio({ id: d.id, campo: "precio", valor: e.target.value })}
                                  onBlur={() => void guardarEdicionPrecio(editandoPrecio)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") void guardarEdicionPrecio(editandoPrecio);
                                    if (e.key === "Escape") setEditandoPrecio(null);
                                  }}
                                />
                              ) : (
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); inicioEdicionPrecio(d.id, "precio", d.precio); }}
                                  className="font-semibold text-primary hover:underline"
                                  title="Editar mensualidad"
                                >
                                  {fmtPrecio(d.precio)}
                                </button>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              {editandoPrecio?.id === d.id && editandoPrecio.campo === "garantia" ? (
                                <input
                                  autoFocus
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  className="h-7 w-24 rounded border border-primary bg-background px-1 text-right text-sm"
                                  value={editandoPrecio.valor}
                                  onClick={(e) => e.stopPropagation()}
                                  onChange={(e) => setEditandoPrecio({ id: d.id, campo: "garantia", valor: e.target.value })}
                                  onBlur={() => void guardarEdicionPrecio(editandoPrecio)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") void guardarEdicionPrecio(editandoPrecio);
                                    if (e.key === "Escape") setEditandoPrecio(null);
                                  }}
                                />
                              ) : (
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); inicioEdicionPrecio(d.id, "garantia", d.precio); }}
                                  className="hover:underline"
                                  title="Editar garantía"
                                >
                                  {fmtPrecio(d.garantia)}
                                </button>
                              )}
                            </td>
                            <td className="px-3 py-2">{fmtPrecio(d.mantenimiento)}</td>
                            <td className="px-3 py-2 text-muted-foreground">{d.servicios}</td>
                            <td className="px-3 py-2">
                              {estadoDepartamento(d) === "OCUPADO" ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-black/10 px-2 py-0.5 text-xs font-medium text-black dark:bg-white/20 dark:text-white">
                                  <span className="h-1.5 w-1.5 rounded-full bg-black dark:bg-white" />
                                  Ocupado
                                  <span className="text-black/70 dark:text-white/70">· hasta {new Date(`${d.disponibilidad!.fechaFin}T12:00:00`).toLocaleDateString("es-PE")}</span>
                                </span>
                              ) : estaSeparado(d) ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                                  <span className="h-1.5 w-1.5 rounded-full bg-destructive" />
                                  Separado
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                                  Disponible
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              {sep ? (
                                (() => {
                                  const { texto, color } = obtenerTiempoRestante(sep);
                                  return (
                                    <span className={`font-bold ${color}`}>
                                      {texto}
                                    </span>
                                  );
                                })()
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              {sep && getTipoSeparacion(sep) === "500" ? (
                                sep.garantiaExtendida ? (
                                  <div className="flex flex-col gap-1">
                                    <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-600">
                                      <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                                      Activa (+120h)
                                    </span>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 px-2 text-xs"
                                      onClick={(e) => { e.stopPropagation(); abrirModalGarantia(d.id, "ver"); }}
                                    >
                                      Ver baucher
                                    </Button>
                                  </div>
                                ) : (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-6 px-2 text-xs"
                                    onClick={(e) => { e.stopPropagation(); abrirModalGarantia(d.id, "activar"); }}
                                  >
                                    Activar (+120h)
                                  </Button>
                                )
                              ) : sep && getTipoSeparacion(sep) === "TOTAL" ? (
                                <span className="text-xs text-muted-foreground">Total</span>
                              ) : sep && getTipoSeparacion(sep) === "FLUCTUANTE" ? (
                                <span className="text-xs text-muted-foreground">Fluctuante</span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              {sepContacto
                                ? [sepContacto.nombre, sepContacto.apellido].filter(Boolean).join(" ")
                                : "—"}
                              {sepContacto && sep && (
                                <div className="text-xs text-muted-foreground mt-1">
                                  Monto: {fmtPrecio(sep.montoSeparacion.toString())}
                                </div>
                              )}
                              {sepContacto && sep && (
                                <div className="text-xs text-muted-foreground">
                                  Fecha: {new Date(sep.fechaSeparacion).toLocaleDateString("es-PE")}
                                </div>
                              )}
                              {sepContacto && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="mt-1 h-6 px-2 text-xs"
                                  onClick={(e) => { e.stopPropagation(); quitarAsignacion(d.id); }}
                                >
                                  Quitar
                                </Button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </TableScroll>
            )}
          </CardContent>
        </Card>

        {inventarioDeptId && (() => {
          const inventarioDept = departments.find((department) => department.id === inventarioDeptId);
          const grupos = gruposModal(inventarioItems);
          if (!inventarioDept) return null;
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setInventarioDeptId(null)}>
              <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg border bg-background p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-headline-md text-lg font-bold text-primary">Inventario de {inventarioDept.codigo}</h3>
                    <p className="text-sm text-muted-foreground">Selecciona los bienes propios de este departamento.</p>
                  </div>
                  <Button variant="outline" onClick={() => setInventarioDeptId(null)}>Cerrar</Button>
                </div>
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  {grupos.map((grupo) => (
                    <section key={grupo.categoria} className="rounded-lg border border-input p-3">
                      <h4 className="mb-2 font-medium">{grupo.categoria}</h4>
                      <div className="space-y-2">
                        {grupo.items.map(([itemId, label]) => (
                          <label key={itemId} className="flex items-start gap-2 text-sm">
                            <input type="checkbox" checked={inventarioItems.includes(itemId)} onChange={() => alternarInventarioItem(itemId)} />
                            <span>{label}</span>
                          </label>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
                <div className="mt-4 rounded-lg border border-dashed border-input p-3">
                  <h4 className="mb-2 font-medium">Añadir bien adicional (manual)</h4>
                  <p className="mb-2 text-xs text-muted-foreground">
                    Elige el tipo de bien; se mostrará dentro de esa sección.
                  </p>
                  <div className="flex items-center gap-2">
                    <select
                      value={nuevoItemCategoria}
                      onChange={(e) => setNuevoItemCategoria(e.target.value)}
                      className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                    >
                      {CUSTOM_ITEM_CATEGORIAS.map((categoria) => (
                        <option key={categoria} value={categoria}>
                          {categoria}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      placeholder='Ej. "2 TV LED 32"" o "Sofá nuevo"'
                      className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm"
                      value={nuevoItemInventario}
                      onChange={(e) => setNuevoItemInventario(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          anadirItemInventario();
                        }
                      }}
                    />
                    <Button type="button" variant="outline" size="sm" onClick={anadirItemInventario} disabled={!nuevoItemInventario.trim()}>
                      Añadir
                    </Button>
                  </div>
                </div>
                <div className="mt-5 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => {
                      const ids = grupos.flatMap((grupo) => grupo.items.map(([itemId]) => itemId));
                      setInventarioItems((items) => ids.length > 0 && ids.every((id) => items.includes(id)) ? [] : ids);
                    }}
                    className="font-label-md text-primary hover:underline"
                  >
                    {(() => {
                      const ids = grupos.flatMap((grupo) => grupo.items.map(([itemId]) => itemId));
                      return ids.length > 0 && ids.every((id) => inventarioItems.includes(id)) ? "Quitar todos" : "Seleccionar todo";
                    })()}
                  </button>
                  <div className="flex justify-end">
                  <Button onClick={() => {
                    void guardarInventarioDepartamento(inventarioDeptId, inventarioItems)
                      .then(() => setInventarioDeptId(null))
                      .catch((err: Error) => setError(err.message ?? "No se pudo guardar el inventario"));
                  }}>
                    Guardar inventario
                  </Button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Modal Garantía Extendida */}
        {garantiaModalDeptId && (() => {
          const gDept = departments.find((x) => x.id === garantiaModalDeptId);
          const gSep = separaciones.find((s) => s.departamentoId === garantiaModalDeptId);
          if (!gDept || !gSep) return null;
          const diferencia = Number(gDept.precio) - 500;
          const esVer = garantiaModalModo === "ver";
          return (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
              onClick={cerrarModalGarantia}
            >
              <div
                className="w-full max-w-md rounded-lg border bg-background p-6 shadow-lg"
                onClick={(e) => e.stopPropagation()}
              >
                <h3 className="font-headline-md text-lg font-bold text-primary">
                  {esVer ? "Baucer Garantía Extendida" : "Activar Garantía Extendida"}
                </h3>
                <div className="mt-4 space-y-3 text-sm">
                  <div className="rounded-lg bg-muted/50 p-3">
                    <p className="font-medium">{gDept.codigo} — {gDept.nombre} (N°{gDept.numero})</p>
                    <p className="text-muted-foreground">
                      Precio: {fmtPrecio(gDept.precio)} · Separación pagada: S/ 500
                    </p>
                    <p className="mt-1 font-semibold text-primary">
                      Monto a abonar: {fmtPrecio(diferencia.toString())}
                    </p>
                  </div>
                  <p className="text-muted-foreground">
                    Al abonar la diferencia se extienden <strong>120 horas adicionales</strong>{" "}
                    (168h en total desde la separación).
                  </p>
                  {esVer ? (
                    baucherGarantiaUrl ? (
                      <div className="space-y-2">
                        <img
                          src={baucherGarantiaUrl}
                          alt="Baucer garantía extendida"
                          className="max-h-64 w-full rounded-md border object-contain"
                        />
                        {gSep.fechaGarantiaExtendida && (
                          <p className="text-xs text-muted-foreground">
                            Activada el{" "}
                            {new Date(gSep.fechaGarantiaExtendida).toLocaleString("es-PE", {
                              dateStyle: "long",
                              timeStyle: "short",
                            })}
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Esta garantía extendida no tiene baucher registrado.
                      </p>
                    )
                  ) : (
                    <>
                      <div className="space-y-1.5">
                        <Label>Baucer de abono (obligatorio)</Label>
                        <label className="flex h-10 cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent">
                          <Upload className="h-4 w-4" />
                          {baucherGarantiaUrl ? "Cambiar" : "Adjuntar imagen"}
                          <input
                            type="file"
                            accept=".jpg,.jpeg,.png,image/jpeg,image/png"
                            className="hidden"
                            onChange={(e) => manejarBaucherGarantia(e.target.files?.[0] ?? null)}
                          />
                        </label>
                      </div>
                      {baucherGarantiaUrl && (
                        <img
                          src={baucherGarantiaUrl}
                          alt="Vista previa baucer"
                          className="max-h-40 w-full rounded-md border object-contain"
                        />
                      )}
                    </>
                  )}
                </div>
                <div className="mt-5 flex justify-end gap-2">
                  <Button variant="outline" onClick={cerrarModalGarantia}>
                    {esVer ? "Cerrar" : "Cancelar"}
                  </Button>
                  {!esVer && (
                    <Button
                      onClick={() => activarGarantiaExtendida(garantiaModalDeptId)}
                      disabled={!baucherGarantiaUrl}
                    >
                      Confirmar ampliación
                    </Button>
                  )}
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </DashboardShell>
  );
}
