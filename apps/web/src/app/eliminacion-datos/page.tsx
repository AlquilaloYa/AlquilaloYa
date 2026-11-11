import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Eliminación de datos | Alquila Ya",
  description:
    "Instrucciones para solicitar la eliminación de tus datos personales en Alquila Ya.",
  robots: { index: true, follow: true },
};

export default function DataDeletionPage() {
  return (
    <main className="min-h-screen bg-surface px-5 py-12 text-on-surface sm:px-8">
      <article className="mx-auto max-w-3xl">
        <a
          href="/"
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Alquila Ya
        </a>
        <h1 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">
          Eliminación de datos
        </h1>
        <p className="mt-6 leading-7 text-on-surface-variant">
          Para solicitar la eliminación de tus datos personales guardados por
          Alquila Ya, envía un correo a{" "}
          <a
            href="mailto:alquilayape@gmail.com?subject=Solicitud%20de%20eliminaci%C3%B3n%20de%20datos"
            className="text-primary underline underline-offset-4"
          >
            alquilayape@gmail.com
          </a>
          . Indica qué datos o cuenta deseas eliminar y el canal o servicio
          relacionado. Es posible que solicitemos información para verificar tu
          identidad antes de procesar la solicitud.
        </p>
        <p className="mt-3 leading-7 text-on-surface-variant">
          También puedes enviar tu solicitud por WhatsApp al{" "}
          <a
            href="https://wa.me/51937205274?text=Hola%2C%20solicito%20la%20eliminaci%C3%B3n%20de%20mis%20datos%20personales."
            className="text-primary underline underline-offset-4"
          >
            +51 937 205 274
          </a>
          .
        </p>
      </article>
    </main>
  );
}
