"use client";

import { DashboardShell } from "@/components/dashboard-shell";
import { Calculator } from "lucide-react";

export default function ContabilidadPage() {
  return (
    <DashboardShell>
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col justify-between gap-2 md:flex-row md:items-end">
          <div>
            <h2 className="font-headline-lg text-primary mb-1">Contabilidad</h2>
            <p className="font-body-sm text-on-surface-variant">
              Módulo en preparación.
            </p>
          </div>
        </div>

        <div className="flex flex-col items-center gap-3 rounded-lg bg-surface-container-lowest p-12 text-center">
          <Calculator className="h-10 w-10 text-on-surface-variant" />
          <h3 className="font-headline-md text-on-surface">Próximamente</h3>
          <p className="max-w-md font-body-sm text-on-surface-variant">
            Esta sección estará disponible en una próxima versión. Aún no contiene
            funcionalidades.
          </p>
        </div>
      </div>
    </DashboardShell>
  );
}
