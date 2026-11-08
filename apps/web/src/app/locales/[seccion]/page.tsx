import { notFound } from "next/navigation";
import { LocalModulePage } from "@/components/locales/local-module-page";
import { isLocalModule } from "@/lib/locales-records";

export default function LocalesModuleRoute({
  params,
}: {
  params: { seccion: string };
}) {
  if (!isLocalModule(params.seccion)) notFound();
  return <LocalModulePage module={params.seccion} />;
}
