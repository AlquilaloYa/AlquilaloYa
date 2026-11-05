"use client";

import { useEffect } from "react";

export function OfflineSupport() {
  useEffect(() => {
    if (
      process.env.NODE_ENV !== "production" ||
      !("serviceWorker" in navigator)
    ) {
      return;
    }

    void navigator.serviceWorker
      .register("/service-worker.js")
      .catch((error: unknown) => {
        console.warn("No se pudo registrar el soporte offline básico:", error);
      });
  }, []);

  return null;
}
