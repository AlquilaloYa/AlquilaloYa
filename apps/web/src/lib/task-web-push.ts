import {
  sendNotification,
  setVapidDetails,
  type PushSubscription,
} from "web-push";

export function webPushPublicKey(): string | null {
  const key = process.env.WEB_PUSH_PUBLIC_KEY;
  return key && process.env.WEB_PUSH_PRIVATE_KEY ? key : null;
}

export function sendTaskReminderPush(
  subscription: PushSubscription,
  payload: { title: string; body: string; href: string },
) {
  const publicKey = process.env.WEB_PUSH_PUBLIC_KEY;
  const privateKey = process.env.WEB_PUSH_PRIVATE_KEY;
  const subject = process.env.WEB_PUSH_SUBJECT;
  if (!publicKey || !privateKey || !subject) {
    throw new Error("Web Push no está configurado completamente");
  }
  setVapidDetails(subject, publicKey, privateKey);
  return sendNotification(subscription, JSON.stringify(payload), {
    TTL: 60 * 30,
  });
}
