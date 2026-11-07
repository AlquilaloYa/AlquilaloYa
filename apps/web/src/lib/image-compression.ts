export type ImageCompressionProfile = "photo" | "voucher";

export const MAX_SOURCE_IMAGE_BYTES = 30 * 1024 * 1024;

const profiles = {
  photo: {
    maxDimension: 1600,
    maxOutputBytes: 6 * 1024 * 1024,
    quality: 0.8,
    type: "image/webp",
  },
  voucher: {
    maxDimension: 2400,
    maxOutputBytes: 2.5 * 1024 * 1024,
    quality: 0.9,
    type: "image/jpeg",
  },
} as const;

function hasPngAnimation(bytes: Uint8Array): boolean {
  let offset = 8;
  while (offset + 8 <= bytes.length) {
    const length =
      bytes[offset]! * 0x1000000 +
      bytes[offset + 1]! * 0x10000 +
      bytes[offset + 2]! * 0x100 +
      bytes[offset + 3]!;
    const type = String.fromCharCode(
      bytes[offset + 4]!,
      bytes[offset + 5]!,
      bytes[offset + 6]!,
      bytes[offset + 7]!,
    );
    if (type === "acTL") return true;
    if (type === "IEND" || offset + 12 + length > bytes.length) return false;
    offset += 12 + length;
  }
  return false;
}

function hasWebpAnimation(bytes: Uint8Array): boolean {
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const type = String.fromCharCode(
      bytes[offset]!,
      bytes[offset + 1]!,
      bytes[offset + 2]!,
      bytes[offset + 3]!,
    );
    if (type === "ANIM" || type === "ANMF") return true;
    if (type === "VP8X" && (bytes[offset + 8]! & 0x02) !== 0) return true;
    const length =
      bytes[offset + 4]! |
      (bytes[offset + 5]! << 8) |
      (bytes[offset + 6]! << 16) |
      (bytes[offset + 7]! << 24);
    if (offset + 8 + length > bytes.length) return false;
    offset += 8 + length + (length % 2);
  }
  return false;
}

function fileNameForType(fileName: string, type: string): string {
  const stem = fileName.replace(/\.[^.]+$/, "") || "imagen";
  const extension =
    type === "image/webp" ? "webp" : type === "image/png" ? "png" : "jpg";
  return `${stem}.${extension}`;
}

async function canvasBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob> {
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, type, quality),
  );
  if (!blob) throw new Error("No se pudo optimizar la imagen en este navegador.");
  return blob;
}

export async function compressImageFile(
  file: File,
  profileName: ImageCompressionProfile,
): Promise<File> {
  const profile = profiles[profileName];
  if (!file.type.startsWith("image/")) return file;
  if (file.size < 1) throw new Error(`"${file.name}" está vacío.`);
  if (file.size > MAX_SOURCE_IMAGE_BYTES) {
    throw new Error(`"${file.name}" supera el límite de 30 MB antes de optimizar.`);
  }
  if (
    file.type !== "image/jpeg" &&
    file.type !== "image/jpg" &&
    file.type !== "image/png" &&
    file.type !== "image/webp"
  ) {
    if (file.size > profile.maxOutputBytes) {
      throw new Error(`El formato de "${file.name}" no se puede optimizar aquí; conviértelo a JPG o PNG.`);
    }
    return file;
  }
  const normalizedFile =
    file.type === "image/jpg"
      ? new File([file], file.name, { type: "image/jpeg", lastModified: file.lastModified })
      : file;
  const unchangedFile =
    profileName === "voucher" && normalizedFile.type === "image/jpeg"
      ? new File(
          [normalizedFile],
          fileNameForType(normalizedFile.name, "image/jpeg"),
          { type: "image/jpeg", lastModified: normalizedFile.lastModified },
        )
      : normalizedFile;

  if (file.type === "image/png" || file.type === "image/webp") {
    const header = new Uint8Array(
      await file.slice(0, Math.min(file.size, 1024 * 1024)).arrayBuffer(),
    );
    if (
      (file.type === "image/png" && hasPngAnimation(header)) ||
      (file.type === "image/webp" && hasWebpAnimation(header))
    ) {
      if (profileName === "voucher" && file.size > profile.maxOutputBytes) {
        throw new Error(`El formato animado de "${file.name}" no se puede optimizar como voucher.`);
      }
      return file;
    }
  }

  if (typeof createImageBitmap !== "function") {
    throw new Error("Este navegador no permite optimizar imágenes. Actualiza el navegador e inténtalo de nuevo.");
  }

  const bitmap = await createImageBitmap(normalizedFile);
  try {
    let maxDimension: number = profile.maxDimension;
    let quality: number = profile.quality;

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const scale = Math.min(
        1,
        maxDimension / Math.max(bitmap.width, bitmap.height),
      );
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("No se pudo preparar la imagen para optimizar.");

      if (profileName === "voucher") {
        context.fillStyle = "#fff";
        context.fillRect(0, 0, canvas.width, canvas.height);
      }
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

      const blob = await canvasBlob(canvas, profile.type, quality);
      if (blob.size < file.size && blob.size <= profile.maxOutputBytes) {
        const outputType = blob.type || profile.type;
        return new File([blob], fileNameForType(file.name, outputType), {
          type: outputType,
          lastModified: file.lastModified,
        });
      }
      if (blob.size <= profile.maxOutputBytes) return unchangedFile;

      if (attempt < 2) {
        quality = Math.max(0.76, quality - 0.05);
      } else {
        maxDimension = Math.max(
          profileName === "voucher" ? 1600 : 1200,
          Math.round(maxDimension * 0.85),
        );
        quality = Math.max(0.76, quality - 0.03);
      }
    }

    throw new Error(`No se pudo reducir "${file.name}" lo suficiente para subirla.`);
  } finally {
    bitmap.close();
  }
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error(`No se pudo leer "${file.name}".`));
        return;
      }
      resolve(reader.result);
    };
    reader.onerror = () => reject(new Error(`No se pudo leer "${file.name}".`));
    reader.readAsDataURL(file);
  });
}
