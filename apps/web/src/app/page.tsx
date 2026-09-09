import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-surface p-6 text-center text-on-surface">
      <div className="flex h-12 w-12 items-center justify-center rounded bg-primary-container text-primary-container-foreground">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-6 w-6"
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
          <path d="M14 2v6h6" />
        </svg>
      </div>
      <h1 className="mt-6 font-display text-primary">Sistema de Contratos</h1>
      <p className="mt-4 max-w-2xl font-body-md text-on-surface-variant">
        Sistema interno de gestión y generación de contratos. Fase 2:
        identidad, usuarios, clientes y departamentos.
      </p>
      <div className="mt-8">
        <Link
          href="/login"
          className="rounded-md bg-primary px-6 py-2.5 font-label-md text-on-primary transition-opacity hover:opacity-90"
        >
          Iniciar sesión
        </Link>
      </div>
    </main>
  );
}