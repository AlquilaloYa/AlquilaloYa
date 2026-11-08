import { describe, expect, it } from "vitest";
import {
  getAttachmentBytes,
  MAX_CONTACT_ATTACHMENTS_BYTES,
  validateContactAttachments,
} from "./contact-attachments";

describe("contact attachments size limits", () => {
  it("counts decoded bytes from base64 data URLs", () => {
    expect(getAttachmentBytes("data:image/jpeg;base64,YWJj")).toBe(3);
    expect(getAttachmentBytes("data:application/pdf;base64,YWJjZA==")).toBe(4);
  });

  it("rejects malformed or unsupported data URLs", () => {
    expect(getAttachmentBytes("not-a-data-url")).toBeNull();
    expect(getAttachmentBytes("data:image/gif;base64,YWJj")).toBeNull();
  });

  it("accepts attachments at the total limit and rejects anything over it", () => {
    const atLimit = `data:application/pdf;base64,${"A".repeat(
      Math.ceil(MAX_CONTACT_ATTACHMENTS_BYTES / 3) * 4,
    )}`;
    const oneByteOver = `data:application/pdf;base64,${"A".repeat(
      Math.ceil((MAX_CONTACT_ATTACHMENTS_BYTES + 1) / 3) * 4,
    )}`;

    expect(
      validateContactAttachments([{ dataUrl: atLimit }]),
    ).toBeNull();
    expect(
      validateContactAttachments([{ dataUrl: oneByteOver }]),
    ).toContain("3 MB");
  });

  it("rejects images over 1 MB without restricting PDF size individually", () => {
    const imageOverLimit = `data:image/jpeg;base64,${"A".repeat(
      Math.ceil((1024 * 1024 + 1) / 3) * 4,
    )}`;
    const pdfOverImageLimit = `data:application/pdf;base64,${"A".repeat(
      Math.ceil((1024 * 1024 + 1) / 3) * 4,
    )}`;

    expect(
      validateContactAttachments([{ dataUrl: imageOverLimit }]),
    ).toContain("1 MB");
    expect(
      validateContactAttachments([{ dataUrl: pdfOverImageLimit }]),
    ).toBeNull();
  });
});
