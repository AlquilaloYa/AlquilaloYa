import { createHash } from "node:crypto";
import { lt, sql } from "drizzle-orm";

const SWEEP_KEY = "__client_portal_rate_limit_sweep_count__";

type SweepCounter = typeof globalThis & {
  [SWEEP_KEY]?: number;
};

export class ClientPortalRateLimitUnavailableError extends Error {
  constructor() {
    super("No fue posible verificar el límite de solicitudes.");
    this.name = "ClientPortalRateLimitUnavailableError";
  }
}

export async function checkClientPortalLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<boolean> {
  try {
    const dbModule = await import("@contract/db");
    const rateLimit = dbModule.schema.clientPortalRateLimits;
    const hashedKey = createHash("sha256").update(key).digest("hex");
    const expiredWindow = sql`
      ${rateLimit.windowStartedAt} <= now() - (${windowMs} * interval '1 millisecond')
    `;
    const [entry] = await dbModule.db
      .insert(rateLimit)
      .values({
        key: hashedKey,
        requestCount: 1,
        windowStartedAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: rateLimit.key,
        set: {
          requestCount: sql`
            CASE WHEN ${expiredWindow}
              THEN 1
              ELSE ${rateLimit.requestCount} + 1
            END
          `,
          windowStartedAt: sql`
            CASE WHEN ${expiredWindow}
              THEN now()
              ELSE ${rateLimit.windowStartedAt}
            END
          `,
          updatedAt: sql`now()`,
        },
      })
      .returning({ requestCount: rateLimit.requestCount });
    if (!entry) throw new Error("Rate limit upsert returned no row");

    const counter = globalThis as SweepCounter;
    counter[SWEEP_KEY] = (counter[SWEEP_KEY] ?? 0) + 1;
    if (counter[SWEEP_KEY] % 200 === 0) {
      await dbModule.db
        .delete(rateLimit)
        .where(lt(rateLimit.windowStartedAt, sql`now() - interval '1 day'`));
    }
    return entry.requestCount <= limit;
  } catch (error) {
    const errorCode =
      error && typeof error === "object" && "code" in error &&
      typeof error.code === "string"
        ? error.code
        : "unknown";
    console.error(
      "[client-portal-rate-limit] No se pudo comprobar el límite compartido.",
      { errorCode },
    );
    throw new ClientPortalRateLimitUnavailableError();
  }
}
