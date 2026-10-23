"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { Search, CornerDownLeft, Loader2 } from "lucide-react";

export interface PaletteNavItem {
  href: string;
  label: string;
  section: string;
}

interface SearchItem {
  id: string;
  type: string;
  title: string;
  subtitle: string;
  href: string;
  section: string;
}

interface Entry {
  key: string;
  href: string;
  label: string;
  section: string;
  subtitle?: string;
}

export function CommandPalette({
  navItems = [],
}: {
  navItems?: PaletteNavItem[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<SearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const navEntries = useMemo<Entry[]>(
    () =>
      navItems.map((n) => ({
        key: `nav:${n.href}`,
        href: n.href,
        label: n.label,
        section: n.section,
      })),
    [navItems],
  );

  const filteredNav = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return navEntries;
    return navEntries.filter((n) =>
      `${n.label} ${n.section}`.toLowerCase().includes(q),
    );
  }, [navEntries, query]);

  const remoteEntries = useMemo<Entry[]>(
    () =>
      items.map((i) => ({
        key: `${i.type}:${i.id}`,
        href: i.href,
        label: i.title,
        section: i.section,
        subtitle: i.subtitle,
      })),
    [items],
  );

  const entries = useMemo(
    () => [...filteredNav, ...remoteEntries],
    [filteredNav, remoteEntries],
  );

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setItems([]);
    setActive(0);
  }, []);

  const go = useCallback(
    (href: string) => {
      close();
      router.push(href);
    },
    [close, router],
  );

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onOutsidePointerDown(event: PointerEvent) {
      if (
        dialogRef.current &&
        event.target instanceof Node &&
        !dialogRef.current.contains(event.target)
      ) {
        close();
      }
    }
    document.addEventListener("pointerdown", onOutsidePointerDown, true);
    return () =>
      document.removeEventListener("pointerdown", onOutsidePointerDown, true);
  }, [close, open]);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) {
      abortRef.current?.abort();
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const handle = window.setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await apiFetch(`/api/search?q=${encodeURIComponent(q)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!res.ok) {
          setItems([]);
          return;
        }
        const data = (await res.json()) as { items?: SearchItem[] };
        setItems(Array.isArray(data.items) ? data.items : []);
      } catch (err) {
        if ((err as Error).name !== "AbortError") setItems([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => window.clearTimeout(handle);
  }, [query, open]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-index="${active}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, entries.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const entry = entries[active];
      if (entry) go(entry.href);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-10 w-full max-w-md items-center gap-2 rounded-lg border bg-surface-container-lowest px-3 text-sm text-muted-foreground transition hover:bg-muted"
        aria-label="Buscar en el sistema"
      >
        <Search className="h-4 w-4" />
        <span className="flex-1 text-left">Buscar en el sistema...</span>
        <kbd className="hidden rounded border px-1.5 text-[10px] font-medium sm:inline">
          Ctrl K
        </kbd>
      </button>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex justify-center bg-black/40 p-4 pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Búsqueda global"
    >
      <div
        ref={dialogRef}
        className="h-fit w-full max-w-xl overflow-hidden rounded-xl border bg-popover shadow-2xl"
      >
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder="Buscar clientes, contratos, departamentos, tareas..."
            className="h-12 w-full border-b bg-transparent pl-9 pr-10 text-sm text-popover-foreground outline-none placeholder:text-muted-foreground"
            role="combobox"
            aria-expanded="true"
            aria-controls="command-palette-list"
            aria-autocomplete="list"
            aria-activedescendant={
              entries[active] ? `cmd-opt-${active}` : undefined
            }
          />
          {loading ? (
            <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          ) : null}
        </div>

        <div
          id="command-palette-list"
          ref={listRef}
          role="listbox"
          className="max-h-[55vh] overflow-y-auto p-1"
        >
          {entries.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              {query.trim().length >= 2
                ? "Sin resultados"
                : "Escribe al menos 2 caracteres para buscar"}
            </p>
          ) : (
            entries.map((entry, index) => (
              <button
                key={entry.key}
                id={`cmd-opt-${index}`}
                data-index={index}
                role="option"
                aria-selected={index === active}
                onMouseEnter={() => setActive(index)}
                onClick={() => go(entry.href)}
                className={`flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm ${
                  index === active ? "bg-muted" : ""
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-popover-foreground">
                    {entry.label}
                  </span>
                  {entry.subtitle ? (
                    <span className="block truncate text-xs text-muted-foreground">
                      {entry.subtitle}
                    </span>
                  ) : null}
                </span>
                <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                  {entry.section}
                  {index === active ? (
                    <CornerDownLeft className="h-3 w-3" />
                  ) : null}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
