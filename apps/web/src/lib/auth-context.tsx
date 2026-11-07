"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Permission, UserRole } from "@contract/domain/rbac";

interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  additionalPermissions: Permission[];
  configurationAccess: boolean;
}

export type LoginResult =
  | { status: "ok" }
  | { status: "mfaRequired" }
  | { status: "mfaSetupRequired" }
  | { status: "error" };

export type VerifyMfaResult = { status: "ok" } | { status: "error"; message: string };

interface AuthContextValue {
  user: SessionUser | null;
  loading: boolean;
  sessionError: string | null;
  retrySession: () => Promise<void>;
  /** Autentica en el servidor y activa la cookie httpOnly de sesión. */
  login: (email: string, password: string) => Promise<LoginResult>;
  /** Completa el reto MFA (SEC-015) tras un login que lo requiera. */
  verifyMfa: (code: string) => Promise<VerifyMfaResult>;
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
  const [sessionError, setSessionError] = useState<string | null>(null);
  const sessionRequest = useRef<AbortController | null>(null);

  const retrySession = useCallback(async () => {
    sessionRequest.current?.abort();
    const ctrl = new AbortController();
    sessionRequest.current = ctrl;
    setLoading(true);
    setSessionError(null);
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      ctrl.abort();
    }, 30_000);
    try {
      const res = await fetch("/api/auth/me", {
        credentials: "same-origin",
        signal: ctrl.signal,
        cache: "no-store",
      });
      if (res.ok) {
        const data = (await res.json()) as { user?: SessionUser };
        setUser(data.user ?? null);
      } else if (res.status === 401) {
        setUser(null);
      } else if (res.status === 429 || res.status >= 500) {
        setSessionError("El servicio de autenticación está demorando. Tu sesión se mantiene; puedes volver a intentar.");
      } else {
        setUser(null);
      }
    } catch {
      if (timedOut) {
        setSessionError("La validación de sesión está demorando. Tu sesión se mantiene; puedes volver a intentar.");
      } else if (!ctrl.signal.aborted) {
        setSessionError("No se pudo conectar para validar tu sesión. Tu sesión se mantiene; puedes volver a intentar.");
      }
    } finally {
      clearTimeout(timeout);
      if (sessionRequest.current === ctrl) {
        sessionRequest.current = null;
        setLoading(false);
      }
    }
  }, []);

  // Resuelve la sesión real desde el servidor (cookie httpOnly).
  useEffect(() => {
    void retrySession();
    return () => {
      const currentRequest = sessionRequest.current;
      sessionRequest.current = null;
      currentRequest?.abort();
    };
  }, [retrySession]);

  const login = useCallback(async (email: string, password: string): Promise<LoginResult> => {
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email, password }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        user?: SessionUser;
        mfaRequired?: boolean;
        mfaSetupRequired?: boolean;
      };
      if (!res.ok) {
        setUser(null);
        return { status: "error" };
      }
      if (data.mfaRequired) {
        setUser(null);
        return { status: "mfaRequired" };
      }
      if (data.mfaSetupRequired) {
        setUser(null);
        return { status: "mfaSetupRequired" };
      }
      setUser(data.user ?? null);
      return { status: "ok" };
    } catch {
      setUser(null);
      return { status: "error" };
    }
  }, []);

  const verifyMfa = useCallback(async (code: string): Promise<VerifyMfaResult> => {
    try {
      const res = await fetch("/api/auth/mfa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ code }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        user?: SessionUser;
        error?: string;
      };
      if (!res.ok || !data.user) {
        return { status: "error", message: data.error ?? "Código inválido" };
      }
      setUser(data.user);
      return { status: "ok" };
    } catch {
      return { status: "error", message: "No se pudo verificar el código" };
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
    <AuthContext.Provider value={{ user, loading, sessionError, retrySession, login, verifyMfa, logout }}>
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
