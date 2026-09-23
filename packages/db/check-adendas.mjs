import postgres from "postgres";

const url = process.env.DATABASE_URL ?? "";
const sql = postgres(url, { max: 1 });

try {
  const rows = await sql`
    SELECT d.id as doc_id, d.filename, d.storage_key, d.contract_id,
           s.id as adenda_snap_id, s.datos_departamento->>'personaPago' as adenda_persona,
           c.snapshot_id as contrato_snap_id,
           cs.datos_departamento->>'personaPago' as contrato_persona,
           dep.persona_pago as dep_actual,
           dep.codigo as dep_codigo
    FROM documents d
    JOIN contract_snapshots s ON s.id = d.snapshot_id
    JOIN contracts c ON c.id = d.contract_id
    LEFT JOIN contract_snapshots cs ON cs.id = c.snapshot_id
    JOIN departments dep ON dep.id = c.departamento_id
    WHERE d.tipo IN ('ADENDA','ADENDA_EXTENSION')
    ORDER BY dep.codigo, d.filename
  `;
  console.log("ADENDAS:", rows.length);
  for (const r of rows) {
    const marcaAdenda = r.adenda_persona !== r.dep_actual ? "<< ADENDA INCORRECTA" : "ok";
    const marcaContrato = r.contrato_persona !== r.dep_actual ? "cont-incorrecto" : "cont-ok";
    console.log(`${r.filename.padEnd(26)} dep:${r.dep_codigo.padEnd(10)} adenda:${(r.adenda_persona ?? "?").padEnd(8)} contrato:${(r.contrato_persona ?? "?").padEnd(8)} actual:${r.dep_actual.padEnd(8)} ${marcaAdenda} ${marcaContrato}`);
  }
} finally {
  await sql.end();
}