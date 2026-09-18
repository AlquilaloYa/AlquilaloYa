import fs from "node:fs";
const envText = fs.readFileSync("../../apps/web/.env", "utf8");
const match = envText.match(/DATABASE_URL=(.*)$/m);
const DATABASE_URL = match ? match[1].trim() : process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL missing");
const postgres = (await import("postgres")).default;
const sql = postgres(DATABASE_URL, { ssl: "require" });

const rows = await sql`SELECT c.codigo_contrato, c.separacion, c.separacion_detalle->>'tipo' as tipo, c.separacion_detalle->>'monto' as monto, c.separacion_detalle->>'fecha' as fecha_contract, s.datos_contrato->'separacionDetalle'->>'tipo' as snap_tipo, s.datos_contrato->'separacionDetalle'->>'monto' as snap_monto, s.datos_contrato->'separacionDetalle'->>'fecha' as snap_fecha FROM contracts c LEFT JOIN contract_snapshots s ON s.id = c.snapshot_id WHERE c.separacion_detalle IS NOT NULL ORDER BY c.creado_en`;

for (const r of rows) {
  console.log(`${r.codigo_contrato.padEnd(14)} | contract tipo=${String(r.tipo).padEnd(9)} monto=${String(r.monto).padEnd(8)} fecha=${String(r.fecha_contract).padEnd(24)} | snap tipo=${String(r.snap_tipo).padEnd(9)} monto=${String(r.snap_monto).padEnd(8)} fecha=${String(r.snap_fecha)}`);
}

await sql.end({ timeout: 5 });