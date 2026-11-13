import { eq } from "drizzle-orm";
import { AccessControl, Permission } from "@contract/domain/rbac";

export async function getClientPaymentNotificationRecipients(
  dbModule: typeof import("@contract/db"),
): Promise<string[]> {
  const { db, schema } = dbModule;
  const [activeUsers, additionalReaders] = await Promise.all([
    db
      .select({ id: schema.users.id, role: schema.users.role })
      .from(schema.users)
      .where(eq(schema.users.active, true)),
    db
      .select({ userId: schema.userPermissions.userId })
      .from(schema.userPermissions)
      .innerJoin(
        schema.permissions,
        eq(schema.permissions.id, schema.userPermissions.permissionId),
      )
      .where(eq(schema.permissions.key, Permission.WORK_ORDER_READ)),
  ]);
  const additionalReaderIds = new Set(
    additionalReaders.map(({ userId }) => userId),
  );
  return activeUsers
    .filter((user) =>
      AccessControl.forRole(
        user.role,
        additionalReaderIds.has(user.id) ? [Permission.WORK_ORDER_READ] : [],
      ).can(Permission.WORK_ORDER_READ),
    )
    .map(({ id }) => id);
}
