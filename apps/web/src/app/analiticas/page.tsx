"use client";

import { DashboardShell } from "@/components/dashboard-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@contract/ui/components/card";
import { BarChart3 } from "lucide-react";

export default function AnaliticasPage() {
  return (
    <DashboardShell>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Analíticas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <BarChart3 className="h-10 w-10 text-muted-foreground" />
              <p className="font-body-md text-on-surface-variant">
                Próximamente. Aquí se mostrarán las analíticas.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}