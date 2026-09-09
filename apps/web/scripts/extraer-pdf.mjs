import { readFile } from "node:fs/promises";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const ruta = process.argv[2];
const buf = await readFile(ruta);
const pdf = await getDocument({ data: new Uint8Array(buf) }).promise;
let texto = "";
for (let i = 1; i <= pdf.numPages; i++) {
  const page = await pdf.getPage(i);
  const contenido = await page.getTextContent();
  texto += contenido.items.map((it) => ("str" in it ? it.str : "")).join("\n") + "\n";
}
process.stdout.write(JSON.stringify(texto));