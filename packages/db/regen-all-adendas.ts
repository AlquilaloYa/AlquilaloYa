import postgres from "postgres";
import { appendFileSync } from "node:fs";

import { renderAdendaHtml } from "../../apps/web/src/lib/pdf/render-adenda-html";
import { generateAdendaPdf } from "../../apps/web/src/lib/pdf/generate-pdf";
import { uploadObject } from "../../apps/web/src/lib/storage";
import { sha256Hex } from "../../apps/web/src/lib/hash";

const LOG = "C:/CP System ERP/packages/db/regen-progress.log";

const url = process.env.DATABASE_URL ?? "";

function logLine(msg: string) {
  try {
    appendFileSync(LOG, `${new Date().toISOString()} ${msg}\n`, "utf8");
  } catch {}
  console.log(msg);
}

async function main() {
  const sql = postgres(url, { max: 1 });
  logLine(`DATABASE_URL set: ${url.length > 20}`);
  try {
    const rows = await sql`
      SELECT d.id, d.contract_id, d.snapshot_id, d.tipo, d.version, d.filename, d.storage_key, d.idempotency_key,
             s.codigo_contrato,
             s.datos_cliente, s.datos_departamento, s.datos_contrato, s.clausulas, s.anexos,
             s.emitido_en, s.created_at,
             dep.persona_pago as dep_actual
      FROM documents d
      JOIN contract_snapshots s ON s.id = d.snapshot_id
      JOIN contracts c ON c.id = d.contract_id
      JOIN departments dep ON dep.id = c.departamento_id
      WHERE d.tipo IN ('ADENDA','ADENDA_EXTENSION')
      ORDER BY dep.codigo, d.filename
    `;
    logLine(`Total adendas a regenerar: ${rows.length}`);

    let ok = 0;
    let fail = 0;
    for (const row of rows) {
      try {
        logLine(`>> iniciando ${row.filename}`);
        const snapshot = {
          id: row.snapshot_id,
          codigoContrato: row.codigo_contrato,
          plantillaVersionId: "00000000-0000-0000-0000-000000000000",
          datosCliente: row.datos_cliente,
          datosDepartamento: row.datos_departamento,
          datosContrato: row.datos_contrato,
          clausulas: row.clausulas ?? [],
          anexos: row.anexos ?? [],
          inmutable: true,
          emitidoEn: row.emitido_en ? row.emitido_en.toISOString() : null,
          createdAt: row.created_at.toISOString(),
        };

        const html = renderAdendaHtml(snapshot as never);
        const cuentaLine = html.split("\n").find((l) => l.includes("cancelada en la"));
        logLine(`   cuenta: ${cuentaLine ? "ok" : "SIN CUENTA"}`);

        const pdf = await generateAdendaPdf(snapshot as never);
        logLine(`   pdf generado ${pdf.bytes.byteLength} B`);

        const bytes = new Uint8Array(pdf.bytes);
        const sha = sha256Hex(bytesINFO);
        const stored = await uploadObject(row.storage_key, bytes, "application/pdf");
        logLine(`   storage ok key=${stored.key}`);

        await sql`
          UPDATE documents
          SET size_bytes = ${pdf.bytes.byteLength}, sha256 = ${sha}, estado_generacion = 'GENERADO', error = NULL, updated_at = now()
          WHERE id = ${row.id}
        `;
        logLine(`   -> OK sha:${sha.slice(0, 12)}`);
        ok += 1;
      } catch (e) {
        fail += 1;
        logLine(`   !! FALLO ${row.filename}: ${(e as Error).message}`);
      }
    }

    logLine(`FIN ok=${ok} fail=${fail}`);
    await sql.end();
    logLine("sql.end done");
  } catch (e) {
    logLine(`OUTER ERROR: ${(e as Error).stack ?? (e as Error).message}`);
    await sql.end().catch(() => {});
  }
}

await main();
appendFileSync(LOG, `${new Date().toISOString()} SCRIPT DONE EXIT\n`, "utf8");
process.exit(0);