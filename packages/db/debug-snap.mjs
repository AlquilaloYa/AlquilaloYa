import fs from "node:fs";
const envText = fs.readFileSync("../../apps/web/.env", "utf8");
const match = envText.match(/DATABASE_URL=(.*)$/m);
const DATABASE_URL = match ? match[1].trim() : process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL missing");
const postgres = (await import("postgres")).default;
const sql = postgres(DATABASE_URL, { ssl: "require" });

const snapId = "a987eff1-bfe0-4039-9e8c-a34197ed3f05";
const [snap] = await sql`SELECT datos_contrato FROM contract_snapshots WHERE id = ${snapId}`;
console.log("snapshot datos_contrato.separacionDetalle:", JSON.stringify(snap?.datos_contrato?.separacionDetalle, null, 2));

const contractId = "3458ef8b-b0d4-4844-8170-783f78c94d52";
const [contract] = await sql`SELECT separacion, separacion_detalle FROM contracts WHERE id = ${contractId}`;
console.log("contract separacion:", contract?.separacion);
console.log("contract separacion_detalle:", JSON.stringify(contract?.separacion_detalle, null, 2));

// Also check ALL contracts with separacion = true and tipo = TOTAL
const allTotal = await sql`SELECT c.id, c.codigo_contrato, c.separacion, c.separacion_detalle, c.deposito_garantia, s.datos_contrato->'separacionDetalle' as snap_sep FROM contracts c LEFT JOIN contract_snapshots s ON s.id = c.snapshot_id WHERE c.separacion = true`;
for (const r of allTotal) {
  console.log(`\n--- ${r.codigo_contrato} ---`);
  console.log("  separacion_detalle:", JSON.stringify(r.separacion_detalle, null, 2));
  console.log("  snap separacionDetalle:", JSON.stringify(r.snap_sep, null, 2));
}

await sql.end({ timeout: 5 });
