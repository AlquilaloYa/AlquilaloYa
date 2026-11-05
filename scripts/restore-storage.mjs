import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import { execFileSync } from "node:child_process";
import { pipeline } from "node:stream/promises";

const archiveInput = process.argv[2];
const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const identity = process.env.BACKUP_AGE_IDENTITY;

if (!archiveInput || !supabaseUrl || !serviceKey || !identity) {
  throw new Error(
    "Uso: node scripts/restore-storage.mjs <respaldo.tar.gz.age>; configure SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY y BACKUP_AGE_IDENTITY.",
  );
}

const apiBase = `${supabaseUrl.replace(/\/+$/, "")}/storage/v1`;
const temporaryDirectory = await mkdtemp(
  join(tmpdir(), "alquilaya-storage-restore-"),
);
const decryptedArchive = join(temporaryDirectory, "storage.tar.gz");
const payloadDirectory = join(temporaryDirectory, "payload");
const checksumPath = `${archiveInput}.sha256`;

function safeSegment(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value !== "." &&
    value !== ".." &&
    !/[\\/\u0000-\u001f\u007f]/.test(value)
  );
}

async function checkHash(filePath, expected) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  if (hash.digest("hex") !== expected) {
    throw new Error(`El SHA-256 no coincide para ${filePath}.`);
  }
}

async function storageFetch(path, init = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      ...init.headers,
    },
  });
  return response;
}

async function ensureBucket(bucket) {
  if (!safeSegment(bucket.name))
    throw new Error("Nombre de bucket no válido en el manifiesto.");
  const bucketPath = `/bucket/${encodeURIComponent(bucket.name)}`;
  const existing = await storageFetch(bucketPath);
  if (existing.ok) {
    const currentBucket = await existing.json();
    if (!bucket.public && currentBucket.public) {
      throw new Error(
        `El bucket ${bucket.name} está público en el destino, pero el respaldo lo marca privado.`,
      );
    }
    return;
  }
  if (existing.status !== 404) {
    throw new Error(
      `No se pudo consultar el bucket ${bucket.name} (${existing.status}).`,
    );
  }

  const restorePublicBucket =
    bucket.public &&
    process.env.RESTORE_ALLOW_PUBLIC_STORAGE_BUCKETS === "true";
  if (bucket.public && !restorePublicBucket) {
    console.warn(
      `El bucket ${bucket.name} era público; se creará privado. Para preservar exposición pública, defina RESTORE_ALLOW_PUBLIC_STORAGE_BUCKETS=true explícitamente.`,
    );
  }
  const created = await storageFetch("/bucket", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      id: bucket.name,
      name: bucket.name,
      public: restorePublicBucket,
      file_size_limit: bucket.fileSizeLimit,
      allowed_mime_types: bucket.allowedMimeTypes,
    }),
  });
  if (!created.ok) {
    throw new Error(
      `No se pudo crear el bucket ${bucket.name} (${created.status}).`,
    );
  }
}

try {
  const checksum = await readFile(checksumPath, "utf8");
  const expected = checksum.trim().split(/\s+/)[0];
  if (!/^[a-f0-9]{64}$/i.test(expected)) {
    throw new Error("Archivo de checksum SHA-256 inválido.");
  }
  await checkHash(archiveInput, expected.toLowerCase());

  execFileSync(
    "age",
    [
      "--decrypt",
      "--identity",
      identity,
      "--output",
      decryptedArchive,
      archiveInput,
    ],
    { stdio: "inherit" },
  );

  const names = execFileSync("tar", ["-tzf", decryptedArchive], {
    encoding: "utf8",
  })
    .split(/\r?\n/)
    .filter(Boolean);
  for (const name of names) {
    if (
      name.startsWith("/") ||
      name.includes("\\") ||
      /[\u0000-\u001f\u007f]/.test(name) ||
      name.split("/").some((part) => part === "..") ||
      (name !== "payload" && !name.startsWith("payload/"))
    ) {
      throw new Error("El archivo Storage contiene una ruta no permitida.");
    }
  }
  const verboseNames = execFileSync("tar", ["-tvzf", decryptedArchive], {
    encoding: "utf8",
  })
    .split(/\r?\n/)
    .filter(Boolean);
  if (verboseNames.some((line) => !["-", "d"].includes(line[0]))) {
    throw new Error(
      "El archivo Storage contiene enlaces o entradas especiales no permitidas.",
    );
  }
  execFileSync(
    "tar",
    ["-xzf", decryptedArchive, "-C", temporaryDirectory, "--no-same-owner"],
    {
      stdio: "inherit",
    },
  );

  const manifestPath = join(payloadDirectory, "storage", "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (
    manifest.version !== 1 ||
    !Array.isArray(manifest.buckets) ||
    !Array.isArray(manifest.objects)
  ) {
    throw new Error("Manifiesto Storage inválido o no compatible.");
  }

  const bucketNames = new Set();
  for (const bucket of manifest.buckets) {
    if (bucketNames.has(bucket.name))
      throw new Error(`Bucket duplicado: ${bucket.name}.`);
    bucketNames.add(bucket.name);
    await ensureBucket(bucket);
  }

  let restoredBytes = 0;
  for (const object of manifest.objects) {
    if (
      !bucketNames.has(object.bucket) ||
      object.key.split("/").some((part) => !safeSegment(part))
    ) {
      throw new Error(
        "El manifiesto contiene una referencia de objeto no válida.",
      );
    }
    if (
      !/^[a-f0-9]{64}$/i.test(object.sha256) ||
      !Number.isSafeInteger(object.sizeBytes)
    ) {
      throw new Error(
        `Metadatos de integridad no válidos para ${object.bucket}/${object.key}.`,
      );
    }

    const root = resolve(payloadDirectory, "storage", "objects");
    const sourcePath = resolve(root, object.bucket, ...object.key.split("/"));
    const relativePath = relative(root, sourcePath);
    if (relativePath.startsWith(`..${sep}`) || relativePath === "..") {
      throw new Error("Ruta de objeto fuera del archivo Storage.");
    }
    const sourceStat = await lstat(sourcePath);
    if (!sourceStat.isFile() || sourceStat.size !== object.sizeBytes) {
      throw new Error(
        `Tamaño o tipo de archivo inválido para ${object.bucket}/${object.key}.`,
      );
    }
    await checkHash(sourcePath, object.sha256);

    const urlPath = `/object/${encodeURIComponent(object.bucket)}/${object.key
      .split("/")
      .map(encodeURIComponent)
      .join("/")}`;
    const upload = await storageFetch(urlPath, {
      method: "POST",
      headers: {
        "content-type": object.contentType || "application/octet-stream",
        "content-length": String(sourceStat.size),
        "x-upsert": "true",
      },
      body: createReadStream(sourcePath),
      duplex: "half",
    });
    if (!upload.ok) {
      const detail = (await upload.text()).slice(0, 500);
      throw new Error(
        `No se pudo restaurar ${object.bucket}/${object.key} (${upload.status}): ${detail}`,
      );
    }
    restoredBytes += sourceStat.size;
  }

  console.log(
    `Restauración Storage completada: ${manifest.objects.length} objetos, ${restoredBytes} bytes.`,
  );
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
