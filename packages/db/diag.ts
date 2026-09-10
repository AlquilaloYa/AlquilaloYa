import { db } from "./src";

async function main() {
  type Row = Record<string, unknown>;
  const q = async (t: string): Promise<Row[]> => (await db.execute(t)) as unknown as Row[];
  const contracts = await q(`SELECT codigo_contrato, estado, snapshot_id IS NOT NULL AS con_snapshot FROM contracts`);
  const documents = await q(
    `SELECT tipo, estado_generacion, storage_key IS NOT NULL AS en_storage, sha256 IS NOT NULL AS con_hash FROM documents`
  );
  const snapshots = await q(`SELECT count(*)::int AS n FROM contract_snapshots`);
  const payments = await q(`SELECT count(*)::int AS n FROM payments`);
  console.log("CONTRATOS:", JSON.stringify(contracts));
  console.log("DOCUMENTOS:", JSON.stringify(documents));
  console.log("SNAPSHOTS:", JSON.stringify(snapshots));
  console.log("PAGOS:", JSON.stringify(payments));
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});