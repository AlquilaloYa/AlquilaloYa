import fs from "node:fs";
const envText = fs.readFileSync("../../apps/web/.env", "utf8");
const match = envText.match(/DATABASE_URL=(.*)$/m);
const DATABASE_URL = match ? match[1].trim() : process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL missing");
const postgres = (await import("postgres")).default;
const sql = postgres(DATABASE_URL, { ssl: "require" });

const contactId = "82275fd6-fcd4-4639-9254-08c4065a33c1";

const contracts = await sql`SELECT c.id, c.codigo_contrato, c.cliente_id, c.departamento_id, c.plantilla_version_id, c.monto_canon_mensual, c.deposito_garantia, c.fecha_inicio, c.fecha_fin, c.estado, c.snapshot_id, c.separacion FROM contracts c JOIN clients cl ON cl.id = c.cliente_id WHERE cl.nombres ILIKE '%Luis%' AND cl.apellidos ILIKE '%Trujillo%'`;
console.log("contracts:", JSON.stringify(contracts, null, 2));

for (const c of contracts) {
  const docs = await sql`SELECT id, tipo, filename, estado_generacion, version, created_at FROM documents WHERE contract_id = ${c.id} ORDER BY created_at DESC LIMIT 5;`;
  console.log(`docs (${c.codigo_contrato}):`, JSON.stringify(docs, null, 2));

  if (c.snapshot_id) {
    const [snap] = await sql`SELECT datos_contrato, datos_cliente, datos_departamento FROM contract_snapshots WHERE id = ${c.snapshot_id}`;
    if (snap) {
      console.log(`  separacion:`, JSON.stringify(snap.datos_contrato?.separacion, null, 2));
    }
  }
}

await sql.end({ timeout: 5 });