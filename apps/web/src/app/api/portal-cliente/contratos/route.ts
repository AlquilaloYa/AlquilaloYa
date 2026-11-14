import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import {
  addSessionCookiesIfRefreshed,
  findCurrentClientContract,
  peruDateString,
  resolveClientPortalIdentity,
  sameOriginRequest,
} from "@/lib/client-portal-auth";
import { checkClientPortalLimit } from "@/lib/client-portal-rate-limit";
import { clientIp } from "@/lib/rate-limit";
import { getClientPaymentNotificationRecipients } from "@/lib/client-payment-notifications";
import { notificationRows } from "@/lib/notifications";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

class PortalContractError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function getActiveContract(
  request: Request,
  dbModule: typeof import("@contract/db"),
) {
  const session = await resolveClientPortalIdentity(request, dbModule);
  if (!session) throw new PortalContractError("Sesión no válida.", 401);
  const contract = await findCurrentClientContract(
    dbModule,
    session.identity.client.id,
    session.identity.client.departmentCode,
  );
  if (!contract) {
    throw new PortalContractError(
      "No encontramos un contrato vigente para este departamento.",
      404,
    );
  }
  return { session, contract };
}

/** GET /api/portal-cliente/contratos — datos del contrato, adendas y estado de renovación. */
export async function GET(request: Request) {
  try {
    const dbModule = await import("@contract/db");
    const { session, contract } = await getActiveContract(request, dbModule);
    const today = peruDateString();

    const [contractRow] = await dbModule.db
      .select({
        id: dbModule.schema.contracts.id,
        codigoContrato: dbModule.schema.contracts.codigoContrato,
        estado: dbModule.schema.contracts.estado,
        fechaInicio: dbModule.schema.contracts.fechaInicio,
        fechaFin: dbModule.schema.contracts.fechaFin,
        montoCanonMensual: dbModule.schema.contracts.montoCanonMensual,
        mantenimiento: dbModule.schema.contracts.mantenimiento,
        depositoGarantia: dbModule.schema.contracts.depositoGarantia,
        renovacionMeses: dbModule.schema.contracts.renovacionMeses,
        renuevaProximoMes: dbModule.schema.contracts.renuevaProximoMes,
        departamentoNombre: dbModule.schema.departments.nombre,
        departamentoCodigo: dbModule.schema.departments.codigo,
      })
      .from(dbModule.schema.contracts)
      .innerJoin(
        dbModule.schema.departments,
        eq(
          dbModule.schema.departments.id,
          dbModule.schema.contracts.departamentoId,
        ),
      )
      .where(eq(dbModule.schema.contracts.id, contract.id))
      .limit(1);
    if (!contractRow) {
      throw new PortalContractError("No encontramos el contrato vigente.", 404);
    }

    const [documents, renewalRows] = await Promise.all([
      dbModule.db
        .select({
          id: dbModule.schema.documents.id,
          tipo: dbModule.schema.documents.tipo,
          version: dbModule.schema.documents.version,
          filename: dbModule.schema.documents.filename,
          createdAt: dbModule.schema.documents.createdAt,
          fechaFinAdenda: sql<string | null>`CASE
            WHEN ${dbModule.schema.documents.tipo} = 'ADENDA_EXTENSION'
              THEN ${dbModule.schema.contractSnapshots.datosContrato}->>'fechaFin'
            ELSE ${dbModule.schema.contractSnapshots.datosContrato}->>'fechaFinAdenda'
          END`,
        })
        .from(dbModule.schema.documents)
        .innerJoin(
          dbModule.schema.contractSnapshots,
          eq(
            dbModule.schema.contractSnapshots.id,
            dbModule.schema.documents.snapshotId,
          ),
        )
        .where(
          and(
            eq(dbModule.schema.documents.contractId, contract.id),
            eq(dbModule.schema.documents.estadoGeneracion, "GENERADO"),
            isNull(dbModule.schema.documents.eliminadoEn),
            isNull(dbModule.schema.contractSnapshots.eliminadoEn),
          ),
        )
        .orderBy(desc(dbModule.schema.documents.createdAt)),
      dbModule.db
        .select({
          id: dbModule.schema.clientContractRenewalRequests.id,
          status: dbModule.schema.clientContractRenewalRequests.status,
          createdAt:
            dbModule.schema.clientContractRenewalRequests.createdAt,
          reviewedAt:
            dbModule.schema.clientContractRenewalRequests.reviewedAt,
        })
        .from(dbModule.schema.clientContractRenewalRequests)
        .where(
          and(
            eq(
              dbModule.schema.clientContractRenewalRequests.contractId,
              contract.id,
            ),
            eq(
              dbModule.schema.clientContractRenewalRequests.clientId,
              session.identity.client.id,
            ),
          ),
        )
        .orderBy(
          desc(dbModule.schema.clientContractRenewalRequests.createdAt),
        )
        .limit(1),
    ]);

    const contratoPdf = documents.find(
      (d) => d.tipo === "CONTRATO_PDF",
    );
    const adendas = documents
      .filter((d) => d.tipo === "ADENDA" || d.tipo === "ADENDA_EXTENSION")
      .map((d) => ({
        id: d.id,
        tipo: d.tipo,
        version: d.version,
        filename: d.filename,
        createdAt: d.createdAt?.toISOString?.() ?? null,
        fechaFinAdenda: d.fechaFinAdenda?.slice(0, 10) || null,
      }));

    // Fin vigente: una ADENDA_EXTENSION puede extender la fecha de fin.
    let fechaFinEfectiva = String(contractRow.fechaFin).slice(0, 10);
    for (const adenda of adendas) {
      if (adenda.tipo === "ADENDA_EXTENSION" && adenda.fechaFinAdenda) {
        if (adenda.fechaFinAdenda > fechaFinEfectiva) {
          fechaFinEfectiva = adenda.fechaFinAdenda;
        }
      }
    }

    const latestRenewal = renewalRows[0]
      ? {
          id: renewalRows[0].id,
          status: renewalRows[0].status,
          createdAt: renewalRows[0].createdAt?.toISOString?.() ?? null,
          reviewedAt: renewalRows[0].reviewedAt?.toISOString?.() ?? null,
        }
      : null;

    const response = NextResponse.json({
      contract: {
        id: contractRow.id,
        codigoContrato: contractRow.codigoContrato,
        estado: contractRow.estado,
        departamentoNombre: contractRow.departamentoNombre,
        departamentoCodigo: contractRow.departamentoCodigo,
        fechaInicio: String(contractRow.fechaInicio).slice(0, 10),
        fechaFin: String(contractRow.fechaFin).slice(0, 10),
        fechaFinEfectiva,
        montoCanonMensual: contractRow.montoCanonMensual,
        mantenimiento: contractRow.mantenimiento,
        depositoGarantia: contractRow.depositoGarantia,
        renovacionMeses: contractRow.renovacionMeses,
        renuevaProximoMes: contractRow.renuevaProximoMes,
      },
      contratoPdf: contratoPdf
        ? {
            id: contratoPdf.id,
            filename: contratoPdf.filename,
            createdAt: contratoPdf.createdAt?.toISOString?.() ?? null,
          }
        : null,
      adendas,
      renewalRequest: latestRenewal,
      today,
    });
    response.headers.set("Cache-Control", "no-store");
    return addSessionCookiesIfRefreshed(response, session);
  } catch (error) {
    if (error instanceof PortalContractError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo consultar tu contrato.",
      },
      { status: 500 },
    );
  }
}

