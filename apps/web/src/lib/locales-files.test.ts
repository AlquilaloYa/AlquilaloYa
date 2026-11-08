import { afterEach, describe, expect, it, vi } from "vitest";
import {
  compressLocalUpload,
  maxLocalUploadBytes,
  MAX_LOCAL_IMAGE_UPLOAD_BYTES,
  MAX_LOCAL_PDF_UPLOAD_BYTES,
  MAX_LOCAL_SOURCE_UPLOAD_BYTES,
} from "./locales-files";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Locales upload limits", () => {
  it("allows images up to 12 MB and PDFs up to 8 MB", () => {
    expect(maxLocalUploadBytes("image/jpeg")).toBe(12 * 1024 * 1024);
    expect(maxLocalUploadBytes("image/png")).toBe(12 * 1024 * 1024);
    expect(maxLocalUploadBytes("image/webp")).toBe(12 * 1024 * 1024);
    expect(maxLocalUploadBytes("application/pdf")).toBe(8 * 1024 * 1024);
  });

  it("keeps the original upload limit at 25 MB and rejects unsupported MIME types", () => {
    expect(MAX_LOCAL_IMAGE_UPLOAD_BYTES).toBe(12 * 1024 * 1024);
    expect(MAX_LOCAL_PDF_UPLOAD_BYTES).toBe(8 * 1024 * 1024);
    expect(MAX_LOCAL_SOURCE_UPLOAD_BYTES).toBe(25 * 1024 * 1024);
    expect(maxLocalUploadBytes("image/gif")).toBeNull();
  });

  it("resizes images to at most 1200 px and encodes them at 65% quality", async () => {
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({ drawImage: vi.fn() })),
      toBlob: vi.fn((callback: BlobCallback) =>
        callback(new Blob(["optimized"], { type: "image/webp" })),
      ),
    };
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockResolvedValue({ width: 2400, height: 1200, close: vi.fn() }),
    );
    vi.stubGlobal("document", {
      createElement: vi.fn(() => canvas),
    });

    const image = new File(["original image data"], "local.jpg", {
      type: "image/jpeg",
    });
    const optimized = await compressLocalUpload(image);

    expect(canvas.width).toBe(1200);
    expect(canvas.height).toBe(600);
    expect(canvas.toBlob).toHaveBeenCalledWith(
      expect.any(Function),
      "image/webp",
      0.65,
    );
    expect(optimized.type).toBe("image/webp");
    expect(optimized.size).toBeLessThan(image.size);
  });
});
