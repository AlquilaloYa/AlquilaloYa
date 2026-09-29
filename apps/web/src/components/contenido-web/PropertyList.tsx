"use client";

import { useEffect, useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import { Button, Card, Input, Select } from "./ui";
import { contenidoWebApi, formatPrice } from "@/lib/contenido-web-client";
import type { AdminProperty, Zone } from "@/lib/contenido-web-client";

export interface PropertyListProps {
  selectedId: number | null;
  onSelect: (property: AdminProperty) => void;
  onError: (error: unknown) => void;
  onUpdated: (property: AdminProperty) => void;
}

export function PropertyList({ selectedId, onSelect, onError, onUpdated }: PropertyListProps) {
  const [properties, setProperties] = useState<AdminProperty[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [zone, setZone] = useState<Zone | "all">("all");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");

  async function load() {
    setIsLoading(true);
    try {
      setProperties(await contenidoWebApi.properties.list({ search, zone, status }));
    } catch (error) {
      onError(error);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // Los filtros se aplican volviendo a pedir la lista; el cargador es estable.
  }, [search, zone, status]);

  async function toggle(property: AdminProperty, changes: Partial<AdminProperty>) {
    try {
      const updated = await contenidoWebApi.properties.update(property.id, changes);
      setProperties((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      onUpdated(updated);
    } catch (error) {
      onError(error);
    }
  }

  const totalProps = properties.length;

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">Unidades ({totalProps})</h2>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void load()}
          leadingIcon={<RefreshCw aria-hidden className="h-4 w-4" />}
        >
          Recargar
        </Button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Input
          label="Buscar"
          placeholder="Código, título o dirección"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <Select label="Zona" value={zone} onChange={(event) => setZone(event.target.value as Zone | "all")}>
          <option value="all">Todas</option>
          <option value="Angamos">Angamos</option>
          <option value="Benavides">Benavides</option>
        </Select>
        <Select
          label="Estado"
          value={status}
          onChange={(event) => setStatus(event.target.value as "all" | "active" | "inactive")}
        >
          <option value="all">Todas</option>
          <option value="active">Publicadas</option>
          <option value="inactive">Ocultas</option>
        </Select>
      </div>

      {isLoading && <p className="mt-4 text-sm text-muted-foreground">Cargando unidades…</p>}

      {!isLoading && properties.length === 0 && (
        <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Plus aria-hidden className="h-4 w-4" />
          No hay unidades que coincidan con el filtro.
        </p>
      )}

      <ul className="mt-4 space-y-2">
        {properties.map((property) => (
          <li key={property.id}>
            <div
              className={`flex flex-wrap items-center gap-3 rounded-md border p-2 ${
                property.id === selectedId ? "border-primary bg-primary-container/40" : "border-border"
              }`}
            >
              <img
                src={property.images[0]?.url ?? ""}
                alt=""
                width={56}
                height={42}
                className="h-10 w-14 shrink-0 rounded bg-surface-variant object-cover"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">
                  {property.property_code} · {property.title}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {property.address || "Sin dirección"} · {formatPrice(property.price)} ·{" "}
                  {property.images.length} foto{property.images.length === 1 ? "" : "s"}
                </p>
              </div>
              <Button variant="secondary" size="sm" onClick={() => onSelect(property)}>
                Editar
              </Button>
              <Button
                variant="ghost"
                size="sm"
                aria-pressed={property.is_active}
                onClick={() => void toggle(property, { is_active: !property.is_active })}
              >
                {property.is_active ? "Ocultar" : "Publicar"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                aria-pressed={property.is_featured}
                onClick={() => void toggle(property, { is_featured: !property.is_featured })}
              >
                {property.is_featured ? "Quitar destacado" : "Destacar"}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}