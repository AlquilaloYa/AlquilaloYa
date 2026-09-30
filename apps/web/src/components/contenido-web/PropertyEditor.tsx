"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { Save, Trash2 } from "lucide-react";
import { Button, Card, Input, Select, TextArea, ToggleCheck } from "./ui";
import { ImageManager } from "./ImageManager";
import { contenidoWebApi } from "@/lib/contenido-web-client";
import type { AdminProperty, PropertyDraft, Zone } from "@/lib/contenido-web-client";
import type { SiteSettings } from "@/lib/site-settings";

const ZONES: Zone[] = ["Angamos", "Benavides"];

const AMENITIES: Array<{ key: keyof AdminProperty["amenities"]; label: string }> = [
  { key: "is_furnished", label: "Amoblado" },
  { key: "pets_allowed", label: "Apto mascotas" },
  { key: "ventana_externa", label: "Ventana externa" },
  { key: "ventanas_altas", label: "Ventanas altas (privacidad máxima)" },
  { key: "monoambiente", label: "Monoambientes" },
  { key: "mini_departamento", label: "Mini departamento" },
  { key: "mini_con_tendal", label: "Mini con tendal" },
];

const EMPTY_DRAFT: PropertyDraft = {
  property_code: "",
  title: "",
  address: "",
  zone: "Angamos",
  price: 0,
  expenses: 0,
  surface_m2: 20,
  google_maps_url: null,
  amenities: {
    is_furnished: false,
    pets_allowed: false,
    ventana_externa: false,
    ventanas_altas: false,
    monoambiente: false,
    mini_departamento: false,
    mini_con_tendal: false,
  },
  custom_tags: [],
  description: "",
  is_featured: false,
  is_active: true,
};

export interface PropertyEditorProps {
  property: AdminProperty | null;
  customTags: SiteSettings["advanced"]["custom_tags"];
  onSaved: (property: AdminProperty) => void;
  onDeleted: (id: number) => void;
  onError: (error: unknown) => void;
  onCancel: () => void;
}

function toDraft(property: AdminProperty): PropertyDraft {
  return {
    property_code: property.property_code,
    title: property.title,
    address: property.address,
    zone: property.zone,
    price: property.price,
    expenses: property.expenses,
    surface_m2: property.surface_m2,
    google_maps_url: property.google_maps_url,
    custom_tags: property.custom_tags ?? [],
    amenities: property.amenities,
    description: property.description,
    is_featured: property.is_featured,
    is_active: property.is_active,
  };
}

