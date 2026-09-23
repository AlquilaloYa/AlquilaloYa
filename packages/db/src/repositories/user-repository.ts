import { asc, desc, eq, ilike, or } from "drizzle-orm";
import { db, schema } from "../index";
import type { UserRow } from "../schema/users";

export type UserSortField = "name" | "email" | "role" | "createdAt";

export interface UserListOptions {
  limit?: number;
  offset?: number;
  sortBy?: UserSortField;
  sortDir?: "asc" | "desc";
  q?: string;
}

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

  async list(options: UserListOptions = {}): Promise<UserRow[]> {
    const limit = options.limit && options.limit > 0 ? options.limit : 100;
    const offset = options.offset && options.offset > 0 ? options.offset : 0;
    const col =
      options.sortBy === "email"
        ? schema.users.email
        : options.sortBy === "role"
          ? schema.users.role
          : options.sortBy === "createdAt"
            ? schema.users.createdAt
            : schema.users.name;
    const dir = options.sortDir === "desc" ? "desc" : "asc";
    return db
      .select()
      .from(schema.users)
      .where(
        options.q
          ? or(
              ilike(schema.users.name, `%${options.q}%`),
              ilike(schema.users.email, `%${options.q}%`)
            )
          : undefined
      )
      .orderBy(dir === "desc" ? desc(col) : asc(col))
      .limit(limit)
      .offset(offset);
  }

  async create(input: {
    email: string;
    name: string;
    role: UserRow["role"];
    active?: boolean;
  }): Promise<UserRow> {
    const [row] = await db
      .insert(schema.users)
      .values({
        email: input.email.toLowerCase().trim(),
        name: input.name,
        role: input.role,
        active: input.active ?? true,
      })
      .returning();
    if (!row) throw new Error("No se pudo crear el usuario");
    return row;
  }

  async update(
    id: string,
    input: Partial<{
      email: string;
      name: string;
      role: UserRow["role"];
      active: boolean;
    }>
  ): Promise<UserRow | null> {
    const [row] = await db
      .update(schema.users)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(schema.users.id, id))
      .returning();
    return row ?? null;
  }
}