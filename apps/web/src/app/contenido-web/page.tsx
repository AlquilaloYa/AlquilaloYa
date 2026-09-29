import { DashboardShell } from "@/components/dashboard-shell";
import { ContenidoWebPanel } from "@/components/contenido-web/ContenidoWebPanel";

export const metadata = {
  title: "Panel Web · AlquilaYa",
};

export default function ContenidoWebPage() {
  return (
    <DashboardShell>
      <div className="space-y-4">
        <div>
          <h1 className="font-headline-lg text-2xl font-bold text-foreground">Panel Web</h1>
          <p className="text-sm text-muted-foreground">
            Edita el sitio AlquilaYa: unidades, fotos, textos y configuración. Los cambios se
            publican al instante en la web.
          </p>
        </div>
        <ContenidoWebPanel />
      </div>
    </DashboardShell>
  );
}