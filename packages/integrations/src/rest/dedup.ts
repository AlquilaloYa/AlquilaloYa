import type { DeduplicationStore } from "../core/connector";

/**
 * Deduplicación persistente respaldada en DB.
 * - Más seguro que MemoryDeduplicationStore para multi-instancia.
 * - Usa una tabla simple de dedup con TTL configurable.
 * - Implementa el puerto DeduplicationStore.
 */
export class DbDeduplicationStore implements DeduplicationStore {
  constructor(
    private readonly db: {
      execute: (sql: string, params?: unknown[]) => Promise<{ rowCount: number }>;
    },
    private readonly tableName = "connector_dedup",
    private readonly ttlMs = 86400_000 // 24 horas por defecto
  ) {}

  async exists(key: string): Promise<boolean> {
    const result = await this.db.execute(
      `SELECT 1 FROM ${this.tableName} WHERE key = $1 AND expires_at > NOW() LIMIT 1`,
      [key]
    );
    return result.rowCount > 0;
  }

  async mark(key: string): Promise<void> {
    const expiresAt = new Date(Date.now() + this.ttlMs).toISOString();
    await this.db.execute(
      `INSERT INTO ${this.tableName} (key, expires_at) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET expires_at = $2`,
      [key, expiresAt]
    );
  }
}

/**
 * Deduplicación en memoria (solo para desarrollo/testing).
 * No persiste entre reinicios del servidor.
 */
export class MemoryDeduplicationStore implements DeduplicationStore {
  private readonly store = new Set<string>();

  async exists(key: string): Promise<boolean> {
    return this.store.has(key);
  }

  async mark(key: string): Promise<void> {
    this.store.add(key);
  }
}
