"use client";

// global-error.tsx evita la generación estática de 500.html que rompe el build
// en Next 14 (ENOENT al renombrar .next/export/500.html) y provee el borde de
// error raíz para la aplicación.
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body>
        <main className="container flex min-h-screen flex-col items-center justify-center py-16 text-center">
          <h1 className="text-6xl font-bold">500</h1>
          <p className="mt-4 text-muted-foreground">
            Algo salió mal en el servidor.
          </p>
          <button
            onClick={() => reset()}
            className="mt-8 rounded bg-primary px-4 py-2 font-medium text-on-primary"
          >
            Reintentar
          </button>
        </main>
      </body>
    </html>
  );
}