import postgres from "postgres";

const url = process.env.DATABASE_URL ?? "";
const sql = postgres(url, { max: 1 });

try {
  const r = await sql`
    SELECT d.filename, d.sha256, d.size_bytes, d.estado_generacion,
           dep.persona_pago, s.datos_departamento->>'personaPago' as snap_persona
    FROM documents d
    JOIN contracts c ON c.id = d.contract_id
    JOIN departments dep ON dep.id = c.departamento_id
    JOIN contract_snapshots s ON s.id = d.snapshot_id
    WHERE d.tipo IN ('ADENDA','ADENDA_EXTENSION')
    ORDER BY d.filename
  `;
  for (const a of r) {
    console.log(`${a.filename.padEnd(26)} ${a.sha256.slice(0,12)} ${a.size_bytes} ${(a.dep_persona ?? "?").padEnd(8)} snap:${a.snap_persona}`);
  }
} finally {
  await sql.end();
}