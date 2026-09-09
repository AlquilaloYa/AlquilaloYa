import { and, count, desc, eq } from "drizzle-orm";
import { db, schema } from "../index";
import { decryptJson, encryptJson, fingerprint } from "../crypto/credential-cipher";
import type {
  ConnectorCredentialsInput,
  ConnectorCredentialSummary,
  ConnectorFilter,
  ConnectorInstance,
  NewConnectorInstanceInput,
  UpdateConnectorInstanceInput,
} from "@contract/domain/integration";
import type {
  ConnectorRepository,
  CredentialRepository,
  ConnectorLogRepository,
} from "@contract/domain/integration";
import type { UUID } from "@contract/domain";

function toDomain(
  r: typeof schema.connector_instances.$inferSelect
): ConnectorInstance {
  return {
    id: r.id,
    type: r.type as ConnectorInstance["type"],
    provider: r.provider,
    name: r.name,
    description: r.description,
    status: r.status as ConnectorInstance["status"],
    enabled: r.enabled,
    config: (r.config ?? {}) as Record<string, unknown>,
    credentialId: r.credentialId,
    createdBy: r.createdBy,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

/** Persistencia de instancias de conector. */
export class DrizzleConnectorRepository implements ConnectorRepository {
  async findById(id: UUID): Promise<ConnectorInstance | null> {
    const [row] = await db
      .select()
      .from(schema.connector_instances)
      .where(eq(schema.connector_instances.id, id))
      .limit(1);
    return row ? toDomain(row) : null;
  }

  async findByType(type: string): Promise<ConnectorInstance[]> {
    const rows = await db
      .select()
      .from(schema.connector_instances)
      .where(eq(schema.connector_instances.type, type))
      .orderBy(desc(schema.connector_instances.createdAt));
    return rows.map(toDomain);
  }

  async list(filter: ConnectorFilter): Promise<ConnectorInstance[]> {
    const conditions = [];
    if (filter.type) conditions.push(eq(schema.connector_instances.type, filter.type));
    if (filter.provider) conditions.push(eq(schema.connector_instances.provider, filter.provider));
    if (filter.enabled !== undefined) conditions.push(eq(schema.connector_instances.enabled, filter.enabled));
    const where = conditions.length ? and(...conditions) : undefined;
    const limit = filter.limit ?? 50;
    const offset = filter.offset ?? 0;
    const rows = await db
      .select()
      .from(schema.connector_instances)
      .where(where)
      .orderBy(desc(schema.connector_instances.createdAt))
      .limit(limit)
      .offset(offset);
    return rows.map(toDomain);
  }

  async count(filter: ConnectorFilter): Promise<number> {
    const conditions = [];
    if (filter.type) conditions.push(eq(schema.connector_instances.type, filter.type));
    if (filter.provider) conditions.push(eq(schema.connector_instances.provider, filter.provider));
    if (filter.enabled !== undefined) conditions.push(eq(schema.connector_instances.enabled, filter.enabled));
    const where = conditions.length ? and(...conditions) : undefined;
    const [row] = await db
      .select({ value: count() })
      .from(schema.connector_instances)
      .where(where);
    return row?.value ?? 0;
  }

  async create(input: NewConnectorInstanceInput): Promise<ConnectorInstance> {
    const [row] = await db
      .insert(schema.connector_instances)
      .values({
        type: input.type,
        provider: input.provider,
        name: input.name,
        description: input.description ?? null,
        config: input.config ?? {},
        enabled: true,
      })
      .returning();
    if (!row) throw new Error("No se pudo crear el conector");
    return toDomain(row);
  }

  async update(id: UUID, changes: UpdateConnectorInstanceInput): Promise<ConnectorInstance> {
    const values: Partial<typeof schema.connector_instances.$inferInsert> = {
      ...(changes.provider !== undefined && { provider: changes.provider }),
      ...(changes.name !== undefined && { name: changes.name }),
      ...(changes.description !== undefined && { description: changes.description }),
      ...(changes.config !== undefined && { config: changes.config }),
      ...(changes.enabled !== undefined && { enabled: changes.enabled }),
      updatedAt: new Date(),
    };
    const [row] = await db
      .update(schema.connector_instances)
      .set(values)
      .where(eq(schema.connector_instances.id, id))
      .returning();
    if (!row) throw new Error("Conector no encontrado");
    return toDomain(row);
  }

  async setEnabled(id: UUID, enabled: boolean): Promise<ConnectorInstance> {
    const [row] = await db
      .update(schema.connector_instances)
      .set({ enabled, status: enabled ? "ENABLED" : "DISABLED", updatedAt: new Date() })
      .where(eq(schema.connector_instances.id, id))
      .returning();
    if (!row) throw new Error("Conector no encontrado");
    return toDomain(row);
  }

  async delete(id: UUID): Promise<void> {
    await db.delete(schema.connector_instances).where(eq(schema.connector_instances.id, id));
  }
}

/** Custodia de credenciales cifradas. */
export class DrizzleCredentialRepository implements CredentialRepository {
  async create(connectorId: UUID, creds: ConnectorCredentialsInput): Promise<ConnectorCredentialSummary> {
    const encrypted = encryptJson(creds);
    const [row] = await db
      .insert(schema.connector_credentials)
      .values({
        connectorId,
        authType: creds.authType,
        encrypted,
        fingerprint: fingerprint(creds),
        expiresAt: creds.authType === "OAUTH2" ? new Date(Date.now() + 3600_000) : null,
      })
      .returning();
    if (!row) throw new Error("No se pudo guardar la credencial");
    await db
      .update(schema.connector_instances)
      .set({ credentialId: row.id })
      .where(eq(schema.connector_instances.id, connectorId));
    return {
      id: row.id,
      authType: row.authType as ConnectorCredentialSummary["authType"],
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt?.toISOString() ?? null,
    };
  }

  async replace(connectorId: UUID, creds: ConnectorCredentialsInput): Promise<ConnectorCredentialSummary> {
    await this.delete(connectorId);
    return this.create(connectorId, creds);
  }

  async findByConnector(connectorId: UUID): Promise<ConnectorCredentialSummary | null> {
    const [row] = await db
      .select()
      .from(schema.connector_credentials)
      .where(eq(schema.connector_credentials.connectorId, connectorId))
      .limit(1);
    return row
      ? {
          id: row.id,
          authType: row.authType as ConnectorCredentialSummary["authType"],
          createdAt: row.createdAt.toISOString(),
          expiresAt: row.expiresAt?.toISOString() ?? null,
        }
      : null;
  }

  async getDecrypted(connectorId: UUID): Promise<ConnectorCredentialsInput | null> {
    const [row] = await db
      .select()
      .from(schema.connector_credentials)
      .where(eq(schema.connector_credentials.connectorId, connectorId))
      .limit(1);
    if (!row) return null;
    try {
      return decryptJson<ConnectorCredentialsInput>(row.encrypted);
    } catch {
      return null;
    }
  }

  async delete(connectorId: UUID): Promise<void> {
    await db
      .delete(schema.connector_credentials)
      .where(eq(schema.connector_credentials.connectorId, connectorId));
  }
}

/** Log de despachos de conectores. */
export class DrizzleConnectorLogRepository implements ConnectorLogRepository {
  async record(input: {
    connectorId: UUID;
    action: string;
    ok: boolean;
    statusCode?: number | null;
    payload?: Record<string, unknown> | null;
    error?: string | null;
  }): Promise<void> {
    await db.insert(schema.connector_logs).values({
      connectorId: input.connectorId,
      action: input.action,
      ok: input.ok,
      statusCode: input.statusCode ?? null,
      payload: input.payload ?? null,
      error: input.error ?? null,
    });
  }
}