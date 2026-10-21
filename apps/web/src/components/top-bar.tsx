"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme-provider";
import { Button } from "@contract/ui/components/button";
import { ThemeToggle } from "@contract/ui/components/theme-toggle";
import { LogOut, Menu } from "lucide-react";
import { CommandPalette } from "@/components/command-palette";

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
      <div className="max-w-md flex-1">
        <CommandPalette navItems={results} />
      </div>

      <div className="ml-auto flex items-center gap-2">
        <ThemeToggle
          theme={theme}
          onToggle={toggleTheme}
          className="inline-flex h-10 w-10 items-center justify-center rounded-md text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        />

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