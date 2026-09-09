import { db } from "./worker.js";
import { clients } from "./schema/clients.js";
import { departments } from "./schema/departments.js";
import { users, permissions, rolePermissions } from "./schema/users.js";
import { APP_USERS } from "./users-directory.js";
import { templates, templateVersions, templateDepartments } from "./schema/templates.js";
import { clauses, clauseVersions } from "./schema/clauses.js";
import { annexes, annexVersions } from "./schema/annexes.js";
import { UserRole } from "@contract/domain/rbac";
import { Permission, PERMISSION_DESCRIPTIONS } from "@contract/domain/rbac";
import { permissionsForRole } from "@contract/domain/rbac";

const PERMISSION_KEYS = Object.values(Permission) as string[];

async function seedPermissions() {
  const inserted: { id: string; key: string }[] = [];
  for (const key of PERMISSION_KEYS) {
    const rows = await db
      .insert(permissions)
      .values({
        key,
        description: PERMISSION_DESCRIPTIONS[key as Permission] ?? key,
      })
      .onConflictDoNothing()
      .returning();
    inserted.push(...rows);
  }
  if (inserted.length === 0) {
    const existing = await db.select().from(permissions);
    return existing;
  }
  return inserted;
}

async function seedRolePermissions(permissionRows: { id: string; key: string }[]) {
  for (const role of Object.values(UserRole)) {
    const rolePerms = permissionsForRole(role as UserRole);
    for (const perm of rolePerms) {
      const row = permissionRows.find((p) => p.key === perm);
      if (row) {
        await db
          .insert(rolePermissions)
          .values({ role: role as UserRole, permissionId: row.id })
          .onConflictDoNothing();
      }
    }
  }
}

async function seedUsers() {
  for (const u of APP_USERS) {
    await db
      .insert(users)
      .values({ ...u, active: true })
      .onConflictDoNothing();
  }
}

async function seedPhase3() {
  const templateRows = [
    { clave: "PN_LARGO", nombre: "Arrendamiento Persona Natural - Largo", contenido: "Contrato de arrendamiento largo para persona natural..." },
    { clave: "PN_CORTO", nombre: "Arrendamiento Persona Natural - Corto", contenido: "Contrato de arrendamiento corto para persona natural..." },
    { clave: "PJ_LARGO", nombre: "Arrendamiento Persona Jurídica - Largo", contenido: "Contrato de arrendamiento largo para persona jurídica..." },
    { clave: "PJ_CORTO", nombre: "Arrendamiento Persona Jurídica - Corto", contenido: "Contrato de arrendamiento corto para persona jurídica..." },
  ];

  const deptos = await db.select({ id: departments.id }).from(departments).limit(1);

  for (const t of templateRows) {
    const [tpl] = await db
      .insert(templates)
      .values({ clave: t.clave, nombre: t.nombre })
      .onConflictDoNothing()
      .returning();
    if (!tpl) {
      continue;
    }
    await db.insert(templateVersions).values({
      templateId: tpl.id,
      version: 1,
      contenido: t.contenido,
      publicada: true,
      publicadoEn: new Date(),
    });
    if (deptos[0]) {
      await db
        .insert(templateDepartments)
        .values({ templateId: tpl.id, departamentoId: deptos[0].id })
        .onConflictDoNothing();
    }
  }

  const clauseSeed = [
    { clave: "CLA-OBJETO", nombre: "Objeto del contrato", contenido: "El arrendatario cede en arrendamiento..." },
    { clave: "CLA-CANON", nombre: "Canon de arrendamiento", contenido: "El arrendatario pagará un canon mensual de..." },
    { clave: "CLA-GARANTIA", nombre: "Depósito de garantía", contenido: "Se constituye un depósito de garantía equivalente a..." },
  ];
  for (const c of clauseSeed) {
    const [cl] = await db
      .insert(clauses)
      .values({ clave: c.clave, nombre: c.nombre })
      .onConflictDoNothing()
      .returning();
    if (cl) {
      await db.insert(clauseVersions).values({
        clauseId: cl.id,
        version: 1,
        contenido: c.contenido,
        publicada: "PUBLICADA",
      });
    }
  }

  if (deptos[0]) {
    const annexSeed = [
      { nombre: "Acta de entrega de inmueble", contenido: "Acta de entrega del inmueble..." },
      { nombre: "Anexo de servicios adicionales", contenido: "Servicios adicionales acordados..." },
    ];
    for (const a of annexSeed) {
      const [an] = await db
        .insert(annexes)
        .values({ departamentoId: deptos[0].id, nombre: a.nombre })
        .onConflictDoNothing()
        .returning();
      if (an) {
        await db.insert(annexVersions).values({
          annexId: an.id,
          version: 1,
          contenido: a.contenido,
          publicada: true,
          publicadoEn: new Date(),
        });
      }
    }
  }

  console.log("Seed Fase 3 completado: plantillas, cláusulas y anexos.");
}

async function seed() {
  console.log("Seeding database...");

  await seedPermissions().then(seedRolePermissions);

  await seedUsers();

  await db
    .insert(departments)
    .values([
      {
        codigo: "DEP-101",
        nombre: "Departamento Arrendamientos",
        numero: "101",
        personaPago: "Emely",
        precio: "2300",
        garantia: "2300",
        activo: true,
      },
      {
        codigo: "DEP-102",
        nombre: "Departamento Comercial",
        numero: "102",
        personaPago: "Emely",
        precio: "1500",
        garantia: "1500",
        activo: true,
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(clients)
    .values([
      {
        nombres: "Juan",
        apellidos: "Pérez",
        documentoIdentidad: "D12345678",
        ruc: null,
        tipoPersona: "NATURAL",
        email: "juan.perez@example.com",
        telefono: "+51999999999",
        activo: true,
      },
      {
        nombres: "Corporación Lambda SAC",
        apellidos: null,
        documentoIdentidad: "R20123456789",
        ruc: "20123456789",
        tipoPersona: "LEGAL",
        email: "contacto@lambda.pe",
        telefono: "+5112345678",
        activo: true,
      },
    ])
    .onConflictDoNothing();

  console.log("Seed Fase 2 completado: permisos, roles, usuarios, departamentos y clientes.");

  await seedPhase3();
}

seed()
  .then(() => {
    console.log("Seed finalizado.");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Error en seed:", error);
    process.exit(1);
  });
