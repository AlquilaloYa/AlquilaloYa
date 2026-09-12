import fs from "node:fs";
import postgres from "../packages/db/node_modules/postgres/src/index.js";

const env = fs.readFileSync(".env", "utf8");
for (const line of env.split(/\r?\n/)) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2];
}

const CONTENIDO = fs.readFileSync("apps/web/src/lib/pdf/template-angamos.html", "utf8");
const sql = postgres(process.env.DATABASE_URL, { max: 1 });
try {
  const result = await sql.begin(async (tx) => {
    const rows = await tx`SELECT id FROM templates WHERE clave = ${"ANG_LARGO"} LIMIT 1`;
    let templateId;
    if (!rows[0]) {
      const created = await tx`
        INSERT INTO templates (clave, nombre)
        VALUES (${"ANG_LARGO"}, ${"Contrato_de_Arrendamiento_y_Documentos_Anexos_Miguel_Angamos"})
        RETURNING id`;
      templateId = created[0].id;
    } else {
      templateId = rows[0].id;
    }
    await tx`UPDATE template_versions SET publicada = false WHERE template_id = ${templateId}`;
    const versions = await tx`SELECT COALESCE(MAX(version), 0) + 1 AS next_version FROM template_versions WHERE template_id = ${templateId}`;
    const version = Number(versions[0].next_version);
    const inserted = await tx`
      INSERT INTO template_versions (template_id, version, contenido, publicada, publicado_en)
      VALUES (${templateId}, ${version}, ${CONTENIDO}, true, now())
      RETURNING id, version`;
    return { templateId, versionId: inserted[0].id, version: inserted[0].version, chars: CONTENIDO.length };
  });
  console.log(JSON.stringify(result));
} finally {
  await sql.end({ timeout: 5 });
}
