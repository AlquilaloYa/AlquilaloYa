import { eq } from "drizzle-orm";
import { db, schema } from "../index";
import type { UserRow } from "../schema/users";

/** Acceso de lectura a usuarios para resolver autorización y filtros. */
export class DrizzleUserRepository {
  async findByEmail(email: string): Promise<UserRow | null> {
    const [row] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1);
    return row ?? null;
  }

  async findById(id: string): Promise<UserRow | null> {
    const [row] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, id))
      .limit(1);
    return row ?? null;
  }

  async listActive(): Promise<UserRow[]> {
    return db
      .select()
      .from(schema.users)
      .where(eq(schema.users.active, true))
      .orderBy(schema.users.name);
  }
}