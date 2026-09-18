import fs from "node:fs";
const envText = fs.readFileSync("../../apps/web/.env", "utf8");
const match = envText.match(/DATABASE_URL=(.*)$/m);
const DATABASE_URL = match ? match[1].trim() : process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL missing");
const postgres = (await import("postgres")).default;
const sql = postgres(DATABASE_URL, { ssl: "require" });

const tvId = "7845f475-0e87-4add-8ba8-f91e62384e4e";
const [tv] = await sql`SELECT id, template_id, version, contenido FROM template_versions WHERE id = ${tvId}`;
if (!tv) {
  console.log("template version no encontrada");
} else {
  console.log("=== template version:", tv.id, "template:", tv.template_id, "version:", tv.version);
  const contenido = tv.contenido || "";
  const idx = contenido.indexOf("GARANT");
  console.log("idx GARANT:", idx);
  if (idx >= 0) {
    console.log("--- fragmento alrededor de GARANTIA ---");
    console.log(contenido.slice(Math.max(0, idx - 200), idx + 800));
  } else {
    const idx2 = contenido.indexOf("DÉCIMO SEXTA");
    console.log("idx DECIMO SEXTA:", idx2);
    if (idx2 >= 0) {
      console.log("--- fragmento ---");
      console.log(contenido.slice(Math.max(0, idx2 - 200), idx2 + 800));
    } else {
      console.log("no hay GARANTIA ni DECIMO SEXTA; largo contenido:", contenido.length);
    }
  }
}

await sql.end({ timeout: 5 });