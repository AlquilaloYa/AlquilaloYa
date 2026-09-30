"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { Button, Card, Input, TextArea } from "./ui";
import { contenidoWebApi } from "@/lib/contenido-web-client";
import { DEFAULT_SITE_SETTINGS, normalizeSettings } from "@/lib/site-settings";
import type { SiteSettings } from "@/lib/site-settings";

export interface SiteSettingsEditorProps {
  mode: "sitio" | "config";
  onSaved: (settings: SiteSettings) => void;
  onError: (error: unknown) => void;
}

export function SiteSettingsEditor({ mode, onSaved, onError }: SiteSettingsEditorProps) {
  const [settings, setSettings] = useState<SiteSettings>(DEFAULT_SITE_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [newTagLabel, setNewTagLabel] = useState("");

  useEffect(() => {
    let active = true;
    contenidoWebApi.settings
      .get()
      .then((raw) => {
        if (!active) return;
        setSettings(normalizeSettings(raw));
      })
      .catch((error) => {
        if (active) onError(error);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [onError]);

  function patchSection<K extends keyof SiteSettings>(key: K, section: SiteSettings[K]) {
    setSettings((current) => ({ ...current, [key]: section }));
  }

  function addCustomTag() {
    const label = newTagLabel.trim();
    const key = label
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    if (!label || !key || settings.advanced.custom_tags.some((tag) => tag.key === key)) return;
    patchSection("advanced", {
      ...settings.advanced,
      custom_tags: [...settings.advanced.custom_tags, { key, label }],
    });
    setNewTagLabel("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    try {
      const updated = await contenidoWebApi.settings.update({
        hero: settings.hero,
        about: settings.about,
        contact: settings.contact,
        seo: settings.seo,
        advanced: settings.advanced,
      });
      const normalized = normalizeSettings(updated);
      setSettings(normalized);
      onSaved(normalized);
    } catch (error) {
      onError(error);
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Cargando configuración del sitio…</p>;
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      {mode === "sitio" && (
        <Card title="Hero · Portada">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Eyebrow"
            value={settings.hero.eyebrow}
            onChange={(event) =>
              patchSection("hero", { ...settings.hero, eyebrow: event.target.value })
            }
          />
          <Input
            label="Imagen de fondo (URL)"
            placeholder="https://…"
            value={settings.hero.background_image}
            onChange={(event) =>
              patchSection("hero", { ...settings.hero, background_image: event.target.value })
            }
          />
        </div>
        <div className="mt-4 space-y-4">
          <TextArea
            label="Título"
            rows={2}
            value={settings.hero.title}
            onChange={(event) =>
              patchSection("hero", { ...settings.hero, title: event.target.value })
            }
          />
          <TextArea
            label="Subtítulo"
            rows={3}
            value={settings.hero.subtitle}
            onChange={(event) =>
              patchSection("hero", { ...settings.hero, subtitle: event.target.value })
            }
          />
        </div>
      </Card>
      )}

      {mode === "sitio" && (
        <>
      <Card title="Sobre Nosotros">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Título"
            value={settings.about.title}
            onChange={(event) =>
              patchSection("about", { ...settings.about, title: event.target.value })
            }
          />
          <Input
            label="Subtítulo"
            value={settings.about.subtitle}
            onChange={(event) =>
              patchSection("about", { ...settings.about, subtitle: event.target.value })
            }
          />
        </div>
        <div className="mt-4 space-y-4">
          <TextArea
            label="Encabezado"
            rows={2}
            value={settings.about.heading}
            onChange={(event) =>
              patchSection("about", { ...settings.about, heading: event.target.value })
            }
          />
          <TextArea
            label="Párrafo"
            rows={4}
            value={settings.about.paragraph}
            onChange={(event) =>
              patchSection("about", { ...settings.about, paragraph: event.target.value })
            }
          />
        </div>

        <h4 className="mt-5 text-sm font-semibold text-foreground">Valores</h4>
        <ul className="mt-2 space-y-3">
          {settings.about.values.map((value, index) => (
            <li key={index} className="flex flex-wrap items-start gap-3 rounded-md border border-border p-3">
              <div className="grid flex-1 gap-3 sm:grid-cols-2">
                <Input
                  aria-label={`Título del valor ${index + 1}`}
                  value={value.title}
                  onChange={(event) => {
                    const values = settings.about.values.map((v, i) =>
                      i === index ? { title: event.target.value, description: v.description } : v
                    );
                    patchSection("about", { ...settings.about, values });
                  }}
                />
                <Input
                  aria-label={`Descripción del valor ${index + 1}`}
                  value={value.description}
                  onChange={(event) => {
                    const values = settings.about.values.map((v, i) =>
                      i === index ? { title: v.title, description: event.target.value } : v
                    );
                    patchSection("about", { ...settings.about, values });
                  }}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Eliminar valor ${index + 1}`}
                onClick={() =>
                  patchSection("about", {
                    ...settings.about,
                    values: settings.about.values.filter((_, i) => i !== index),
                  })
                }
              >
                <Trash2 aria-hidden className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="mt-3"
          onClick={() =>
            patchSection("about", {
              ...settings.about,
              values: [...settings.about.values, { title: "", description: "" }],
            })
          }
          leadingIcon={<Plus aria-hidden className="h-4 w-4" />}
        >
          Agregar valor
        </Button>

        <h4 className="mt-5 text-sm font-semibold text-foreground">Métricas</h4>
        <ul className="mt-2 space-y-3">
          {settings.about.metrics.map((metric, index) => (
            <li key={index} className="flex flex-wrap items-start gap-3 rounded-md border border-border p-3">
              <div className="grid flex-1 gap-3 sm:grid-cols-2">
                <Input
                  aria-label={`Valor de la métrica ${index + 1}`}
                  value={metric.value}
                  onChange={(event) => {
                    const metrics = settings.about.metrics.map((m, i) =>
                      i === index ? { value: event.target.value, label: m.label } : m
                    );
                    patchSection("about", { ...settings.about, metrics });
                  }}
                />
                <Input
                  aria-label={`Etiqueta de la métrica ${index + 1}`}
                  value={metric.label}
                  onChange={(event) => {
                    const metrics = settings.about.metrics.map((m, i) =>
                      i === index ? { value: m.value, label: event.target.value } : m
                    );
                    patchSection("about", { ...settings.about, metrics });
                  }}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Eliminar métrica ${index + 1}`}
                onClick={() =>
                  patchSection("about", {
                    ...settings.about,
                    metrics: settings.about.metrics.filter((_, i) => i !== index),
                  })
                }
              >
                <Trash2 aria-hidden className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="mt-3"
          onClick={() =>
            patchSection("about", {
              ...settings.about,
              metrics: [...settings.about.metrics, { value: "", label: "" }],
            })
          }
          leadingIcon={<Plus aria-hidden className="h-4 w-4" />}
        >
          Agregar métrica
        </Button>
      </Card>

      <Card title="Contacto">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="WhatsApp (código de país + número)"
            placeholder="51924000000"
            value={settings.contact.whatsapp}
            onChange={(event) =>
              patchSection("contact", { ...settings.contact, whatsapp: event.target.value })
            }
          />
          <Input
            label="Mensaje de WhatsApp"
            value={settings.contact.whatsapp_message}
            onChange={(event) =>
              patchSection("contact", { ...settings.contact, whatsapp_message: event.target.value })
            }
          />
          <Input
            label="Email"
            type="email"
            value={settings.contact.email}
            onChange={(event) =>
              patchSection("contact", { ...settings.contact, email: event.target.value })
            }
          />
          <Input
            label="Teléfono (display)"
            value={settings.contact.phone_display}
            onChange={(event) =>
              patchSection("contact", { ...settings.contact, phone_display: event.target.value })
            }
          />
          <Input
            label="Dirección"
            value={settings.contact.address}
            onChange={(event) =>
              patchSection("contact", { ...settings.contact, address: event.target.value })
            }
          />
          <Input
            label="Horario"
            value={settings.contact.schedule}
            onChange={(event) =>
              patchSection("contact", { ...settings.contact, schedule: event.target.value })
            }
          />
        </div>
      </Card>

      <Card title="SEO">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Nombre del sitio"
            value={settings.seo.site_name}
            onChange={(event) => patchSection("seo", { ...settings.seo, site_name: event.target.value })}
          />
          <Input
            label="URL del sitio"
            value={settings.seo.site_url}
            onChange={(event) => patchSection("seo", { ...settings.seo, site_url: event.target.value })}
          />
        </div>
        <div className="mt-4">
          <TextArea
            label="Título SEO"
            rows={2}
            value={settings.seo.title}
            onChange={(event) => patchSection("seo", { ...settings.seo, title: event.target.value })}
          />
        </div>
        <div className="mt-4">
          <TextArea
            label="Meta descripción"
            rows={3}
            value={settings.seo.description}
            onChange={(event) =>
              patchSection("seo", { ...settings.seo, description: event.target.value })
            }
          />
        </div>
      </Card>
        </>
      )}

      {mode === "config" && (
      <Card title="Configuración avanzada">
        <div className="grid gap-4 sm:grid-cols-3">
          <Input
            label="Precio mínimo (S/)"
            type="number"
            min={0}
            value={settings.advanced.price_min}
            onChange={(event) =>
              patchSection("advanced", {
                ...settings.advanced,
                price_min: Number(event.target.value),
              })
            }
          />
          <Input
            label="Precio máximo (S/)"
            type="number"
            min={0}
            value={settings.advanced.max_price}
            onChange={(event) =>
              patchSection("advanced", {
                ...settings.advanced,
                max_price: Number(event.target.value),
              })
            }
          />
          <Input
            label="Paso de precio (S/)"
            type="number"
            min={1}
            value={settings.advanced.price_step}
            onChange={(event) =>
              patchSection("advanced", {
                ...settings.advanced,
                price_step: Number(event.target.value),
              })
            }
          />
        </div>

        <h4 className="mt-5 text-sm font-semibold text-foreground">Zonas</h4>
        <ul className="mt-2 space-y-3">
          {settings.advanced.zones.map((zone, index) => (
            <li key={zone.slug} className="grid gap-3 rounded-md border border-border p-3 sm:grid-cols-2">
              <Input aria-label={`Zona ${index + 1}`} value={zone.label} disabled />
              <Input
                aria-label={`Dirección de la zona ${zone.slug}`}
                value={zone.address}
                onChange={(event) => {
                  const zones = settings.advanced.zones.map((z, i) =>
                    i === index ? { slug: z.slug, label: z.label, address: event.target.value } : z
                  );
                  patchSection("advanced", { ...settings.advanced, zones });
                }}
              />
            </li>
          ))}
        </ul>

        <h4 className="mt-5 text-sm font-semibold text-foreground">Etiquetas de amenidades</h4>
        <ul className="mt-2 space-y-2">
          {settings.advanced.amenities.map((amenity, index) => (
            <li key={amenity.key} className="flex flex-wrap items-center gap-3 rounded-md border border-border p-3">
              <code className="text-xs text-muted-foreground">{amenity.key}</code>
              <div className="flex-1">
                <Input
                  aria-label={`Etiqueta de ${amenity.key}`}
                  value={amenity.label}
                  onChange={(event) => {
                    const amenities = settings.advanced.amenities.map((a, i) =>
                      i === index ? { key: a.key, label: event.target.value } : a
                    );
                    patchSection("advanced", { ...settings.advanced, amenities });
                  }}
                />
              </div>
            </li>
          ))}
        </ul>

        <h4 className="mt-5 text-sm font-semibold text-foreground">Etiquetas personalizadas</h4>
        <div className="mt-2 flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1">
            <Input
              label="Nueva etiqueta"
              maxLength={80}
              placeholder="Ej. Balcón privado"
              value={newTagLabel}
              onChange={(event) => setNewTagLabel(event.target.value)}
            />
          </div>
          <Button
            type="button"
            variant="secondary"
            disabled={!newTagLabel.trim() || settings.advanced.custom_tags.length >= 30}
            onClick={addCustomTag}
            leadingIcon={<Plus aria-hidden className="h-4 w-4" />}
          >
            Añadir etiqueta
          </Button>
        </div>
        <ul className="mt-2 space-y-2">
          {settings.advanced.custom_tags.map((tag) => (
            <li key={tag.key} className="flex items-center gap-3 rounded-md border border-border p-3">
              <code className="text-xs text-muted-foreground">{tag.key}</code>
              <span className="min-w-0 flex-1 text-sm">{tag.label}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Eliminar etiqueta ${tag.label}`}
                onClick={() =>
                  patchSection("advanced", {
                    ...settings.advanced,
                    custom_tags: settings.advanced.custom_tags.filter((item) => item.key !== tag.key),
                  })
                }
              >
                <Trash2 aria-hidden className="h-4 w-4" />
              </Button>
            </li>
          ))}
          {settings.advanced.custom_tags.length === 0 && (
            <li className="py-3 text-sm text-muted-foreground">No hay etiquetas personalizadas.</li>
          )}
        </ul>
      </Card>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="submit"
          isLoading={isSaving}
          leadingIcon={<Save aria-hidden className="h-4 w-4" />}
        >
          Guardar configuración del sitio
        </Button>
      </div>
    </form>
  );
}