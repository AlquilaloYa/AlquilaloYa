"use client";

import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { apiFetch } from "@/lib/api";
import { leerContactos, type ContactSeed } from "@/lib/contactos-seed";
import { FileText, ListChecks, Plus, Save, Download, Trash2, Upload, Eye, Printer } from "lucide-react";

type ChecklistTemplate = {
  id: string;
  nombre: string;
  html: string;
  createdAt: string;
};

const TEMPLATE_KEY = "sc_checklist_entrega_templates_v1";
const DEFAULT_TEMPLATE = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><style>
@page { size: A4; margin: 20mm; }
body { font-family: Arial, sans-serif; color: #111; line-height: 1.4; }
h1 { text-align: center; font-size: 18pt; }
h2 { margin-top: 24px; font-size: 13pt; border-bottom: 1px solid #999; padding-bottom: 4px; }
.dato { margin: 6px 0; }
li { margin-bottom: 6px; }
</style></head>
<body>
<h1>CHECKLIST DE ENTREGA</h1>
<h2>Datos del contacto</h2>
<p class="dato"><strong>Nombre:</strong> {{CONTACTO_NOMBRE_COMPLETO}}</p>
<p class="dato"><strong>DNI / CE:</strong> {{CONTACTO_DOCUMENTO}}</p>
<p class="dato"><strong>Domicilio:</strong> {{CONTACTO_DOMICILIO}}</p>
<p class="dato"><strong>Correo:</strong> {{CONTACTO_EMAIL}}</p>
<p class="dato"><strong>Teléfono:</strong> {{CONTACTO_TELEFONO}}</p>
<h2>Elementos entregados</h2>
<ul>{{CHECKLIST_ITEMS}}</ul>
</body></html>`;

function readTemplates(): ChecklistTemplate[] {
  try {
    const stored = localStorage.getItem(TEMPLATE_KEY);
    if (stored) return JSON.parse(stored) as ChecklistTemplate[];
  } catch {
    // Usa la plantilla inicial si el almacenamiento no es válido.
  }
  return [{ id: crypto.randomUUID(), nombre: "Checklist de entrega", html: DEFAULT_TEMPLATE, createdAt: new Date().toISOString() }];
}

export default function ChecklistPage() {
  const [contacts, setContacts] = useState<ContactSeed[]>([]);
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [contactId, setContactId] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [templateHtml, setTemplateHtml] = useState("");
  const [itemsText, setItemsText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfFilename, setPdfFilename] = useState("checklist-entrega.pdf");

  useEffect(() => {
    const loadedTemplates = readTemplates();
    setContacts(leerContactos());
    setTemplates(loadedTemplates);
    const first = loadedTemplates[0];
    if (first) {
      setTemplateId(first.id);
      setTemplateName(first.nombre);
      setTemplateHtml(first.html);
    }
  }, []);

  function persistTemplates(next: ChecklistTemplate[]) {
    setTemplates(next);
    localStorage.setItem(TEMPLATE_KEY, JSON.stringify(next));
  }

  function selectTemplate(id: string) {
    const template = templates.find((item) => item.id === id);
    if (!template) return;
    setTemplateId(id);
    setTemplateName(template.nombre);
    setTemplateHtml(template.html);
  }

  async function uploadTemplate(file: File | undefined) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".html") && file.type !== "text/html") {
      setMessage("La plantilla debe ser un archivo HTML");
      return;
    }
    const html = await file.text();
    setTemplateName(file.name.replace(/\.html?$/i, "") || "Checklist de entrega");
    setTemplateHtml(html);
    setMessage("Plantilla HTML cargada. Pulsa Guardar para conservarla.");
  }

  function saveTemplate() {
    const name = templateName.trim() || "Checklist sin nombre";
    const existing = templates.some((item) => item.id === templateId);
    const next = existing
      ? templates.map((item) => item.id === templateId ? { ...item, nombre: name, html: templateHtml } : item)
      : [...templates, { id: templateId || crypto.randomUUID(), nombre: name, html: templateHtml, createdAt: new Date().toISOString() }];
    const saved = next[next.length - 1];
    persistTemplates(next);
    if (!existing && saved) setTemplateId(saved.id);
    setMessage("Plantilla guardada");
  }

  function createTemplate() {
    const id = crypto.randomUUID();
    const template = { id, nombre: "Nueva checklist", html: DEFAULT_TEMPLATE, createdAt: new Date().toISOString() };
    persistTemplates([...templates, template]);
    selectTemplate(id);
    setTemplateId(id);
    setTemplateName(template.nombre);
    setTemplateHtml(template.html);
  }

  function deleteTemplate() {
    if (templates.length <= 1) return;
    const next = templates.filter((item) => item.id !== templateId);
    persistTemplates(next);
    const first = next[0];
    if (first) selectTemplate(first.id);
  }

  async function generatePdf() {
    const contact = contacts.find((item) => item.id === contactId);
    if (!contact) {
      setMessage("Selecciona un contacto");
      return;
    }
    if (!templateHtml.trim()) {
      setMessage("La plantilla no puede estar vacía");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const response = await apiFetch("/api/checklist/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateHtml,
          contact,
          selectedItems: itemsText.split(/\r?\n/).map((item) => item.trim()).filter(Boolean),
          filename: `checklist-entrega-${contact.nombre}-${contact.apellido}`,
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "No se pudo generar el PDF");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
      setPdfUrl(url);
      const generatedFilename = `checklist-entrega-${contact.nombre}-${contact.apellido}.pdf`;
      setPdfFilename(generatedFilename);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = generatedFilename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setMessage("PDF generado y descargado");
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <DashboardShell>
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex items-center gap-3">
          <ListChecks className="h-6 w-6 text-primary" />
          <div>
            <h2 className="font-headline-lg text-on-surface">checkList Entrega</h2>
            <p className="font-body-md text-on-surface-variant">Selecciona un contacto, completa una plantilla y genera su PDF.</p>
          </div>
        </div>

        {message ? <div className="rounded-md border border-primary/30 bg-primary/10 p-3 text-sm text-primary">{message}</div> : null}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <section className="rounded-xl bg-surface-container-lowest p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-2">
              <h3 className="font-headline-md text-on-surface">Plantillas de checklist</h3>
              <button type="button" onClick={createTemplate} className="inline-flex items-center gap-1 rounded border border-outline-variant px-2 py-1 text-sm text-primary hover:bg-surface-container"><Plus className="h-4 w-4" />Nueva</button>
            </div>
            <div className="space-y-2">
              {templates.map((template) => (
                <button key={template.id} type="button" onClick={() => selectTemplate(template.id)} className={`flex w-full items-center gap-2 rounded border px-3 py-2 text-left text-sm ${template.id === templateId ? "border-primary bg-primary/10 text-primary" : "border-outline-variant text-on-surface-variant"}`}>
                  <FileText className="h-4 w-4 shrink-0" />{template.nombre}
                </button>
              ))}
            </div>
            <div className="mt-5 space-y-2">
              <label className="block text-sm font-medium text-on-surface">Nombre de plantilla</label>
              <input value={templateName} onChange={(event) => setTemplateName(event.target.value)} className="h-10 w-full rounded border border-outline-variant bg-transparent px-3 text-sm" />
              <div className="flex gap-2">
                <label className="inline-flex cursor-pointer items-center gap-1 rounded border border-outline-variant px-3 py-2 text-sm text-on-surface-variant hover:bg-surface-container">
                  <Upload className="h-4 w-4" />Subir HTML
                  <input type="file" accept=".html,text/html" className="sr-only" onChange={(event) => { void uploadTemplate(event.target.files?.[0]); event.currentTarget.value = ""; }} />
                </label>
                <button type="button" onClick={saveTemplate} className="inline-flex items-center gap-1 rounded bg-primary px-3 py-2 text-sm text-on-primary"><Save className="h-4 w-4" />Guardar</button>
                <button type="button" onClick={deleteTemplate} disabled={templates.length <= 1} className="inline-flex items-center gap-1 rounded border border-outline-variant px-3 py-2 text-sm text-destructive disabled:opacity-40"><Trash2 className="h-4 w-4" />Eliminar</button>
              </div>
            </div>
          </section>

          <section className="rounded-xl bg-surface-container-lowest p-5 shadow-sm">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-on-surface">Contacto</label>
                <select value={contactId} onChange={(event) => setContactId(event.target.value)} className="h-10 w-full rounded border border-outline-variant bg-transparent px-3 text-sm">
                  <option value="">Seleccionar contacto...</option>
                  {contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.nombre} {contact.apellido} · {contact.dni}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-on-surface">Marcadores disponibles</label>
                <p className="text-xs text-on-surface-variant">
                  Usa <code>{"{{CONTACTO_NOMBRE_COMPLETO}}"}</code>, <code>{"{{CONTACTO_DOCUMENTO}}"}</code>, <code>{"{{CONTACTO_DOMICILIO}}"}</code> y <code>{"{{CHECKLIST_ITEMS}}"}</code>.
                </p>
              </div>
            </div>
            <label className="mt-4 block text-sm font-medium text-on-surface">Elementos de entrega, uno por línea</label>
            <textarea value={itemsText} onChange={(event) => setItemsText(event.target.value)} rows={5} className="mt-1 w-full rounded border border-outline-variant bg-transparent p-3 text-sm" placeholder="Llaves\nControl remoto\nInventario revisado" />
            <label className="mt-4 block text-sm font-medium text-on-surface">HTML de la plantilla</label>
            <textarea value={templateHtml} onChange={(event) => setTemplateHtml(event.target.value)} rows={18} className="mt-1 w-full rounded border border-outline-variant bg-[#101827] p-3 font-mono text-xs text-white" />
            <button type="button" onClick={generatePdf} disabled={busy} className="mt-4 inline-flex items-center gap-2 rounded bg-primary px-4 py-2 text-sm text-on-primary disabled:opacity-50"><Download className="h-4 w-4" />{busy ? "Generando PDF…" : "Generar y descargar PDF"}</button>
            {pdfUrl ? (
              <div className="mt-6 border-t border-outline-variant pt-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="font-headline-md text-on-surface">PDF generado</h3>
                    <p className="text-xs text-on-surface-variant">{pdfFilename}</p>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => window.open(pdfUrl, "_blank", "noopener,noreferrer")} className="inline-flex items-center gap-1 rounded border border-outline-variant px-3 py-2 text-sm text-primary hover:bg-surface-container"><Eye className="h-4 w-4" />Ver PDF</button>
                    <button type="button" onClick={() => window.open(pdfUrl, "_blank", "noopener,noreferrer")} className="inline-flex items-center gap-1 rounded border border-outline-variant px-3 py-2 text-sm text-primary hover:bg-surface-container"><Printer className="h-4 w-4" />Imprimir PDF</button>
                  </div>
                </div>
                <iframe title="Vista previa del PDF generado" src={pdfUrl} className="h-[560px] w-full rounded border border-outline-variant bg-white" />
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </DashboardShell>
  );
}