/** POST /api/portal-cliente/contratos — action: "request-renewal". */
export async function POST(request: Request) {
  if (!sameOriginRequest(request)) {
    return NextResponse.json(
      { error: "Origen no permitido." },
      { status: 403 },
    );
  }
  try {
    const dbModule = await import("@contract/db");
    const { session, contract } = await getActiveContract(request, dbModule);
    if (
      !(await checkClientPortalLimit(
        `client-contract:${session.identity.client.id}:${clientIp(request.headers)}`,
        5,
        10 * 60_000,
      ))
    ) {
      return NextResponse.json(
        { error: "Demasiadas operaciones. Inténtalo más tarde." },
        { status: 429 },
      );
    }
    const body = (await request.json().catch(() => null)) as {
      action?: unknown;
      note?: unknown;
    } | null;
    if (body?.action !== "request-renewal") {
      return NextResponse.json(
        { error: "Solicitud no válida." },
        { status: 400 },
      );
    }
    const note =
      typeof body.note === "string" ? body.note.trim().slice(0, 500) : null;

    const today = peruDateString();
    const fechaFin = String(contract.endsAt).slice(0, 10);
    if (fechaFin < today) {
      throw new PortalContractError(
        "El contrato ya finalizó; contacta a administración.",
        409,
      );
    }

    const result = await dbModule.db.transaction(async (tx) => {
      const [existing] = await tx
        .select({
          id: dbModule.schema.clientContractRenewalRequests.id,
          status: dbModule.schema.clientContractRenewalRequests.status,
          createdAt:
            dbModule.schema.clientContractRenewalRequests.createdAt,
        })
        .from(dbModule.schema.clientContractRenewalRequests)
        .where(
          and(
            eq(
              dbModule.schema.clientContractRenewalRequests.contractId,
              contract.id,
            ),
            eq(
              dbModule.schema.clientContractRenewalRequests.clientId,
              session.identity.client.id,
            ),
            eq(
              dbModule.schema.clientContractRenewalRequests.status,
              "PENDING",
            ),
          ),
        )
        .for("update");
      if (existing) {
        return {
          alreadyRequested: true,
          id: existing.id,
          status: existing.status,
          createdAt: existing.createdAt?.toISOString?.() ?? null,
        };
      }

      const [created] = await tx
        .insert(dbModule.schema.clientContractRenewalRequests)
        .values({
          clientId: session.identity.client.id,
          contractId: contract.id,
          note,
          status: "PENDING",
        })
        .returning({
          id: dbModule.schema.clientContractRenewalRequests.id,
          createdAt: dbModule.schema.clientContractRenewalRequests.createdAt,
        });
      if (!created) {
        throw new PortalContractError(
          "No se pudo registrar la solicitud.",
          500,
        );
      }

      await tx
        .insert(dbModule.schema.clientPortalNotifications)
        .values({
          clientId: session.identity.client.id,
          workOrderId: null,
          type: "CONTRACT_RENEWAL_REQUESTED",
          title: "Solicitud de renovación enviada",
          body: "Recibimos tu solicitud de renovación de contrato. Administración la revisará y te contactará.",
          dedupeKey: `contract-renewal:${created.id}`,
        })
        .onConflictDoNothing();

      const recipients = await getClientPaymentNotificationRecipients(
        dbModule,
      );
      if (recipients.length) {
        await tx
          .insert(dbModule.schema.notifications)
          .values(
            notificationRows(recipients, {
              type: "CONTRACT_RENEWAL_REQUESTED",
              title: "Solicitud de renovación de contrato",
              body: `${session.identity.client.names} · ${session.identity.client.departmentCode} · solicita renovar su contrato.`,
              href: "/contratos",
              entityType: "CONTRACT",
              entityId: contract.id,
              dedupeKey: `client-contract-renewal:${created.id}`,
            }),
          )
          .onConflictDoNothing();
      }

      return {
        alreadyRequested: false,
        id: created.id,
        status: "PENDING",
        createdAt: created.createdAt?.toISOString?.() ?? null,
      };
    });

    const response = NextResponse.json({
      renewalRequest: {
        id: result.id,
        status: result.status,
        createdAt: result.createdAt,
      },
      alreadyRequested: result.alreadyRequested,
    });
    response.headers.set("Cache-Control", "no-store");
    return addSessionCookiesIfRefreshed(response, session);
  } catch (error) {
    if (error instanceof PortalContractError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo enviar la solicitud.",
      },
      { status: 500 },
    );
  }
}