export function PropertyEditor({
  property,
  customTags,
  onSaved,
  onDeleted,
  onError,
  onCancel,
}: PropertyEditorProps) {
  const [draft, setDraft] = useState<PropertyDraft>(property ? toDraft(property) : EMPTY_DRAFT);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [syncedProperty, setSyncedProperty] = useState(property);
  if (property !== syncedProperty) {
    setSyncedProperty(property);
    setDraft(property ? toDraft(property) : EMPTY_DRAFT);
  }

  const isNew = property === null;

  function patch(changes: Partial<PropertyDraft>) {
    setDraft((current) => ({ ...current, ...changes }));
  }

  function patchAmenity(key: keyof AdminProperty["amenities"], value: boolean) {
    setDraft((current) => ({
      ...current,
      amenities: { ...current.amenities, [key]: value },
    }));
  }

  function patchCustomTag(key: string, checked: boolean) {
    const current = draft.custom_tags ?? [];
    patch({
      custom_tags: checked
        ? [...current, key]
        : current.filter((item) => item !== key),
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    try {
      const saved = property
        ? await contenidoWebApi.properties.update(property.id, draft)
        : await contenidoWebApi.properties.create(draft);
      onSaved(saved);
    } catch (error) {
      onError(error);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (!property) return;
    setIsDeleting(true);
    try {
      await contenidoWebApi.properties.remove(property.id);
      onDeleted(property.id);
    } catch (error) {
      onError(error);
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <form
      aria-labelledby="editor-title"
      className="space-y-4"
      onSubmit={handleSubmit}
      key={property?.id ?? "new"}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="editor-title" className="text-lg font-bold text-foreground">
          {isNew ? "Nueva unidad" : `Editar ${property.property_code}`}
        </h2>
        <Button variant="ghost" size="sm" onClick={onCancel} type="button">
          Cerrar
        </Button>
      </div>

      <Card className="grid gap-4 sm:grid-cols-2">
        {isNew && (
          <Input
            label="Código"
            required
            placeholder="MA-107"
            value={draft.property_code}
            onChange={(event) => patch({ property_code: event.target.value.toUpperCase() })}
            hint="Formato MA-### para Angamos o MB-### para Benavides"
          />
        )}

        <Input
          label="Título"
          required
          value={draft.title}
          onChange={(event) => patch({ title: event.target.value })}
        />

        <Input
          label="Dirección"
          placeholder="Av. Angamos 170 Este, Miraflores"
          value={draft.address}
          onChange={(event) => patch({ address: event.target.value })}
          hint="Se usa en la ficha y en el SEO local"
        />

        <Select
          label="Zona"
          value={draft.zone}
          onChange={(event) => patch({ zone: event.target.value as Zone })}
        >
          {ZONES.map((zone) => (
            <option key={zone} value={zone}>
              {zone}
            </option>
          ))}
        </Select>

        <Input
          label="Precio (S/)"
          type="number"
          min={1}
          required
          value={draft.price}
          onChange={(event) => patch({ price: Number(event.target.value) })}
        />

        <Input
          label="Mantenimiento (S/)"
          type="number"
          min={0}
          value={draft.expenses}
          onChange={(event) => patch({ expenses: Number(event.target.value) })}
        />

        <Input
          label="URL de Google Maps"
          type="url"
          placeholder="https://maps.app.goo.gl/…"
          value={draft.google_maps_url ?? ""}
          onChange={(event) => patch({ google_maps_url: event.target.value.trim() || null })}
          hint="Abre Google Maps, ubica la dirección exacta y pega el enlace (Compartir → Copiar enlace)"
        />

        <ToggleCheck
          checked={draft.is_featured}
          label="Destacada en el catálogo"
          onChange={(checked) => patch({ is_featured: checked })}
        />

        <ToggleCheck
          checked={draft.is_active}
          label="Publicada"
          onChange={(checked) => patch({ is_active: checked })}
        />
      </Card>

      <Card title="Amenidades">
        <div className="flex flex-wrap gap-4">
          {AMENITIES.map(({ key, label }) => (
            <ToggleCheck
              key={key}
              checked={draft.amenities[key]}
              label={label}
              onChange={(checked) => patchAmenity(key, checked)}
            />
          ))}
        </div>

        {customTags.length > 0 && (
          <div className="mt-4 border-t border-border pt-3">
            <h4 className="text-xs font-semibold uppercase text-muted-foreground">
              Etiquetas adicionales
            </h4>
            <div className="mt-2 flex flex-wrap gap-4">
              {customTags.map(({ key, label }) => (
                <ToggleCheck
                  key={key}
                  checked={(draft.custom_tags ?? []).includes(key)}
                  label={label}
                  onChange={(checked) => patchCustomTag(key, checked)}
                />
              ))}
            </div>
          </div>
        )}

        <TextArea
          id="description"
          label="Descripción"
          rows={4}
          required
          value={draft.description}
          onChange={(event) => patch({ description: event.target.value })}
        />
      </Card>

      {property && <ImageManager property={property} onChange={onSaved} onError={onError} />}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="submit"
          isLoading={isSaving}
          leadingIcon={<Save aria-hidden className="h-4 w-4" />}
        >
          {isNew ? "Crear unidad" : "Guardar cambios"}
        </Button>

        {property && (
          <Button
            type="button"
            variant="danger"
            isLoading={isDeleting}
            leadingIcon={<Trash2 aria-hidden className="h-4 w-4" />}
            onClick={() => void handleDelete()}
          >
            Eliminar unidad
          </Button>
        )}
      </div>
    </form>
  );
}