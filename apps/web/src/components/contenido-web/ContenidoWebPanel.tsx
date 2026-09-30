"use client";

import { useCallback, useEffect, useState } from "react";
import { Globe, Plus, Settings2, X } from "lucide-react";
import { Button } from "./ui";
import { PropertyList } from "./PropertyList";
import { PropertyEditor } from "./PropertyEditor";
import { SiteSettingsEditor, type SiteSettingsEditorProps } from "./SiteSettingsEditor";
import { contenidoWebApi, type AdminProperty } from "@/lib/contenido-web-client";
import type { SiteSettings } from "@/lib/site-settings";

export type ContenidoWebErrorState = { message: string; statusCode?: number };

export function ContenidoWebPanel() {
  const [tab, setTab] = useState<"propiedades" | "sitio" | "config">("propiedades");
  const [selected, setSelected] = useState<AdminProperty | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [errors, setErrors] = useState<ContenidoWebErrorState[]>([]);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [customTags, setCustomTags] = useState<SiteSettings["advanced"]["custom_tags"]>([]);

  const pushError = useCallback((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    const hasStatus =
      error != null && typeof error === "object" && "statusCode" in error &&
      typeof (error as { statusCode?: unknown }).statusCode === "number";
    const entry = hasStatus
      ? { message, statusCode: (error as { statusCode: number }).statusCode }
      : { message };
    setErrors((current) => [...current, entry]);
  }, []);

  useEffect(() => {
    let active = true;
    contenidoWebApi.settings
      .get()
      .then((settings) => {
        if (!active) return;
        const tags = settings.advanced?.custom_tags;
        setCustomTags(Array.isArray(tags) ? tags as SiteSettings["advanced"]["custom_tags"] : []);
      })
      .catch(pushError);
    return () => {
      active = false;
    };
  }, [pushError]);

  function dismissError(index: number) {
    setErrors((current) => current.filter((_, i) => i !== index));
  }

  function openEditor(property: AdminProperty | null) {
    setSelected(property);
    setEditorOpen(true);
  }

  function handleSaved(property: AdminProperty) {
    setSelected(property);
    setLastSaved(property.property_code);
  }

  function handleSettingsSaved(settings: SiteSettings) {
    setCustomTags(settings.advanced.custom_tags);
    setLastSaved("configuración del sitio");
  }

  function handleDeleted(id?: number) {
    setEditorOpen(false);
    if (id === undefined || selected?.id === id) {
      setSelected(null);
    }
    setLastSaved("unidad eliminada");
  }

  const siteMode: SiteSettingsEditorProps["mode"] = tab === "config" ? "config" : "sitio";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Contenido web" className="inline-flex rounded-md border border-border bg-card p-1">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "propiedades"}
            onClick={() => setTab("propiedades")}
            className={`inline-flex h-8 items-center gap-2 rounded px-3 text-sm font-medium transition-colors ${
              tab === "propiedades" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Globe aria-hidden className="h-4 w-4" />
            Propiedades
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "sitio"}
            onClick={() => setTab("sitio")}
            className={`inline-flex h-8 items-center gap-2 rounded px-3 text-sm font-medium transition-colors ${
              tab === "sitio" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Sitio
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "config"}
            onClick={() => setTab("config")}
            className={`inline-flex h-8 items-center gap-2 rounded px-3 text-sm font-medium transition-colors ${
              tab === "config" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Settings2 aria-hidden className="h-4 w-4" />
            Config
          </button>
        </div>

        {tab === "propiedades" && !editorOpen && (
          <Button
            onClick={() => openEditor(null)}
            leadingIcon={<Plus aria-hidden className="h-4 w-4" />}
          >
            Nueva unidad
          </Button>
        )}
      </div>

      {errors.length > 0 && (
        <div className="space-y-2" role="alert">
          {errors.map((error, index) => (
            <div
              key={index}
              className="flex items-center justify-between gap-3 rounded-md border border-error/40 bg-error-container px-3 py-2 text-sm text-on-error-container"
            >
              <span>
                {error.message}{error.statusCode ? ` (HTTP ${error.statusCode})` : ""}
              </span>
              <button
                type="button"
                aria-label="Descartar error"
                onClick={() => dismissError(index)}
                className="rounded p-1 hover:bg-error/10"
              >
                <X aria-hidden className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {lastSaved && (
        <p className="rounded-md border border-primary/40 bg-primary-container px-3 py-2 text-sm text-on-primary-container">
          Guardado: {lastSaved}
        </p>
      )}

      {tab === "propiedades" && (
        <div className={editorOpen ? "" : "hidden"}>
          <PropertyEditor
            property={selected}
            customTags={customTags}
            onSaved={(property) => {
              handleSaved(property);
              setEditorOpen(false);
            }}
            onDeleted={handleDeleted}
            onError={pushError}
            onCancel={() => setEditorOpen(false)}
          />
        </div>
      )}

      {tab === "propiedades" && (
        <div className={editorOpen ? "hidden" : ""}>
          <PropertyList
            selectedId={selected?.id ?? null}
            onSelect={openEditor}
            onError={pushError}
            onUpdated={handleSaved}
            onDeleted={handleDeleted}
          />
        </div>
      )}

      {(tab === "sitio" || tab === "config") && (
        <SiteSettingsEditor
          mode={siteMode}
          onSaved={handleSettingsSaved}
          onError={pushError}
        />
      )}
    </div>
  );
}