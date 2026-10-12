import { eq } from "drizzle-orm";
import { db } from "../src/worker.js";
import { connector_credentials } from "../src/schema/integrations.js";
import { userGoogleTokens } from "../src/schema/agenda.js";
import {
  currentKeyId,
  decryptJson,
  encryptJson,
  isEncryptedWithCurrentKey,
} from "../src/crypto/credential-cipher.js";

/**
 * Re-cifra credenciales y tokens con la clave ACTUAL (SEC-041/SEC-076).
 *
 * Procedimiento de rotacion de claves:
 *   1) Generar la clave nueva y ponerla en CONNECTOR_ENCRYPTION_KEY.
 *   2) Poner la clave VIEJA en CONNECTOR_ENCRYPTION_KEY_PREVIOUS.
 *   3) Ejecutar:  pnpm --filter @contract/db credentials:rotate
 *      (re-cifra todo con la clave nueva; los datos viejos se descifran con la
 *       clave previa).
 *   4) Verificar y eliminar CONNECTOR_ENCRYPTION_KEY_PREVIOUS.
 *
 * DRY_RUN=1 solo informa de lo que haria, sin escribir.
 * Requiere DATABASE_URL (y las claves de cifrado) via entorno/.env.
 */
const dryRun = process.env.DRY_RUN === "1";

async function main() {
  console.log(`Clave actual: ${currentKeyId()}${dryRun ? "  [DRY RUN]" : ""}`);

  let rotated = 0;
  let skipped = 0;
  let failed = 0;

  const creds = await db.select().from(connector_credentials);
  for (const row of creds) {
    if (isEncryptedWithCurrentKey(row.encrypted)) {
      skipped++;
      continue;
    }
    try {
      const plain = decryptJson<Record<string, unknown>>(row.encrypted);
      const next = encryptJson(plain);
      if (!dryRun) {
        await db
          .update(connector_credentials)
          .set({ encrypted: next, updatedAt: new Date() })
          .where(eq(connector_credentials.id, row.id));
      }
      rotated++;
    } catch (error) {
      failed++;
      console.error(
        `  ! connector_credentials ${row.id}: ${(error as Error).message}`
      );
    }
  }

  const tokens = await db.select().from(userGoogleTokens);
  for (const row of tokens) {
    const fields: { key: "accessToken" | "refreshToken"; value: string | null }[] = [
      { key: "accessToken", value: row.accessToken },
      { key: "refreshToken", value: row.refreshToken },
    ];
    const updates: { accessToken?: string; refreshToken?: string } = {};
    let changed = false;
    for (const f of fields) {
      if (!f.value || isEncryptedWithCurrentKey(f.value)) {
        if (f.value) skipped++;
        continue;
      }
      try {
        const plain = decryptJson<Record<string, unknown>>(f.value);
        updates[f.key] = encryptJson(plain);
        changed = true;
      } catch (error) {
        failed++;
        console.error(`  ! user_google_tokens ${row.id} (${f.key}): ${(error as Error).message}`);
      }
    }
    if (changed) {
      if (!dryRun) {
        await db
          .update(userGoogleTokens)
          .set({ ...updates, updatedAt: new Date() })
          .where(eq(userGoogleTokens.id, row.id));
      }
      rotated++;
    }
  }

  console.log(
    `\nRotados: ${rotated}  |  ya actualizados: ${skipped}  |  fallos: ${failed}`
  );
  if (failed > 0) {
    console.error(
      "Hay filas que no se pudieron descifrar. Verifica CONNECTOR_ENCRYPTION_KEY_PREVIOUS."
    );
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Fallo:", (e as Error).message);
    process.exit(1);
  });
