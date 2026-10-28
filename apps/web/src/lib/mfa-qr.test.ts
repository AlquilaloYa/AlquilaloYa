import { describe, expect, it } from "vitest";
import { normalizeTotpQrCode } from "./mfa-qr";

const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M1 1#x"/></svg>';

describe("normalizeTotpQrCode", () => {
  it("encodes raw SVG as an image data URL", () => {
    const result = normalizeTotpQrCode(SVG);

    expect(result).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
    expect(decodeURIComponent(result.slice(result.indexOf(",") + 1))).toBe(SVG);
  });

  it("normalizes percent-encoded SVG data URLs", () => {
    const result = normalizeTotpQrCode(
      `data:image/svg+xml;utf8,${encodeURIComponent(SVG)}`,
    );

    expect(decodeURIComponent(result.slice(result.indexOf(",") + 1))).toBe(SVG);
  });

  it("normalizes base64 SVG data URLs", () => {
    const result = normalizeTotpQrCode(
      `data:image/svg+xml;base64,${Buffer.from(SVG).toString("base64")}`,
    );

    expect(decodeURIComponent(result.slice(result.indexOf(",") + 1))).toBe(SVG);
  });

  it("rejects payloads that are not SVG", () => {
    expect(() => normalizeTotpQrCode("data:image/png;base64,AAAA")).toThrow(
      "Supabase devolvió un código QR SVG no válido",
    );
  });
});
