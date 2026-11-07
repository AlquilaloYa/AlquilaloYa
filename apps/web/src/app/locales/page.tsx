"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { TableScroll } from "@/components/table-scroll";
import { apiFetch } from "@/lib/api";
import { compressLocalUpload } from "@/lib/locales-files";
import { LOCAL_CODES } from "@contract/domain/locales";
import { Pencil, Plus, RefreshCw, Upload, X } from "lucide-react";

type LocalRecord = {
  id: string;
  codigo: string;
  sede: string;
  nombre: string;
  areaM2: string;
  precioAlquiler: string;
  garantia: string;
  mantenimiento: string;
  servicios: string;
  pagoLuzPorcentaje: string;
};

type LocalFile = {
  id: string;
  nombre: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  url: string;
};

type LocalForm = Omit<LocalRecord, "id" | "sede">;

const EMPTY_FORM: LocalForm = {
  codigo: "",
  nombre: "",
  areaM2: "",
  precioAlquiler: "",
  garantia: "",
  mantenimiento: "",
  servicios: "",
  pagoLuzPorcentaje: "0",
};

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const ACCEPTED_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function formatoDinero(value: string) {
  return `S/ ${Number(value || 0).toLocaleString("es-PE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatoBytes(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export default function LocalesPage() {
  const [locales, setLocales] = useState<LocalRecord[]>([]);
  const [files, setFiles] = useState<LocalFile[]>([]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [form, setForm] = useState<LocalForm>(EMPTY_FORM);
  const [editing, setEditing] = useState<LocalRecord | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const loadLocales = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiFetch("/api/locales");
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "No se pudieron cargar los locales.");
      }
      setLocales((await response.json()) as LocalRecord[]);
      setError(null);
    } catch (loadError) {
      setError((loadError as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLocales();
  }, [loadLocales]);

  const usedCodes = useMemo(
    () => new Set(locales.filter((local) => local.id !== editing?.id).map((local) => local.codigo)),
    [editing?.id, locales],
  );
  const availableCodes = LOCAL_CODES.filter((item) => !usedCodes.has(item.codigo));
  const filtered = locales.filter((local) =>
    `${local.codigo} ${local.sede} ${local.nombre}`.toLowerCase().includes(query.toLowerCase()),
  );

  async function loadFiles(localId: string) {
    const response = await apiFetch(`/api/locales/${localId}/archivos`);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error ?? "No se pudieron cargar los archivos.");
    }
    setFiles((await response.json()) as LocalFile[]);
  }

  async function openEditor(local: LocalRecord | null) {
    setError(null);
    setEditing(local);
    setPendingFiles([]);
    setFiles([]);
    setForm(
      local
        ? {
            codigo: local.codigo,
            nombre: local.nombre,
            areaM2: local.areaM2,
            precioAlquiler: local.precioAlquiler,
            garantia: local.garantia,
            mantenimiento: local.mantenimiento,
            servicios: local.servicios,
            pagoLuzPorcentaje: local.pagoLuzPorcentaje,
          }
        : { ...EMPTY_FORM, codigo: availableCodes[0]?.codigo ?? "" },
    );
    setIsOpen(true);
    if (local) {
      try {
        await loadFiles(local.id);
      } catch (loadError) {
        setError((loadError as Error).message);
      }
    }
  }

  function closeEditor() {
    setIsOpen(false);
    setEditing(null);
    setFiles([]);
    setPendingFiles([]);
  }

  function chooseFiles(selected: FileList | null) {
    if (!selected) return;
    const chosen = Array.from(selected);
    const invalid = chosen.find((file) => !ACCEPTED_TYPES.has(file.type));
    if (invalid) {
      setError(`${invalid.name}: solo se admiten PDF, JPG, PNG y WebP.`);
      return;
    }
    const oversized = chosen.find((file) => file.size > 25 * 1024 * 1024);
    if (oversized) {
      setError(`${oversized.name}: el archivo original no puede superar 25 MB.`);
      return;
    }
    setError(null);
    setPendingFiles((current) => [...current, ...chosen]);
  }

  async function saveLocal(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        ...form,
        areaM2: Number(form.areaM2),
        precioAlquiler: Number(form.precioAlquiler),
        garantia: Number(form.garantia),
        mantenimiento: Number(form.mantenimiento),
        pagoLuzPorcentaje: Number(form.pagoLuzPorcentaje),
      };
      const response = await apiFetch(
        editing ? `/api/locales/${editing.id}` : "/api/locales",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "No se pudo guardar el local.");
      }
      const saved = (await response.json()) as LocalRecord;
      setEditing(saved);

      const failedFiles: File[] = [];
      const uploadErrors: string[] = [];
      for (const original of pendingFiles) {
        try {
          const compressed = await compressLocalUpload(original);
          if (compressed.size > MAX_UPLOAD_BYTES) {
            throw new Error("supera el límite de 8 MB después de comprimir");
          }
          const data = new FormData();
          data.append("file", compressed);
          const upload = await apiFetch(`/api/locales/${saved.id}/archivos`, {
            method: "POST",
            body: data,
          });
          if (!upload.ok) {
            const body = await upload.json().catch(() => ({}));
            throw new Error(body.error ?? `Error HTTP ${upload.status}`);
          }
        } catch (uploadError) {
          failedFiles.push(original);
          uploadErrors.push(`${original.name}: ${(uploadError as Error).message}`);
        }
      }
      setPendingFiles(failedFiles);
      await loadLocales();
      try {
        await loadFiles(saved.id);
      } catch (loadError) {
        uploadErrors.push((loadError as Error).message);
      }
      if (uploadErrors.length > 0) {
        setError(`El local se guardó, pero hubo problemas con los archivos: ${uploadErrors.join("; ")}`);
        return;
      }
      closeEditor();
    } catch (saveError) {
      setError((saveError as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <DashboardShell>
      <div className="space-y-5 p-4 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Locales comerciales</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Benavides y Angamos · archivos privados comprimidos antes de guardarse.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void loadLocales()}
              disabled={loading}
              className="inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Actualizar
            </button>
            <button
              type="button"
              onClick={() => void openEditor(null)}
              disabled={availableCodes.length === 0}
              className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm text-primary-foreground disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              Nuevo local
            </button>
          </div>
        </div>

        {error && !isOpen ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-3 rounded-lg bg-card p-3 shadow-sm">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por código, sede o nombre…"
            className="h-10 w-full max-w-md rounded-md border bg-background px-3 text-sm"
          />
          <span className="text-sm text-muted-foreground">{locales.length} de 6 locales</span>
        </div>

        {loading ? (
          <p className="p-8 text-center text-sm text-muted-foreground">Cargando locales…</p>
        ) : filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed p-10 text-center">
            <p className="font-medium">
              {locales.length === 0 ? "Aún no hay locales registrados." : "No se encontraron locales."}
            </p>
            {locales.length === 0 ? (
              <p className="mt-1 text-sm text-muted-foreground">
                Registra los locales con su código BEN2195-A1–A3 o ANG170-A1–A3.
              </p>
            ) : null}
          </div>
        ) : (
          <TableScroll className="rounded-lg border bg-card">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="border-b bg-muted/40">
                <tr>
                  {["Código", "Sede", "Nombre", "Área", "Alquiler", "Garantía", "Mantenimiento", "Pago luz"].map((heading) => (
                    <th key={heading} className="whitespace-nowrap px-4 py-3 font-medium">{heading}</th>
                  ))}
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((local) => (
                  <tr key={local.id} className="border-b last:border-0">
                    <td className="whitespace-nowrap px-4 py-3 font-medium">{local.codigo}</td>
                    <td className="px-4 py-3">{local.sede}</td>
                    <td className="px-4 py-3">{local.nombre}</td>
                    <td className="px-4 py-3">{local.areaM2} m²</td>
                    <td className="whitespace-nowrap px-4 py-3">{formatoDinero(local.precioAlquiler)}</td>
                    <td className="whitespace-nowrap px-4 py-3">{formatoDinero(local.garantia)}</td>
                    <td className="whitespace-nowrap px-4 py-3">{formatoDinero(local.mantenimiento)}</td>
                    <td className="px-4 py-3">{local.pagoLuzPorcentaje}%</td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => void openEditor(local)}
                        className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
      </div>

      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form
            onSubmit={(event) => void saveLocal(event)}
            className="max-h-[95vh] w-full max-w-3xl space-y-4 overflow-y-auto rounded-xl bg-background p-5 shadow-xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">{editing ? "Editar local" : "Nuevo local"}</h2>
                <p className="text-sm text-muted-foreground">
                  Los documentos se guardan en almacenamiento privado, no en la tabla de datos.
                </p>
              </div>
              <button type="button" onClick={closeEditor} disabled={saving} aria-label="Cerrar">
                <X className="h-5 w-5" />
              </button>
            </div>

            {error ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                {error}
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span>Código del local</span>
                <select
                  required
                  value={form.codigo}
                  onChange={(event) => setForm((prev) => ({ ...prev, codigo: event.target.value }))}
                  className="h-10 w-full rounded-md border bg-background px-3"
                >
                  <option value="" disabled>Selecciona un código</option>
                  {availableCodes.map((item) => (
                    <option key={item.codigo} value={item.codigo}>{item.codigo} · {item.sede}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-sm">
                <span>Nombre comercial</span>
                <input required minLength={2} maxLength={255} value={form.nombre} onChange={(event) => setForm((prev) => ({ ...prev, nombre: event.target.value }))} className="h-10 w-full rounded-md border bg-background px-3" />
              </label>
              <label className="space-y-1 text-sm">
                <span>Área (m²)</span>
                <input required type="number" min="0" step="0.01" value={form.areaM2} onChange={(event) => setForm((prev) => ({ ...prev, areaM2: event.target.value }))} className="h-10 w-full rounded-md border bg-background px-3" />
              </label>
              <label className="space-y-1 text-sm">
                <span>Precio de alquiler (S/)</span>
                <input required type="number" min="0" step="0.01" value={form.precioAlquiler} onChange={(event) => setForm((prev) => ({ ...prev, precioAlquiler: event.target.value }))} className="h-10 w-full rounded-md border bg-background px-3" />
              </label>
              <label className="space-y-1 text-sm">
                <span>Garantía (S/)</span>
                <input required type="number" min="0" step="0.01" value={form.garantia} onChange={(event) => setForm((prev) => ({ ...prev, garantia: event.target.value }))} className="h-10 w-full rounded-md border bg-background px-3" />
              </label>
              <label className="space-y-1 text-sm">
                <span>Mantenimiento (S/)</span>
                <input required type="number" min="0" step="0.01" value={form.mantenimiento} onChange={(event) => setForm((prev) => ({ ...prev, mantenimiento: event.target.value }))} className="h-10 w-full rounded-md border bg-background px-3" />
              </label>
              <label className="space-y-1 text-sm">
                <span>Pago de luz (%)</span>
                <input required type="number" min="0" max="100" step="0.01" value={form.pagoLuzPorcentaje} onChange={(event) => setForm((prev) => ({ ...prev, pagoLuzPorcentaje: event.target.value }))} className="h-10 w-full rounded-md border bg-background px-3" />
              </label>
              <label className="space-y-1 text-sm sm:col-span-2">
                <span>Servicios</span>
                <textarea maxLength={2000} rows={2} value={form.servicios} onChange={(event) => setForm((prev) => ({ ...prev, servicios: event.target.value }))} className="w-full rounded-md border bg-background px-3 py-2" />
              </label>
            </div>

            <section className="space-y-2 border-t pt-4">
              <div>
                <h3 className="font-medium">Fotos y documentos</h3>
                <p className="text-xs text-muted-foreground">
                  JPG, PNG y WebP se convierten a WebP de hasta 1600 px y calidad 75 si reduce el tamaño. Los PDF se optimizan sin rasterizar; si no se pueden reducir de forma segura, se conserva el original. Máximo 8 MB por archivo comprimido.
                </p>
              </div>
              <label className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted/40">
                <Upload className="h-4 w-4" />
                Seleccionar archivos
                <input
                  type="file"
                  multiple
                  accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
                  className="sr-only"
                  onChange={(event) => {
                    chooseFiles(event.target.files);
                    event.currentTarget.value = "";
                  }}
                />
              </label>
              {pendingFiles.length > 0 ? (
                <ul className="space-y-1 text-sm">
                  {pendingFiles.map((file, index) => (
                    <li key={`${file.name}-${file.lastModified}-${index}`} className="flex items-center justify-between gap-3">
                      <span className="truncate">{file.name} · {formatoBytes(file.size)}</span>
                      <button
                        type="button"
                        onClick={() => setPendingFiles((prev) => prev.filter((_, fileIndex) => fileIndex !== index))}
                        aria-label={`Quitar ${file.name}`}
                        className="rounded p-1 hover:bg-muted"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              {files.length > 0 ? (
                <ul className="space-y-1 text-sm">
                  {files.map((file) => (
                    <li key={file.id} className="flex items-center justify-between gap-3">
                      <span className="truncate">{file.nombre} · {formatoBytes(file.sizeBytes)}</span>
                      <a href={file.url} target="_blank" rel="noreferrer" className="shrink-0 text-primary underline">
                        Abrir
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>

            <div className="flex justify-end gap-2 border-t pt-4">
              <button type="button" onClick={closeEditor} disabled={saving} className="rounded-md border px-4 py-2 text-sm">
                Cancelar
              </button>
              <button type="submit" disabled={saving || !form.codigo} className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50">
                {saving ? "Guardando…" : editing ? "Guardar cambios" : "Crear local"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </DashboardShell>
  );
}
