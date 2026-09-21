import { and, eq, inArray, sql } from "drizzle-orm";

type Db = typeof import("@contract/db").db;
type Schema = typeof import("@contract/db").schema;

export interface MensajeCanonico {
  canal: string;
  conversacionExternaId: string;
  contactoNombre?: string;
  contactoTelefono?: string;
  contenido: string;
  msgExternoId?: string | null;
  direccion?: "INBOUND" | "OUTBOUND";
}

/**
 * Ingresa un mensaje normalizado: crea/encuentra la conversación, inserta el
 * mensaje con idempotencia y dispara los bots si es entrante.
 */
export async function ingresarMensaje(
  db: Db,
  schema: Schema,
  msg: MensajeCanonico
): Promise<{ conversationId: string; duplicado: boolean; respuestasBot: number }> {
  const externoId = msg.conversacionExternaId.trim();
  const contenido = msg.contenido.trim();
  const direccion = msg.direccion === "OUTBOUND" ? "OUTBOUND" : "INBOUND";
  if (!externoId || !contenido) {
    throw new Error("conversacionExternaId y contenido son requeridos");
  }

  let [conv] = await db
    .select()
    .from(schema.conversations)
    .where(
      and(
        eq(schema.conversations.canal, msg.canal),
        eq(schema.conversations.externoId, externoId)
      )
    )
    .limit(1);

  if (!conv) {
    const [created] = await db
      .insert(schema.conversations)
      .values({
        canal: msg.canal,
        externoId,
        contactoNombre: (msg.contactoNombre ?? "").trim(),
        contactoTelefono: (msg.contactoTelefono ?? "").trim(),
      })
      .returning();
    conv = created ?? undefined;
  }
  if (!conv) throw new Error("No se pudo crear/obtener la conversación");

  const extMsg = (msg.msgExternoId ?? "").trim() || null;
  if (extMsg) {
    const dup = await db
      .select({ id: schema.messages.id })
      .from(schema.messages)
      .where(
        and(
          eq(schema.messages.conversationId, conv.id),
          eq(schema.messages.externoMsgId, extMsg)
        )
      )
      .limit(1);
    if (dup.length > 0) {
      return { conversationId: conv.id, duplicado: true, respuestasBot: 0 };
    }
  }

  const now = new Date();
  await db.insert(schema.messages).values({
    conversationId: conv.id,
    direccion,
    contenido,
    externoMsgId: extMsg,
    estado: "ENVIADO",
  });
  await db
    .update(schema.conversations)
    .set({
      ultimoMensaje: contenido.slice(0, 300),
      ultimoMensajeEn: now,
      updatedAt: now,
      noLeidos: sql`${schema.conversations.noLeidos} + ${direccion === "INBOUND" ? 1 : 0}`,
    })
    .where(eq(schema.conversations.id, conv.id));

  const respuestasBot =
    direccion === "INBOUND" ? await evaluarBots(db, schema, conv.id, msg.canal, contenido) : 0;

  return { conversationId: conv.id, duplicado: false, respuestasBot };
}

/** Ejecuta las reglas de bot activas del canal. Devuelve cuántas respuestas envió. */
export async function evaluarBots(
  db: Db,
  schema: Schema,
  conversationId: string,
  canal: string,
  contenidoInbound: string
): Promise<number> {
  const rules = await db
    .select()
    .from(schema.botRules)
    .where(
      and(
        eq(schema.botRules.activa, true),
        inArray(schema.botRules.canal, [canal, "TODOS"])
      )
    );
  if (rules.length === 0) return 0;

  const [conv] = await db
    .select({ telefono: schema.conversations.contactoTelefono })
    .from(schema.conversations)
    .where(eq(schema.conversations.id, conversationId))
    .limit(1);

  const texto = contenidoInbound.toLowerCase();
  let enviadas = 0;

  for (const rule of rules) {
    const keywords = Array.isArray(rule.keywords)
      ? (rule.keywords as unknown[]).map(String).filter(Boolean)
      : [];
    if (keywords.length > 0 && !keywords.some((k) => texto.includes(k.toLowerCase()))) continue;

    let cuerpo = (rule.cuerpo ?? "").trim();
    if (rule.plantillaId) {
      const [tpl] = await db
        .select({ cuerpo: schema.messageTemplates.cuerpo, activa: schema.messageTemplates.activa })
        .from(schema.messageTemplates)
        .where(eq(schema.messageTemplates.id, rule.plantillaId))
        .limit(1);
      if (tpl && tpl.activa) cuerpo = tpl.cuerpo.trim();
    }
    if (!cuerpo) continue;

    const autor = `Bot: ${rule.nombre}`;
    if (rule.unaPorConversacion) {
      const prev = await db
        .select({ id: schema.messages.id })
        .from(schema.messages)
        .where(
          and(
            eq(schema.messages.conversationId, conversationId),
            eq(schema.messages.autor, autor)
          )
        )
        .limit(1);
      if (prev.length > 0) continue;
    }

    const now = new Date();
    const [botMsg] = await db
      .insert(schema.messages)
      .values({
        conversationId,
        direccion: "OUTBOUND",
        autor,
        contenido: cuerpo,
        estado: "PENDIENTE",
      })
      .returning();
    await db
      .update(schema.conversations)
      .set({ ultimoMensaje: cuerpo.slice(0, 300), ultimoMensajeEn: now, updatedAt: now })
      .where(eq(schema.conversations.id, conversationId));

    if (botMsg) {
      const { despacharMensajeSaliente } = await import("@/lib/messaging-dispatcher");
      const r = await despacharMensajeSaliente({
        db,
        messageId: botMsg.id,
        canal,
        to: conv?.telefono ?? "",
        text: cuerpo,
      });
      const estadoFinal = r.delivered || r.provider === null ? "ENVIADO" : "FALLO";
      await db
        .update(schema.messages)
        .set({ estado: estadoFinal })
        .where(eq(schema.messages.id, botMsg.id));
    }
    enviadas += 1;
  }
  return enviadas;
}
