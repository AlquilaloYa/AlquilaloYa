import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@contract/config/env";
import type {
  StorageConnector,
  StoragePutInput,
  StoragePutResult,
} from "@contract/domain/document";

function buildSupabaseClient(): SupabaseClient | null {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * Implementación de StorageConnector.
 * - Si hay credenciales Supabase, usa Supabase Storage (privado).
 * - Si no, usa un bucket local en disco (desarrollo/sin backend).
 */
export class AppStorageConnector implements StorageConnector {
  private readonly supabase: SupabaseClient | null;
  private readonly bucket: string;
  private readonly localRoot: string;

  constructor() {
    this.bucket = env.SUPABASE_STORAGE_BUCKET || "documents";
    this.localRoot = join(process.cwd(), ".storage");
    this.supabase = buildSupabaseClient();
  }

  private get usesSupabase(): boolean {
    return this.supabase !== null;
  }

  async put(input: StoragePutInput): Promise<StoragePutResult> {
    const bytes = Buffer.from(input.bytes);
    if (this.usesSupabase && this.supabase) {
      const { error } = await this.supabase.storage
        .from(this.bucket)
        .upload(input.key, bytes, {
          contentType: input.mimeType,
          upsert: false,
        });
      if (error) {
        throw new Error(`Supabase upload falló: ${error.message}`);
      }
      return { key: input.key, sizeBytes: bytes.byteLength };
    }
    const target = join(this.localRoot, input.key);
    await mkdir(join(target, ".."), { recursive: true });
    await writeFile(target, bytes);
    return { key: input.key, sizeBytes: bytes.byteLength };
  }

  async get(storageKey: string): Promise<Uint8Array> {
    if (this.usesSupabase && this.supabase) {
      const { data, error } = await this.supabase.storage
        .from(this.bucket)
        .download(storageKey);
      if (error || !data) {
        throw new Error(`Supabase download falló: ${error?.message}`);
      }
      return new Uint8Array(await data.arrayBuffer());
    }
    const target = join(this.localRoot, storageKey);
    const buf = await readFile(target);
    return new Uint8Array(buf);
  }

  async del(storageKey: string): Promise<void> {
    if (this.usesSupabase && this.supabase) {
      const { error } = await this.supabase.storage
        .from(this.bucket)
        .remove([storageKey]);
      if (error) {
        throw new Error(`Supabase delete falló: ${error.message}`);
      }
      return;
    }
    await unlink(join(this.localRoot, storageKey));
  }

  async getSignedUrl(
    storageKey: string,
    options: { expiresInSeconds?: number } = {}
  ): Promise<string> {
    const expiresIn = options.expiresInSeconds ?? 900;
    if (this.usesSupabase && this.supabase) {
      const { data, error } = await this.supabase.storage
        .from(this.bucket)
        .createSignedUrl(storageKey, expiresIn);
      if (error || !data) {
        throw new Error(`Supabase signedUrl falló: ${error?.message}`);
      }
      return data.signedUrl;
    }
    return `local://${this.localRoot}/${storageKey}?expires=${expiresIn}`;
  }
}