import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import { execFileSync } from "node:child_process";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const recipient = process.env.BACKUP_AGE_RECIPIENT;
const outDir = resolve(process.argv[2] ?? "backups");
const keep = Number.parseInt(process.env.BACKUP_RETENTION ?? "14", 10);
const pageSize = 100;

if (!supabaseUrl || !serviceKey || !recipient) {
  throw new Error(
    "Se requieren SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY y BACKUP_AGE_RECIPIENT.",
  );
}
if (!Number.isInteger(keep) || keep < 1) {
  throw new Error("BACKUP_RETENTION debe ser un entero mayor que cero.");
}

const apiBase = `${supabaseUrl.replace(/\/+$/, "")}/storage/v1`;

async function storageRequest(path, init = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      ...init.headers,
    },
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`Supabase Storage respondió ${response.status}: ${detail}`);
  }
  return response;
}

async function listDirectory(bucket, prefix) {
  const entries = [];
  for (let offset = 0; ; offset += pageSize) {
    const response = await storageRequest(
      `/object/list/${encodeURIComponent(bucket)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prefix,
          limit: pageSize,
          offset,
          sortBy: { column: "name", order: "asc" },
        }),
      },
    );
    const page = await response.json();
    if (!Array.isArray(page)) {
      throw new Error(
        `Respuesta de listado inválida para el bucket ${bucket}.`,
      );
    }
    entries.push(...page);
    if (page.length < pageSize) break;
  }
  return entries;
}

function safeSegment(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value !== "." &&
    value !== ".." &&
    !/[\\/\u0000-\u001f\u007f]/.test(value)
  );
}

function destinationPath(root, bucket, objectKey) {
  const segments = objectKey.split("/");
  if (
    !safeSegment(bucket) ||
    segments.some((segment) => !safeSegment(segment))
  ) {
    throw new Error("Storage devolvió una ruta de objeto no válida.");
  }
  const destination = resolve(root, "objects", bucket, ...segments);
  const rootPath = resolve(root, "objects") + sep;
  if (!destination.startsWith(rootPath)) {
    throw new Error(
      "La ruta del objeto queda fuera del directorio de respaldo.",
    );
  }
  return destination;
}

async function enumerateBucket(bucket, prefix = "") {
  const objects = [];
  for (const entry of await listDirectory(bucket.name, prefix)) {
    if (!safeSegment(entry.name)) {
      throw new Error(
        `Nombre de objeto o carpeta no válido en ${bucket.name}.`,
      );
    }
    const key = prefix ? `${prefix}/${entry.name}` : entry.name;
    const isFolder = entry.id == null && entry.metadata == null;
    if (isFolder) {
      objects.push(...(await enumerateBucket(bucket, key)));
      continue;
    }

    const destination = destinationPath(payloadStorage, bucket.name, key);
    await mkdir(dirname(destination), { recursive: true });
    const response = await storageRequest(
      `/object/${encodeURIComponent(bucket.name)}/${key
        .split("/")
        .map(encodeURIComponent)
        .join("/")}`,
    );
    if (!response.body) {
      throw new Error(
        `Storage devolvió un objeto vacío de respuesta: ${bucket.name}/${key}.`,
      );
    }
    const hash = createHash("sha256");
    let sizeBytes = 0;
    const hashingStream = new TransformStream({
      transform(chunk, controller) {
        hash.update(chunk);
        sizeBytes += chunk.byteLength;
        controller.enqueue(chunk);
      },
    });
    await pipeline(
      Readable.fromWeb(response.body.pipeThrough(hashingStream)),
      createWriteStream(destination, { flags: "wx" }),
    );
    objects.push({
      bucket: bucket.name,
      key,
      sizeBytes,
      sha256: hash.digest("hex"),
      contentType: entry.metadata?.mimetype ?? "application/octet-stream",
    });
  }
  return objects;
}

await mkdir(outDir, { recursive: true });
const timestamp = new Date()
  .toISOString()
  .replace(/[-:]/g, "")
  .replace(/\.\d{3}Z$/, "Z");
const encryptedArchive = join(outDir, `storage-${timestamp}.tar.gz.age`);
const checksumFile = `${encryptedArchive}.sha256`;
const temporaryDirectory = await mkdtemp(
  join(tmpdir(), "alquilaya-storage-backup-"),
);
const payloadStorage = join(temporaryDirectory, "payload", "storage");
const unencryptedArchive = join(
  temporaryDirectory,
  `storage-${timestamp}.tar.gz`,
);

try {
  const bucketResponse = await storageRequest("/bucket");
  const listedBuckets = await bucketResponse.json();
  if (!Array.isArray(listedBuckets) || listedBuckets.length === 0) {
    throw new Error(
      "Supabase Storage no devolvió buckets; no se generará un respaldo vacío.",
    );
  }

  const buckets = listedBuckets.map((bucket) => ({
    name: bucket.name,
    public: Boolean(bucket.public),
    fileSizeLimit: bucket.file_size_limit ?? null,
    allowedMimeTypes: bucket.allowed_mime_types ?? null,
  }));
  await mkdir(payloadStorage, { recursive: true });
  const objects = [];
  for (const bucket of buckets) {
    console.log(`Respaldando bucket ${bucket.name} ...`);
    objects.push(...(await enumerateBucket(bucket)));
  }

  await writeFile(
    join(payloadStorage, "manifest.json"),
    JSON.stringify(
      { version: 1, createdAt: new Date().toISOString(), buckets, objects },
      null,
      2,
    ),
    { flag: "wx" },
  );
  execFileSync(
    "tar",
    ["-czf", unencryptedArchive, "-C", temporaryDirectory, "payload"],
    {
      stdio: "inherit",
    },
  );
  execFileSync(
    "age",
    [
      "--encrypt",
      "--recipient",
      recipient,
      "--output",
      encryptedArchive,
      unencryptedArchive,
    ],
    { stdio: "inherit" },
  );

  const encryptedHash = createHash("sha256");
  const archiveStat = await stat(encryptedArchive);
  for await (const chunk of createReadStream(encryptedArchive))
    encryptedHash.update(chunk);
  await writeFile(
    checksumFile,
    `${encryptedHash.digest("hex")}  ${basename(encryptedArchive)}\n`,
    { flag: "wx" },
  );

  const previous = (await readdir(outDir))
    .filter(
      (name) =>
        /^storage-.*\.tar\.gz\.age$/.test(name) &&
        name !== basename(encryptedArchive),
    )
    .sort()
    .reverse()
    .slice(keep - 1);
  for (const name of previous) {
    await rm(join(outDir, name), { force: true });
    await rm(`${join(outDir, name)}.sha256`, { force: true });
  }

  console.log(
    `Storage respaldado: ${objects.length} objetos, ${archiveStat.size} bytes cifrados en ${encryptedArchive}`,
  );
} catch (error) {
  await rm(encryptedArchive, { force: true });
  await rm(checksumFile, { force: true });
  throw error;
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
