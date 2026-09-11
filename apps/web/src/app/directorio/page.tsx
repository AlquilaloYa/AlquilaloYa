"use client";

import { DashboardShell } from "@/components/dashboard-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@contract/ui/components/card";
import { Contact } from "lucide-react";

export default function DirectorioPage() {
  return (
    <DashboardShell>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Directorio</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <Contact className="h-10 w-10 text-muted-foreground" />
              <p className="font-body-md text-on-surface-variant">
                Próximamente. Aquí se mostrará el directorio.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
