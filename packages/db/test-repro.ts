import postgres from "postgres";

console.log("MARKER start");

const url = process.env.DATABASE_URL ?? "";
const sql = postgres(url, { max: 1 });

console.log("MARKER connected");

try {
  const rows = await sql`
    SELECT d.id, d.filename, d.storage_key, d.snapshot_id,
           s.datos_departamento, s.datos_cliente, s.datos_contrato, s.clausulas, s.anexos,
           s.codigo_contrato, s.emitido_en, s.created_at,
           dep.persona_pago as dep_actual
    FROM documents d
    JOIN contract_snapshots s ON s.id = d.snapshot_id
    JOIN contracts c ON c.id = d.contract_id
    JOIN departments dep ON dep.id = c.departamento_id
    WHERE d.tipo IN ('ADENDA','ADENDA_EXTENSION')
    ORDER BY dep.codigo, d.filename
  `;
  console.log("MARKER rows:", rows.length, "first:", rows[0]?.filename);
} catch (e) {
  console.error("MARKER error:", (e as Error).message);
  process.exitCode = 1;
} finally {
  console.log("MARKER before end");
  await sql.end();
  console.log("MARKER after end");
}
console.log("MARKER done");