"use client";

import { useEffect, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme-provider";
import { Button } from "@contract/ui/components/button";
import { Input } from "@contract/ui/components/input";
import { MoonIcon, SunIcon } from "@contract/ui/components/theme-toggle";
import { Search, LogOut, CornerDownLeft, Menu } from "lucide-react";

export interface SearchResult {
  href: string;
  label: string;
  section: string;
}

export function TopBar({
  results = [],
  onMenuClick,
}: {
  results?: SearchResult[];
  onMenuClick?: () => void;
}) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const filtered = query.trim()
    ? results.filter((r) =>
        `${r.label} ${r.section}`.toLowerCase().includes(query.toLowerCase())
      )
    : results;

  useEffect(() => {
    setOpen(query.trim().length > 0 && filtered.length > 0);
  }, [query, filtered.length]);

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    setQuery(e.target.value);
  }

  function go(href: string) {
    router.push(href);
    setQuery("");
    setOpen(false);
  }

  function handleKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && query.trim()) {
      const first = filtered[0];
      if (first) {
        go(first.href);
      }
    }
    if (e.key === "Escape") {
      setOpen(false);
      setQuery("");
    }
  }

  const initials =
    user?.name
      .split(" ")
      .map((p) => p[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() ?? "?";

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60 2xl:px-6">
      {onMenuClick ? (
        <Button
          variant="ghost"
          size="icon"
          onClick={onMenuClick}
          className="lg:hidden"
          aria-label="Abrir menú"
          title="Abrir menú"
        >
          <Menu className="h-5 w-5" />
        </Button>
      ) : null}
      <div className="relative max-w-md flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Buscar en el sistema... "
          value={query}
          onChange={handleChange}
          onKeyDown={handleKey}
          aria-label="Buscar"
        />
        {open ? (
          <div className="absolute left-0 right-0 top-11 z-40 overflow-hidden rounded-lg border bg-popover p-1 shadow-lg">
            {filtered.slice(0, 8).map((r) => (
              <button
                key={r.href}
                onClick={() => go(r.href)}
                className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-muted"
              >
                <span>{r.label}</span>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  {r.section}
                  <CornerDownLeft className="h-3 w-3" />
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          aria-label="Cambiar tema"
          title={theme === "light" ? "Activar modo oscuro" : "Activar modo claro"}
        >
          {theme === "light" ? <MoonIcon /> : <SunIcon />}
        </Button>

        <div className="mx-1 h-6 w-px bg-border" />

        <div className="flex items-center gap-3">
          <div className="hidden text-right sm:block">
            <p className="text-sm font-medium leading-tight">{user?.name}</p>
            <p className="text-xs text-muted-foreground">{user?.role}</p>
          </div>
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
            {initials}
          </div>
        </div>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            logout();
            router.replace("/login");
          }}
          aria-label="Cerrar sesión"
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}