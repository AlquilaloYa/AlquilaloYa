import type { NewNotificationRow } from "@contract/db/schema";

export type NotificationInput = Omit<
  NewNotificationRow,
  "id" | "userId" | "createdAt" | "isRead" | "readAt" | "isActive"
>;

export function notificationRows(
  userIds: readonly string[],
  notification: NotificationInput,
): NewNotificationRow[] {
  return Array.from(new Set(userIds)).map((userId) => ({
    ...notification,
    userId,
  }));
}
