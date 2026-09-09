import { Queue } from "bullmq";
import { env } from "@contract/config/env";

const redisUrl = env.REDIS_URL ?? "redis://localhost:6379";

export const queues = {
  pdf: new Queue("pdf-generation", {
    connection: { url: redisUrl },
  }),
  notifications: new Queue("notifications", {
    connection: { url: redisUrl },
  }),
} as const;

export type QueueName = keyof typeof queues;