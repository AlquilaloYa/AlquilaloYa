import Link from "next/link";

export default function HomePage() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#04101f] p-6 text-center text-white">
      <video
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        poster="/fondo.gif"
        aria-hidden="true"
        tabIndex={-1}
        className="pointer-events-none absolute inset-0 h-full w-full scale-105 object-cover blur-[2px]"
      >
        <source
          src="https://cdn.pixabay.com/video/2021/10/13/91917-631504067_large.mp4"
          type="video/mp4"
        />
      </video>
      <div className="absolute inset-0 bg-slate-950/70" />
      <div className="relative">
        <img src="/logo-black-mode.png" alt="AlquilaYa ERP" className="mx-auto h-16 w-auto object-contain sm:h-20" />
        <h1 className="mt-8 font-display text-white">AlquilaYa ERP</h1>
        <p className="mt-4 max-w-2xl font-body-md text-white/85">
          Conecta tus departamentos, potencia a tu gente.
        </p>
        <p className="mt-2 max-w-2xl font-body-md text-white/70">
          El ERP integral que impulsa el futuro de tu empresa.
        </p>
        <div className="mt-8">
          <Link
            href="/login"
            className="rounded-md bg-primary px-6 py-2.5 font-label-md text-on-primary transition-opacity hover:opacity-90"
          >
            Iniciar sesión
          </Link>
        </div>
      </div>
    </main>
  );
}
