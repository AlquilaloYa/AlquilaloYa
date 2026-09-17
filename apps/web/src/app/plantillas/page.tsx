"use client";

import { useEffect, useMemo, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { BusquedaInput, filtrarFilas, ordenarColumna } from "@/components/tabla-busqueda";
import { apiFetch } from "@/lib/api";
import { Download, FileText, Plus, X } from "lucide-react";

type TemplateApi = { id: string; clave: string; nombre: string; activo: boolean };
type TemplateVersionApi = {
  id: string;
  version: number;
  publicada: boolean;
  pdfStorageKey: string | null;
  pdfFilename: string | null;
  createdAt: string;
  contenido: string | null;
};

const TEMPLATE_LABEL: Record<string, string> = {
  PN_LARGO: "Emely_ Benavides",
  ANG_LARGO: "Miguel_ extensión_ madre_ Angamos",
  ANG_EMELY: "Emely_ Angamos_madre",
};

export default function PlantillasPage() {
  const [templates, setTemplates] = useState<TemplateApi[]>([]);
  const [versions, setVersions] = useState<Record<string, TemplateVersionApi[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState<{ template: TemplateApi } | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [sortKey, setSortKey] = useState<"clave" | "tipo" | "nombre" | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const filasTabla = useMemo(() => {
    let filas = filtrarFilas(templates, busqueda, (t) => [
      t.id,
      TEMPLATE_LABEL[t.clave] ?? t.clave,
      t.nombre,
    ]);
    const valoradores: Record<string, (t: TemplateApi) => string | number | null | undefined> = {
      clave: (t) => t.id,
      tipo: (t) => TEMPLATE_LABEL[t.clave] ?? t.clave,
      nombre: (t) => t.nombre,
    };
    if (sortKey) {
      filas = ordenarColumna(filas, sortKey, sortDir, valoradores[sortKey]!);
    }
    return filas;
  }, [templates, busqueda, sortKey, sortDir]);

  function cambiarOrden(clave: typeof sortKey) {
    if (sortKey === clave) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(clave);
      setSortDir("asc");
    }
  }

  async function load() {
    setError(null);
    try {
      const res = await apiFetch("/api/templates");
      if (!res.ok) throw new Error("No se pudieron cargar las plantillas");
      const data = (await res.json()) as TemplateApi[];
      setTemplates(data);
      const vmap: Record<string, TemplateVersionApi[]> = {};
      await Promise.all(
        data.map(async (t) => {
          try {
            const vr = await apiFetch(`/api/templates/${t.id}/versions`);
            const vlist = (await vr.json()) as TemplateVersionApi[];
            vmap[t.id] = vlist.sort((a, b) => b.version - a.version);
          } catch {
            vmap[t.id] = [];
          }
        })
      );
      setVersions(vmap);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function descargarPdf(t: TemplateApi, v: TemplateVersionApi) {
    try {
      const res = await apiFetch(`/api/templates/${t.id}/versions/${v.id}/pdf`);
      if (!res.ok) throw new Error("No se pudo descargar el PDF");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = v.pdfFilename ?? `plantilla-v${v.version}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <DashboardShell>
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h2 className="font-headline-lg text-on-surface">Plantillas de contrato</h2>
            <p className="font-body-md text-on-surface-variant">
              Versiones y plantillas de arrendamiento utilizadas para generar contratos (Fase 3).
            </p>
          </div>
          <button
            onClick={() =>
              templates[0] && setShowCreate({ template: templates[0] })
            }
            className="flex h-10 shrink-0 items-center gap-2 rounded bg-primary px-4 font-label-md text-on-primary shadow-sm"
          >
            <Plus className="h-4 w-4" />
            Nueva versión
          </button>
        </div>

        {error ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 font-body-sm text-destructive">
            {error}
          </div>
        ) : null}

        <div className="overflow-hidden rounded-xl bg-surface-container-lowest shadow-sm">
          <div className="flex items-center justify-between gap-4 bg-surface p-4">
            <span className="font-body-md text-on-surface-variant">
              {loading ? "Cargando plantillas…" : `${filasTabla.length} de ${templates.length} plantillas`}
            </span>
            <BusquedaInput value={busqueda} onChange={setBusqueda} placeholder="Buscar plantilla…" className="w-72" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-outline-variant bg-surface-container-low/50 dark:border-transparent">
                  <th onClick={() => cambiarOrden("clave")} className={"whitespace-nowrap p-4 font-label-md " + (sortKey === "clave" ? "text-primary" : "text-on-surface-variant cursor-pointer select-none hover:text-on-surface")}>
                    Clave{sortKey === "clave" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                  </th>
                  <th onClick={() => cambiarOrden("tipo")} className={"p-4 font-label-md " + (sortKey === "tipo" ? "text-primary" : "text-on-surface-variant cursor-pointer select-none hover:text-on-surface")}>
                    Tipo{sortKey === "tipo" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                  </th>
                  <th onClick={() => cambiarOrden("nombre")} className={"p-4 font-label-md " + (sortKey === "nombre" ? "text-primary" : "text-on-surface-variant cursor-pointer select-none hover:text-on-surface")}>
                    Nombre{sortKey === "nombre" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                  </th>
                  <th className="p-4 font-label-md text-on-surface-variant">Versión publicada</th>
                  <th className="p-4 text-right font-label-md text-on-surface-variant">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/50">
                {filasTabla.map((t) => {
                  const versionList = versions[t.id] ?? [];
                  const v = versionList.find((version) => version.publicada) ?? null;
                  return (
                    <tr key={t.id} className="transition-colors hover:bg-surface-container-low/30">
                      <td className="p-4 font-mono-label text-primary">{t.id.slice(0, 8)}</td>
                      <td className="p-4">
                        <span className="inline-flex items-center rounded-full bg-surface-variant px-2.5 py-1 font-label-md text-on-surface-variant">
                          {TEMPLATE_LABEL[t.clave] ?? t.clave}
                        </span>
                      </td>
                      <td className="p-4 font-body-md font-semibold text-on-surface">{t.nombre}</td>
                      <td className="p-4">
                        {v ? (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-container-highest px-2.5 py-1 font-label-md text-primary">
                              v{v.version} · Publicada
                            </span>
                            {v.pdfFilename ? (
                              <button
                                onClick={() => descargarPdf(t, v)}
                                className="inline-flex items-center gap-1 rounded-full bg-surface-variant px-2.5 py-1 font-label-md text-on-surface-variant transition-colors hover:text-primary"
                                title={v.pdfFilename}
                              >
                                <FileText className="h-3.5 w-3.5" />
                                <span className="max-w-[160px] truncate">{v.pdfFilename}</span>
                                <Download className="h-3.5 w-3.5" />
                              </button>
                            ) : null}
                            {versionList.filter((version) => Boolean(version.contenido)).map((version) => (
                              <button
                                key={version.id}
                                onClick={async () => {
                                  const res = await apiFetch(`/api/templates/${t.id}/versions/${version.id}/html`);
                                  if (!res.ok) {
                                    setError("No se pudo descargar el HTML de la plantilla");
                                    return;
                                  }
                                  const blob = await res.blob();
                                  const url = URL.createObjectURL(blob);
                                  const a = document.createElement("a");
                                  a.href = url;
                                  a.download = `plantilla-v${version.version}.html`;
                                  document.body.appendChild(a);
                                  a.click();
                                  a.remove();
                                  URL.revokeObjectURL(url);
                                }}
                                className="inline-flex items-center gap-1 rounded-full bg-surface-variant px-2.5 py-1 font-label-md text-on-surface-variant transition-colors hover:text-primary"
                                title={`Descargar HTML v${version.version}`}
                              >
                                HTML v{version.version}
                                <Download className="h-3.5 w-3.5" />
                              </button>
                            ))}
                          </div>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-surface-variant px-2.5 py-1 font-label-md text-on-surface-variant">
                            Sin versión publicada
                          </span>
                        )}
                      </td>
                      <td className="p-4 text-right">
                        <button
                          onClick={() => setShowCreate({ template: t })}
                          className="rounded border border-outline-variant px-3 py-1 font-label-md text-on-surface-variant transition-colors hover:bg-surface-container hover:text-primary dark:border-transparent"
                        >
                          Nueva versión
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {!loading && templates.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center font-body-md text-on-surface-variant">
                      No hay plantillas registradas.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showCreate ? (
        <NewVersionModal
          template={showCreate.template}
          onClose={() => setShowCreate(null)}
          onCreated={async () => {
            setShowCreate(null);
            await load();
          }}
        />
      ) : null}
    </DashboardShell>
  );
}

function NewVersionModal({
  template,
  onClose,
  onCreated,
}: {
  template: TemplateApi;
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    if (!archivo) return;
    setSaving(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("archivo", archivo);
      const res = await apiFetch(`/api/templates/${template.id}/versions`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "No se pudo crear la versión");
      }
      await onCreated();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  const esPdf =
    archivo?.type === "application/pdf" || archivo?.name.toLowerCase().endsWith(".pdf");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-surface-container-lowest p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-headline-md text-on-surface">Nueva versión · {template.nombre}</h3>
          <button onClick={onClose} className="rounded p-1 text-on-surface-variant hover:bg-surface-container" aria-label="Cerrar">
            <X className="h-5 w-5" />
          </button>
        </div>

        <label className="mb-1 block font-label-md text-on-surface-variant">PDF del contrato</label>
        <input
          type="file"
          accept="application/pdf"
          onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
          className="block w-full cursor-pointer rounded border border-outline-variant bg-transparent p-3 font-body-sm text-on-surface file:mr-3 file:rounded file:border-0 file:bg-surface-variant file:px-3 file:py-1 file:font-label-md file:text-on-surface-variant dark:border-transparent"
        />
        {archivo && esPdf ? (
          <p className="mt-2 inline-flex items-center gap-1.5 font-body-sm text-primary">
            <FileText className="h-4 w-4" />
            {archivo.name} · {(archivo.size / 1024).toFixed(0)} KB
          </p>
        ) : null}
        {archivo && !esPdf ? (
          <p className="mt-2 font-body-sm text-destructive">El archivo debe ser un PDF</p>
        ) : null}

        <p className="mt-3 font-body-sm text-on-surface-variant">
          La versión quedará definida por este PDF. Las versiones publicadas no se editan.
        </p>

        {error ? (
          <p className="mt-4 font-body-sm text-destructive">{error}</p>
        ) : null}

        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="rounded border border-outline-variant px-4 py-2 font-label-md text-on-surface-variant dark:border-transparent">
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || !archivo || !esPdf}
            className="rounded bg-primary px-4 py-2 font-label-md text-on-primary disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? "Subiendo…" : "Crear versión"}
          </button>
        </div>
      </div>
    </div>
  );
}