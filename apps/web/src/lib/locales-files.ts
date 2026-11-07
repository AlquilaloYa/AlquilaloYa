const MAX_IMAGE_SIDE = 1600;
const IMAGE_QUALITY = 0.75;

function optimizedName(name: string): string {
  return name.replace(/\.[^.]+$/, "") + ".webp";
}

function compressImage(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    void createImageBitmap(file)
      .then((bitmap) => {
        const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
        const width = Math.max(1, Math.round(bitmap.width * scale));
        const height = Math.max(1, Math.round(bitmap.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) {
          bitmap.close();
          reject(new Error("No se pudo preparar la imagen para comprimirla."));
          return;
        }
        context.drawImage(bitmap, 0, 0, width, height);
        bitmap.close();
        canvas.toBlob(
          (blob) => {
            if (!blob || blob.type !== "image/webp") {
              reject(new Error("El navegador no pudo generar la imagen WebP comprimida."));
              return;
            }
            if (blob.size >= file.size) {
              resolve(file);
              return;
            }
            resolve(
              new File([blob], optimizedName(file.name), {
                type: "image/webp",
                lastModified: file.lastModified,
              }),
            );
          },
          "image/webp",
          IMAGE_QUALITY,
        );
      })
      .catch(() => reject(new Error(`No se pudo leer la imagen ${file.name}.`)));
  });
}

async function compressPdf(file: File): Promise<File> {
  const bytes = await file.arrayBuffer();
  const header = new TextDecoder().decode(bytes.slice(0, 1024));
  if (!header.includes("%PDF-")) {
    throw new Error(`${file.name} no parece ser un PDF válido.`);
  }
  const beginning = new TextDecoder().decode(bytes);
  if (/\/ByteRange\s*\[/.test(beginning)) return file;

  try {
    const { PDFDocument } = await import("pdf-lib");
    const document = await PDFDocument.load(bytes, { updateMetadata: false });
    const compressed = await document.save({ useObjectStreams: true });
    if (compressed.byteLength >= file.size) return file;
    const compressedBuffer = new ArrayBuffer(compressed.byteLength);
    new Uint8Array(compressedBuffer).set(compressed);
    return new File([compressedBuffer], file.name, {
      type: "application/pdf",
      lastModified: file.lastModified,
    });
  } catch {
    return file;
  }
}

export async function compressLocalUpload(file: File): Promise<File> {
  if (file.type === "application/pdf") return compressPdf(file);
  if (["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    return compressImage(file);
  }
  throw new Error("Solo se admiten PDF, JPG, PNG y WebP.");
}
