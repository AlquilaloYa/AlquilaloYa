import { NextRequest, NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";
import { extraerDatosForm } from "../../../../lib/pdf/extraer-datos-form";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);
const MANEJADOR = path.join(process.cwd(), "scripts", "extraer-pdf.mjs");

export async function POST(req: NextRequest) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user.role, Permission.CLIENT_UPDATE);
    if (denied) return denied;

    const formData = await req.formData();
    const archivo = formData.get("archivo");
    if (!(archivo instanceof File)) {
      return NextResponse.json({ error: "No se recibió ningún archivo." }, { status: 400 });
    }
    if (archivo.type !== "application/pdf" && !archivo.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json({ error: "El archivo debe ser un PDF." }, { status: 415 });
    }
    const dir = await mkdtemp(path.join(tmpdir(), "pdf-extraer-"));
    const ruta = path.join(dir, "formulario.pdf");
    try {
      await writeFile(ruta, Buffer.from(await archivo.arrayBuffer()));
      const { stdout } = await execFileAsync(process.execPath, [MANEJADOR, ruta], {
        timeout: 30_000,
        maxBuffer: 2 * 1024 * 1024,
      });
      const salto = stdout.lastIndexOf("\n");
      const texto = JSON.parse(stdout.slice(salto + 1).trim()) as string;
      return NextResponse.json({ datos: extraerDatosForm(texto) });
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  } catch {
    return NextResponse.json(
      { error: "No se pudo leer el PDF. Verifica que sea un formulario exportado correctamente." },
      { status: 422 },
    );
  }
}