"use client";

import { useState } from "react";
import Link from "next/link";
import { DashboardShell } from "@/components/dashboard-shell";
import {
  Apple,
  ArrowLeft,
  Download,
  Monitor,
  Smartphone,
  CheckCircle2,
  Hourglass,
  Wrench,
  Globe,
  type LucideIcon,
} from "lucide-react";

const ERP_URL = "https://alquilaloya.vercel.app";

interface AppCardData {
  key: string;
  icon: LucideIcon;
  nombre: string;
  descripcion: string;
  estado: "disponible" | "proximamente";
  accion?: "descarga" | "instalador-erp";
  detalle?: string;
}

const APLICACIONES: AppCardData[] = [
  {
    key: "erp-windows",
    icon: Monitor,
    nombre: "Instalador del ERP — Microsoft (Windows)",
    descripcion:
      "AlquilaYa ERP como aplicación de escritorio en Windows. Se instala directo desde Chrome o Edge en un clic.",
    estado: "disponible",
    accion: "instalador-erp",
    detalle: "Aplicación web instalable (PWA) · Windows 10/11",
  },
  {
    key: "erp-macos",
    icon: Apple,
    nombre: "Instalador del ERP — MacOS",
    descripcion:
      "AlquilaYa ERP como aplicación de escritorio para Mac. En preparación.",
    estado: "proximamente",
    detalle: "En desarrollo",
  },
  {
    key: "mantenimiento-ios",
    icon: Wrench,
    nombre: "App de Mantenimiento — iOS",
    descripcion:
      "AlquilaYa Repair para iPhone: órdenes de trabajo, evidencias y firma del técnico. En preparación.",
    estado: "proximamente",
    detalle: "En desarrollo",
  },
  {
    key: "mantenimiento-android",
    icon: Wrench,
    nombre: "App de Mantenimiento — Android",
    descripcion:
      "AlquilaYa Repair: el técnico de mantenimiento recibe sus órdenes de trabajo, registra evidencias y firma en el lugar.",
    estado: "disponible",
    accion: "descarga",
    detalle: "Versión 1.0.5 · Android 7.0+",
  },
  {
    key: "cliente-android",
    icon: Smartphone,
    nombre: "App de Cliente — Android",
    descripcion:
      "Portal del inquilino en móvil: pagos, cronograma de cuotas, reporte de incidencias y disponibilidad. En preparación.",
    estado: "proximamente",
    detalle: "En desarrollo",
  },
  {
    key: "cliente-ios",
    icon: Smartphone,
    nombre: "App de Cliente — iOS",
    descripcion:
      "Portal del inquilino en iPhone: pagos, cronograma de cuotas, reporte de incidencias y disponibilidad. En preparación.",
    estado: "proximamente",
    detalle: "En desarrollo",
  },
];

const PASOS_ERP_WINDOWS = [
  "Abre el ERP en Google Chrome o Microsoft Edge.",
  "Menu (⋯ o ⋮) en la esquina superior derecha del navegador.",
  "Elige 'Instalar aplicación' (o 'Instalar AlquilaYa ERP').",
  "El ERP quedará en tu escritorio y menú inicio con su propio icono.",
];

function TarjetaApp({ app }: { app: AppCardData }) {
  const [abierto, setAbierto] = useState(false);
  const Icon = app.icon;
  const disponible = app.estado === "disponible";

  return (
    <div className="flex flex-col rounded-xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm dark:border-transparent dark:bg-[#1c222d]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="h-6 w-6" />
          </span>
          <h3 className="font-headline-sm font-semibold leading-snug text-on-surface">
            {app.nombre}
          </h3>
        </div>
        {disponible ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-600/10 px-2.5 py-1 text-xs font-medium text-emerald-600">
            <CheckCircle2 className="h-3.5 w-3.5" /> Disponible
          </span>
        ) : (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-600">
            <Hourglass className="h-3.5 w-3.5" /> Próximamente
          </span>
        )}
      </div>
      <p className="mt-3 text-sm text-on-surface-variant">{app.descripcion}</p>
      {app.detalle ? (
        <p className="mt-1 text-xs text-muted-foreground">{app.detalle}</p>
      ) : null}
      <div className="mt-4">
        {app.accion === "descarga" ? (
          <a
            href="/aplicaciones/FieldOps-v1.0.5.apk"
            download
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-opacity hover:opacity-90"
          >
            <Download className="h-4 w-4" /> Descargar instalador (.apk)
          </a>
        ) : null}
        {app.accion === "instalador-erp" ? (
          <>
            <button
              type="button"
              onClick={() => setAbierto((v) => !v)}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-opacity hover:opacity-90"
            >
              Instalar ERP en Windows
            </button>
            {abierto ? (
              <ol className="mt-3 list-inside list-decimal space-y-1 rounded-lg border border-outline-variant bg-surface-container p-3 text-sm text-on-surface-variant dark:border-white/10">
                {PASOS_ERP_WINDOWS.map((paso) => (
                  <li key={paso}>{paso}</li>
                ))}
              </ol>
            ) : null}
            <a
              href={ERP_URL}
              target="_blank"
              rel="noreferrer"
              className="ml-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              <Globe className="h-4 w-4" /> Abrir el ERP
            </a>
          </>
        ) : null}
      </div>
    </div>
  );
}

export default function AplicacionesPage() {
  return (
    <DashboardShell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1 pb-1 text-sm text-muted-foreground hover:underline lg:hidden"
            >
              <ArrowLeft className="h-4 w-4" /> Dashboard
            </Link>
            <h1 className="font-headline-lg">Aplicaciones</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Instaladores y apps del sistema AlquilaYa para escritorio y móvil.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {APLICACIONES.map((app) => (
            <TarjetaApp key={app.key} app={app} />
          ))}
        </div>
      </div>
    </DashboardShell>
  );
}
