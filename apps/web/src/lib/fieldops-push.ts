import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { logger } from "@/lib/logger";

type DatabaseModule = typeof import("@contract/db");

function getFirebaseApp() {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) return null;

  const parsed: unknown = JSON.parse(serviceAccountJson);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON no contiene una cuenta de servicio válida");
  }

  const serviceAccount = parsed as Record<string, unknown>;
  if (
    typeof serviceAccount.project_id !== "string" ||
    typeof serviceAccount.client_email !== "string" ||
    typeof serviceAccount.private_key !== "string"
  ) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON no contiene las credenciales requeridas");
  }

  const existingApp = getApps().find((app) => app.name === "fieldops");
  return (
    existingApp ??
    initializeApp(
      {
        credential: cert({
          projectId: serviceAccount.project_id,
          clientEmail: serviceAccount.client_email,
          privateKey: serviceAccount.private_key,
        }),
        projectId: serviceAccount.project_id,
      },
      "fieldops",
    )
  );
}

export async function sendUrgentWorkOrderPush(
  dbModule: DatabaseModule,
  input: {
    employeeId: string;
    workOrderId: string;
    code: string;
    title: string;
  },
) {
  const app = getFirebaseApp();
  if (!app) {
    logger.warn("FCM no está configurado; se omitió el push de orden urgente", {
      workOrderId: input.workOrderId,
    });
    return;
  }

  const { db, schema } = dbModule;
  const [employee] = await db
    .select({ userId: schema.hrEmployees.userId })
    .from(schema.hrEmployees)
    .where(
      and(
        eq(schema.hrEmployees.id, input.employeeId),
        eq(schema.hrEmployees.estado, "ACTIVO"),
        isNull(schema.hrEmployees.deletedAt),
      ),
    )
    .limit(1);

  if (!employee?.userId) {
    logger.warn("No se envió push: el trabajador no tiene usuario vinculado", {
      employeeId: input.employeeId,
      workOrderId: input.workOrderId,
    });
    return;
  }

  const deviceTokens = await db
    .select({ token: schema.fieldopsPushTokens.token })
    .from(schema.fieldopsPushTokens)
    .where(eq(schema.fieldopsPushTokens.userId, employee.userId));
  if (!deviceTokens.length) {
    logger.info("No se envió push: el usuario no tiene dispositivos registrados", {
      userId: employee.userId,
      workOrderId: input.workOrderId,
    });
    return;
  }

  const tokens = deviceTokens.map(({ token }) => token);
  const response = await getMessaging(app).sendEachForMulticast({
    tokens,
    notification: {
      title: "Nueva tarea urgente",
      body: `${input.code}: ${input.title}`,
    },
    data: {
      type: "urgent_work_order",
      workOrderId: input.workOrderId,
      priority: "URGENTE",
    },
    android: {
      priority: "high",
      notification: {
        channelId: "fieldops-urgent",
        sound: "default",
      },
    },
  });

  const invalidTokens = response.responses.flatMap((result, index) => {
    const token = tokens[index];
    if (
      token &&
      !result.success &&
      (result.error?.code === "messaging/registration-token-not-registered" ||
        result.error?.code === "messaging/invalid-registration-token")
    ) {
      return [token];
    }
    return [];
  });
  if (invalidTokens.length) {
    await db
      .delete(schema.fieldopsPushTokens)
      .where(inArray(schema.fieldopsPushTokens.token, invalidTokens));
  }

  logger.info("Push de orden urgente procesado", {
    workOrderId: input.workOrderId,
    userId: employee.userId,
    sent: response.successCount,
    failed: response.failureCount,
    removedInvalidTokens: invalidTokens.length,
  });
}
