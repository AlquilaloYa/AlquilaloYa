import {
  ContractService,
  TemplateService,
  ClauseService,
  AnnexService,
  SnapshotService,
} from "@contract/domain";

type DbModule = typeof import("@contract/db");

export interface ContractServicesActor {
  userId?: string | null;
  name?: string | null;
}

/**
 * Construye los servicios de dominio de la Fase 3 cableados a los repos Drizzle.
 * Se carga @contract/db de forma perezosa para no inicializar el pool
 * durante el build-time (las rutas API son force-dynamic).
 */
export async function buildContractServices(actor?: ContractServicesActor) {
  const dbModule = (await import("@contract/db")) as DbModule;

  const audit = new dbModule.DrizzleAuditRepository();
  const snapshotRepo = new dbModule.DrizzleSnapshotRepository();
  const contractRepo = new dbModule.DrizzleContractRepository();

  const contractService = new ContractService(
    contractRepo,
    new dbModule.ContractSnapshotPort(snapshotRepo),
    dbModule.createAuditSink(audit, actor)
  );

  const templateRepository = new dbModule.DrizzleTemplateRepository();
  const clauseRepository = new dbModule.DrizzleClauseRepository();
  const annexRepository = new dbModule.DrizzleAnnexRepository();

  const templateService = new TemplateService(templateRepository);
  const clauseService = new ClauseService(clauseRepository);
  const annexService = new AnnexService(annexRepository);
  const snapshotService = new SnapshotService(snapshotRepo);

  return {
    contractService,
    templateService,
    clauseService,
    annexService,
    snapshotService,
    contractRepository: contractRepo,
    snapshotRepository: snapshotRepo,
    templateRepository,
    clauseRepository,
    annexRepository,
  };
}