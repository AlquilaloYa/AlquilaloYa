"use client";

import { useState } from "react";
import type { ChangeEvent } from "react";
import { ArrowDown, ArrowUp, ImagePlus, Link2, Trash2, Upload } from "lucide-react";
import { Button, Input } from "./ui";
import { contenidoWebApi, moveItem } from "@/lib/contenido-web-client";
import type { AdminImage, AdminProperty } from "@/lib/contenido-web-client";

export interface ImageManagerProps {
  property: AdminProperty;
  onChange: (property: AdminProperty) => void;
  onError: (error: unknown) => void;
}

export function ImageManager({ property, onChange, onError }: ImageManagerProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [urlDraft, setUrlDraft] = useState("");
  const [urlAlt, setUrlAlt] = useState("");
  const [altByImage, setAltByImage] = useState<Record<number, string>>({});

  async function replaceImages(next: AdminImage[]) {
    try {
      const updated = await contenidoWebApi.images.reorder(property.id, next);
      onChange(updated);
    } catch (error) {
      onError(error);
    }
  }

  function move(from: number, to: number) {
    void replaceImages(moveItem(property.images, from, to));
  }

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const updated = await contenidoWebApi.images.upload(property.id, file, "");
      onChange(updated);
    } catch (error) {
      onError(error);
    } finally {
      setIsUploading(false);
      event.target.value = "";
    }
  }

  async function handleLink() {
    if (!urlDraft.trim()) return;
    try {
      const updated = await contenidoWebApi.images.addUrl(property.id, urlDraft.trim(), urlAlt.trim());
      onChange(updated);
      setUrlDraft("");
      setUrlAlt("");
    } catch (error) {
      onError(error);
    }
  }

  async function handleAlt(image: AdminImage) {
    const altText = altByImage[image.id];
    if (altText === undefined || altText === image.alt) return;
    try {
      const updated = await contenidoWebApi.images.reorder(
        property.id,
        property.images.map((item) => (item.id === image.id ? { ...item, alt: altText } : item))
      );
      onChange(updated);
    } catch (error) {
      onError(error);
    }
  }

  async function handleDelete(image: AdminImage) {
    try {
      const updated = await contenidoWebApi.images.remove(property.id, image.id);
      onChange(updated);
    } catch (error) {
      onError(error);
    }
  }

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h3 className="text-sm font-semibold text-foreground">
        Fotos ({property.images.length})
      </h3>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Input
          label="URL de imagen"
          placeholder="https://…"
          value={urlDraft}
          onChange={(event) => setUrlDraft(event.target.value)}
        />
        <Input
          label="Texto alternativo"
          placeholder="Unidad MA-107, sala"
          value={urlAlt}
          onChange={(event) => setUrlAlt(event.target.value)}
        />
        <div className="flex items-end gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => void handleLink()}
            leadingIcon={<Link2 aria-hidden className="h-4 w-4" />}
          >
            Agregar por URL
          </Button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-input px-3 text-sm font-medium text-foreground hover:bg-muted">
          <Upload aria-hidden className="h-4 w-4" />
          Subir imagen
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            disabled={isUploading}
            onChange={(event) => void handleUpload(event)}
          />
        </label>
        {isUploading && <span className="text-sm text-muted-foreground">Subiendo…</span>}
      </div>

      {property.images.length === 0 ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
          <ImagePlus aria-hidden className="h-4 w-4" />
          Sin fotos todavía. Subí una o pegá una URL.
        </p>
      ) : (
        <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {property.images.map((image, index) => (
            <li key={image.id} className="rounded-md border border-border p-2">
              <img
                src={image.url}
                alt={image.alt || "Foto de la unidad"}
                className="h-28 w-full rounded bg-surface-variant object-cover"
              />
              <div className="mt-2 space-y-2">
                <Input
                  placeholder="Texto alternativo"
                  aria-label={`Texto alternativo de la foto ${index + 1}`}
                  value={altByImage[image.id] ?? image.alt}
                  onChange={(event) =>
                    setAltByImage((current) => ({ ...current, [image.id]: event.target.value }))
                  }
                  onBlur={() => void handleAlt(image)}
                />
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label="Mover foto hacia arriba"
                      disabled={index === 0}
                      onClick={() => move(index, index - 1)}
                    >
                      <ArrowUp aria-hidden className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label="Mover foto hacia abajo"
                      disabled={index === property.images.length - 1}
                      onClick={() => move(index, index + 1)}
                    >
                      <ArrowDown aria-hidden className="h-4 w-4" />
                    </Button>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label="Eliminar foto"
                    onClick={() => void handleDelete(image)}
                  >
                    <Trash2 aria-hidden className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}