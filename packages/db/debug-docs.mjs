import fs from "node:fs";
const envText = fs.readFileSync("../../apps/web/.env", "utf8");
const match = envText.match(/DATABASE_URL=(.*)$/m);
const DATABASE_URL = match ? match[1].trim() : process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL missing");
const postgres = (await import("postgres")).default;
const sql = postgres(DATABASE_URL, { ssl: "require" });

const rows = await sql`SELECT contract_id, tipo, filename, estado_generacion, version, storage_key IS NOT NULL as has_storage, sha256, created_at, updated_at FROM documents ORDER BY created_at`;
for (const r of rows) {
  const cid = r.contract_id ? String(r.contract_id).slice(0, 8) : "null";
  console.log(`${String(r.tipo).padEnd(20)} | ${String(r.filename).padEnd(20)} | ${String(r.estado_generacion).padEnd(9)} | v${r.version} | c=${cid} | storage=${r.has_storage} | sha=${String(r.sha256).slice(0, 10)} | created=${r.created_at.toISOString()} | upd=${r.updated_at.toISOString()}`);
}

await sql.end({ timeout: 5 });