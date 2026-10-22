import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { and, desc, eq, gte, isNull, lte } from "drizzle-orm";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";
import { deleteObject, isStorageConfigured, uploadObject } from "@/lib/storage";

export const dynamic = "force-dynamic";
const MAX_BYTES = 8 * 1024 * 1024;
const BUCKET = "gastos";
const TIPOS = ["SERVICIO", "PRODUCTO"] as const;
const MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

function toDateStr(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v ?? "").slice(0, 10);
}

function esDiaValido(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

/** GET /api/gastos?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&tipo=SERVICIO|PRODUCTO */
export async function GET(req: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user, Permission.CONTRACT_READ);
    if (denied) return denied;

    const { db, schema } = dbModule as {
      db: typeof import("@contract/db").db;
      schema: typeof import("@contract/db").schema;
    };

    const url = new URL(req.url);
    const desde = url.searchParams.get("desde") ?? "";
    const hasta = url.searchParams.get("hasta") ?? "";
    const tipo = (url.searchParams.get("tipo") ?? "").toUpperCase();

    const condiciones = [isNull(schema.gastos.eliminadoEn)];
    if (esDiaValido(desde)) condiciones.push(gte(schema.gastos.dia, desde));
    if (esDiaValido(hasta)) condiciones.push(lte(schema.gastos.dia, hasta));
    if ((TIPOS as readonly string[]).includes(tipo)) {
      condiciones.push(eq(schema.gastos.tipo, tipo));
    }

    const rows = await db
      .select()
      .from(schema.gastos)
      .where(and(...condiciones))
      .orderBy(desc(schema.gastos.dia), desc(schema.gastos.createdAt))
      .limit(1000);

    const gastos = rows.map((row) => ({
      id: row.id,
      dia: toDateStr(row.dia),
      tipo: row.tipo,
      producto: row.producto,
      monto: Number(row.monto ?? 0),
      tieneComprobante: Boolean(row.comprobante),
      comprobanteMimeType: row.comprobanteMimeType,
      nota: row.nota,
      creadoPor: row.creadoPor,
      createdAt: row.createdAt.toISOString(),
    }));

    const total = gastos.reduce((s, g) => s + g.monto, 0);
    const totalServicios = gastos
      .filter((g) => g.tipo === "SERVICIO")
      .reduce((s, g) => s + g.monto, 0);
    const totalProductos = gastos
      .filter((g) => g.tipo === "PRODUCTO")
      .reduce((s, g) => s + g.monto, 0);

    return NextResponse.json({
      gastos,
      total,
      totalServicios,
      totalProductos,
      cantidad: gastos.length,
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

/** POST /api/gastos — multipart: dia, tipo, producto, monto, nota, comprobante (opcional). */
export async function POST(req: Request) {
  let uploadedKey: string | null = null;
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user, Permission.CONTRACT_UPDATE);
    if (denied) return denied;

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return NextResponse.json({ error: "No se pudo leer el formulario" }, { status: 400 });
    }

    const dia = String(form.get("dia") ?? "").trim();
    const tipo = String(form.get("tipo") ?? "")
      .trim()
      .toUpperCase();
    const producto = String(form.get("producto") ?? "").trim();
    const monto = Number(form.get("monto") ?? 0);
    const nota = String(form.get("nota") ?? "").trim();
    const archivo = form.get("comprobante");

    if (!esDiaValido(dia)) {
      return NextResponse.json({ error: "Indica una fecha válida" }, { status: 400 });
    }
    if (!(TIPOS as readonly string[]).includes(tipo)) {
      return NextResponse.json({ error: "Tipo inválido" }, { status: 400 });
    }
    if (!producto) {
      return NextResponse.json({ error: "Indica el producto o servicio" }, { status: 400 });
    }
    if (!Number.isFinite(monto) || monto <= 0) {
      return NextResponse.json({ error: "Monto inválido" }, { status: 400 });
    }

    const { db, schema } = dbModule as {
      db: typeof import("@contract/db").db;
      schema: typeof import("@contract/db").schema;
    };

    const id = randomUUID();
    let comprobante: string | null = null;
    let comprobanteMimeType: string | null = null;

    if (archivo instanceof File && archivo.size > 0) {
      if (!isStorageConfigured()) {
        return NextResponse.json(
          { error: "El almacenamiento privado no está configurado" },
          { status: 503 }
        );
      }
      if (!MIME_TYPES.has(archivo.type)) {
        return NextResponse.json(
          { error: "El comprobante debe ser JPG, PNG, WebP o PDF" },
          { status: 400 }
        );
      }
      if (archivo.size > MAX_BYTES) {
        return NextResponse.json(
          { error: "El comprobante debe pesar hasta 8 MB" },
          { status: 400 }
        );
      }
      const ext =
        archivo.type === "image/png"
          ? "png"
          : archivo.type === "image/webp"
            ? "webp"
            : archivo.type === "application/pdf"
              ? "pdf"
              : "jpg";
      const key = `gastos/${id}/${randomUUID()}.${ext}`;
      const bytes = new Uint8Array(await archivo.arrayBuffer());
      const stored = await uploadObject(key, bytes, archivo.type, BUCKET);
      uploadedKey = stored.key;
      comprobante = stored.key;
      comprobanteMimeType = archivo.type;
    }

    try {
      const [row] = await db
        .insert(schema.gastos)
        .values({
          id,
          dia,
          tipo,
          producto,
          monto: monto.toFixed(2),
          comprobante,
          comprobanteMimeType,
          nota,
          creadoPor: auth.user.name || auth.user.email,
        })
        .returning();

      if (!row) {
        throw new Error("No se pudo registrar el gasto");
      }
      return NextResponse.json(
        {
          id: row.id,
          dia: toDateStr(row.dia),
          tipo: row.tipo,
          producto: row.producto,
          monto: Number(row.monto),
          tieneComprobante: Boolean(row.comprobante),
          comprobanteMimeType: row.comprobanteMimeType,
          nota: row.nota,
          creadoPor: row.creadoPor,
          createdAt: row.createdAt.toISOString(),
        },
        { status: 201 }
      );
    } catch (error) {
      if (uploadedKey) {
        await deleteObject(uploadedKey, BUCKET).catch(() => undefined);
      }
      throw error;
    }
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

/** DELETE /api/gastos?id=... — baja lógica (conserva la evidencia del comprobante). */
export async function DELETE(req: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user, Permission.CONTRACT_UPDATE);
    if (denied) return denied;

    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Falta el id" }, { status: 400 });
    }

    const { db, schema } = dbModule as {
      db: typeof import("@contract/db").db;
      schema: typeof import("@contract/db").schema;
    };

    const [row] = await db
      .update(schema.gastos)
      .set({ eliminadoEn: new Date(), updatedAt: new Date() })
      .where(eq(schema.gastos.id, id))
      .returning();
    if (!row) {
      return NextResponse.json({ error: "Gasto no encontrado" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
