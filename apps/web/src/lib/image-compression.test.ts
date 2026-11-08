import { afterEach, describe, expect, it, vi } from "vitest";
import { compressImageFile } from "./image-compression";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubImageEncoder(output: Blob) {
  const context = {
    drawImage: vi.fn(),
    fillRect: vi.fn(),
    fillStyle: "",
  };
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => context),
    toBlob: (callback: BlobCallback) => callback(output),
  };
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn().mockResolvedValue({ width: 4000, height: 2000, close: vi.fn() }),
  );
  vi.stubGlobal("document", {
    createElement: vi.fn(() => canvas),
  });
  return { canvas, context };
}

describe("compressImageFile", () => {
  it("resizes photos and emits a smaller WebP", async () => {
    const { canvas } = stubImageEncoder(new Blob(["small"], { type: "image/webp" }));
    const original = new File(["a".repeat(100)], "room.jpg", { type: "image/jpeg" });

    const result = await compressImageFile(original, "photo");

    expect(result.type).toBe("image/webp");
    expect(result.name).toBe("room.webp");
    expect(result.size).toBeLessThan(original.size);
    expect(canvas.width).toBe(1600);
    expect(canvas.height).toBe(800);
  });

  it("keeps vouchers as JPEG and paints transparent input on white", async () => {
    const { canvas, context } = stubImageEncoder(
      new Blob(["small"], { type: "image/jpeg" }),
    );
    const original = new File(["a".repeat(100)], "receipt.png", {
      type: "image/png",
    });

    const result = await compressImageFile(original, "voucher");

    expect(result.type).toBe("image/jpeg");
    expect(result.name).toBe("receipt.jpg");
    expect(canvas.width).toBe(2400);
    expect(canvas.height).toBe(1200);
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 2400, 1200);
  });

  it("normalizes unchanged JPEG voucher filenames to .jpg", async () => {
    stubImageEncoder(new Blob(["larger-encoded-image"], { type: "image/jpeg" }));
    const original = new File(["small"], "receipt.png", { type: "image/jpeg" });

    const result = await compressImageFile(original, "voucher");

    expect(result.name).toBe("receipt.jpg");
    expect(result.type).toBe("image/jpeg");
  });

  it("compresses contact document images to at most 1 MB", async () => {
    const { canvas } = stubImageEncoder(
      new Blob(["small"], { type: "image/jpeg" }),
    );
    const original = new File(["a".repeat(2 * 1024 * 1024)], "dni.png", {
      type: "image/png",
    });

    const result = await compressImageFile(original, "contactDocument");

    expect(result.type).toBe("image/jpeg");
    expect(result.name).toBe("dni.jpg");
    expect(result.size).toBeLessThanOrEqual(1024 * 1024);
    expect(canvas.width).toBe(2000);
    expect(canvas.height).toBe(1000);
  });

  it("leaves animated formats unchanged", async () => {
    const createImageBitmapMock = vi.fn();
    vi.stubGlobal("createImageBitmap", createImageBitmapMock);
    const animatedWebp = new File(
      [
        Uint8Array.from([
          0x52, 0x49, 0x46, 0x46, 22, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
          0x56, 0x50, 0x38, 0x58, 10, 0, 0, 0, 0x02,
        ]),
      ],
      "animation.webp",
      { type: "image/webp" },
    );

    await expect(compressImageFile(animatedWebp, "photo")).resolves.toBe(animatedWebp);
    expect(createImageBitmapMock).not.toHaveBeenCalled();
  });
});
