export type UUID = string;

export type ISO8601 = string;

export type AuditableEntity = {
  createdAt: ISO8601;
  updatedAt: ISO8601;
};

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export type Revision = {
  version: number;
  publishedAt: ISO8601 | null;
};