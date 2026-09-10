import fs from "node:fs";
const envText = fs.readFileSync(".env", "utf8");
const match = envText.match(/^DATABASE_URL=(.*)$/m);
const DATABASE_URL = match ? match[1].trim() : process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL missing");
const postgres = (await import("postgres")).default;
const sql = postgres(DATABASE_URL, { ssl: "require" });
const before = await sql`SELECT (SELECT count(*) FROM templates) AS templates, (SELECT count(*) FROM template_versions) AS template_versions, (SELECT count(*) FROM template_departments) AS template_departments, (SELECT count(*) FROM contracts) AS contracts, (SELECT count(*) FROM contract_snapshots) AS contract_snapshots;`;
console.log(JSON.stringify({ before: before[0] }, null, 2));
await sql.begin(async (tx) => {
  await tx`DELETE FROM contract_snapshots WHERE plantilla_version_id IN (SELECT id FROM template_versions)`;
  await tx`DELETE FROM contracts WHERE plantilla_version_id IN (SELECT id FROM template_versions)`;
  await tx`DELETE FROM template_departments`;
  await tx`DELETE FROM template_versions`;
  await tx`DELETE FROM templates`;
});
const after = await sql`SELECT (SELECT count(*) FROM templates) AS templates, (SELECT count(*) FROM template_versions) AS template_versions, (SELECT count(*) FROM template_departments) AS template_departments, (SELECT count(*) FROM contracts) AS contracts, (SELECT count(*) FROM contract_snapshots) AS contract_snapshots;`;
console.log(JSON.stringify({ after: after[0] }, null, 2));
await sql.end({ timeout: 5 });
