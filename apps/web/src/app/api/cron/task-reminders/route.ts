import { and, eq, gte, lt, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { safeEqual } from "@/lib/secure-compare";
import {
  taskReminderDateRange,
  taskReminderMatchesTime,
  taskReminderSlot,
} from "@/lib/task-reminder-schedule";
import { sendTaskReminderPush } from "@/lib/task-web-push";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isStaleSubscriptionError(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("statusCode" in error)) {
    return false;
  }
  const statusCode = error.statusCode;
  return statusCode === 404 || statusCode === 410;
}

function formatLimaTime(value: string): string {
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(`2000-01-01T${value}:00-05:00`));
}

async function run(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Cron no configurado: define CRON_SECRET" }, { status: 503 });
  }
  if (!safeEqual(req.headers.get("authorization") ?? "", `Bearer ${secret}`)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (
    !process.env.WEB_PUSH_PUBLIC_KEY ||
    !process.env.WEB_PUSH_PRIVATE_KEY ||
    !process.env.WEB_PUSH_SUBJECT
  ) {
    return NextResponse.json({ error: "Web Push no está configurado" }, { status: 503 });
  }

  const slot = taskReminderSlot(new Date());
  if (!slot) return NextResponse.json({ ok: true, skipped: "outside_reminder_window" });

  try {
    const dbModule = await import("@contract/db");
    const { db, schema } = dbModule;
    const { start, end } = taskReminderDateRange(slot);
    const dueTasks = await db
      .select({
        id: schema.tasks.id,
        titulo: schema.tasks.titulo,
        descripcion: schema.tasks.descripcion,
        horaEjecucion: schema.tasks.horaEjecucion,
        repetirCadaHora: schema.tasks.repetirCadaHora,
        origenEvento: schema.tasks.origenEvento,
        userId: schema.tasks.createdByUserId,
      })
      .from(schema.tasks)
      .innerJoin(schema.users, eq(schema.tasks.createdByUserId, schema.users.id))
      .where(
        and(
          gte(schema.tasks.fechaLimite, start),
          lt(schema.tasks.fechaLimite, end),
          ne(schema.tasks.estado, "RESUELTA"),
        ),
      );
    const slotTime = slot.slice(11);

    let sent = 0;
    let skipped = 0;
    for (const task of dueTasks) {
      if (!task.userId) continue;
      if (
        !taskReminderMatchesTime(
          slotTime,
          task.horaEjecucion,
          task.origenEvento === "CHECKOFF" && task.repetirCadaHora,
        )
      ) {
        continue;
      }
      const [claim] = await db
        .insert(schema.taskPushReminders)
        .values({ taskId: task.id, slot })
        .onConflictDoNothing()
        .returning({ id: schema.taskPushReminders.id });
      if (!claim) {
        skipped++;
        continue;
      }

      const subscriptions = await db
        .select({
          id: schema.taskPushSubscriptions.id,
          endpoint: schema.taskPushSubscriptions.endpoint,
          p256dh: schema.taskPushSubscriptions.p256dh,
          auth: schema.taskPushSubscriptions.auth,
        })
        .from(schema.taskPushSubscriptions)
        .where(eq(schema.taskPushSubscriptions.userId, task.userId));

      if (!subscriptions.length) {
        await db
          .delete(schema.taskPushReminders)
          .where(eq(schema.taskPushReminders.id, claim.id));
        continue;
      }

      let delivered = false;
      for (const subscription of subscriptions) {
        try {
          await sendTaskReminderPush(
            {
              endpoint: subscription.endpoint,
              keys: { p256dh: subscription.p256dh, auth: subscription.auth },
            },
            {
              title: "Tarea pendiente para hoy",
              body:
                task.origenEvento === "CHECKOFF"
                  ? `${task.titulo} · Hora del check-out: ${formatLimaTime(task.horaEjecucion)}`
                  : task.titulo,
              href: "/agenda",
            },
          );
          delivered = true;
        } catch (error) {
          if (isStaleSubscriptionError(error)) {
            await db
              .delete(schema.taskPushSubscriptions)
              .where(eq(schema.taskPushSubscriptions.id, subscription.id));
            continue;
          }
          logger.error("No se pudo enviar recordatorio push de tarea", {
            taskId: task.id,
            userId: task.userId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      if (delivered) {
        sent++;
      } else {
        await db
          .delete(schema.taskPushReminders)
          .where(eq(schema.taskPushReminders.id, claim.id));
      }
    }

    return NextResponse.json({ ok: true, slot, dueTasks: dueTasks.length, sent, skipped });
  } catch (error) {
    logger.error("Falló el cron de recordatorios push de tareas", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Fallaron los recordatorios push" },
      { status: 500 },
    );
  }
}

export async function GET(req: Request) {
  return run(req);
}

export async function POST(req: Request) {
  return run(req);
}
