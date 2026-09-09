"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { UserRole } from "@contract/domain/rbac";

interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

interface AuthContextValue {
  user: SessionUser | null;
  loading: boolean;
  /** Autentica en el servidor y activa la cookie httpOnly de sesión. */
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/** Correos de demo visibles en el formulario (la sesión la valida el servidor). */
export const DEMO_EMAILS = [
  "admin@sistema.com",
  "operador@sistema.com",
  "supervisor@sistema.com",
  "auditor@sistema.com",
  "firmante@sistema.com",
];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Resuelve la sesión real desde el servidor (cookie httpOnly).
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/auth/me", { credentials: "same-origin" });
        if (res.ok && alive) {
          const data = (await res.json()) as { user?: SessionUser };
          setUser(data.user ?? null);
        }
      } catch {
        /* sin sesión */
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<boolean> => {
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        setUser(null);
        return false;
      }
      const data = (await res.json()) as { user?: SessionUser };
      setUser(data.user ?? null);
      return true;
    } catch {
      setUser(null);
      return false;
    }
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
    } catch {
      /* best-effort */
    }
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  }
  return ctx;
}

export { type SessionUser };
