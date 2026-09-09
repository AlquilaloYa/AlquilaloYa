import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@contract/config/env";
import * as schema from "./schema/index";

/**
 * Singleton del pool de PostgreSQL.
 *
 * Importante: cada evaluación de este módulo compartirá el MISMO pool vía
 * `globalThis`. En Next.js (dev/prod) los módulos pueden re-evaluarse o
 * importarse por varias rutas; sin este guard cada `import("@contract/db")`
 * crearía un pool nuevo (hasta 10 conexiones c/u) y agotaría el `pool_size`
 * del pooler de Supabase (15 en sesión), causando:
 *   EMAXCONNSESSION: max clients reached in session mode.
 */
type SqlClient = ReturnType<typeof postgres>;

interface PoolRef {
  queryClient: SqlClient;
  db: ReturnType<typeof drizzle>;
}

interface GlobalPool {
  __contract_db_pool__?: PoolRef;
}

function getGlobal(): GlobalPool {
  return globalThis as unknown as GlobalPool;
}

function createPool(): PoolRef {
  const queryClient = postgres(env.DATABASE_URL, {
    // Pool pequeño: en serverless cada instancia abre su propio pool.
    max: 3,
    // prepare:false desactiva sentencias preparadas: requisito para el
    // pooler de TRANSACCIONES de Supabase (puerto 6543) y seguro con sesión.
    prepare: false,
    // Sin estos timeouts, postgres.js reintenta conexiones infinitamente y
    // un endpoint (p. ej. /api/auth/me) puede quedar colgado para siempre.
    connect_timeout: 5,
    timeout: 10,
    idle_timeout: 20,
    // Fuerza UTF-8 en cada conexión: sin esto, el pooler de Supabase puede
    // devolver los acentos (los bytes UTF-8 de la BD) con encoding ASCII,
    // corrompiendo "Á"/"ó" en las respuestas de la API.
    connection: { client_encoding: "utf8" },
  });
  const db = drizzle(queryClient, { schema });
  return { queryClient, db };
}

const ref: PoolRef = getGlobal().__contract_db_pool__ ?? createPool();

// Guarda la referencia para reutilizarla en evaluaciones futuras del módulo.
getGlobal().__contract_db_pool__ = ref;

export const queryClient = ref.queryClient;
export const db = ref.db;