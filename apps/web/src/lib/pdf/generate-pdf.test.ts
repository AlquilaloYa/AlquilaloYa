import { describe, expect, it } from "vitest";
import { isAllowedPdfResourceUrl } from "./generate-pdf";

describe("isAllowedPdfResourceUrl", () => {
  it("allows the blank document and embedded images", () => {
    expect(isAllowedPdfResourceUrl("about:blank")).toBe(true);
    expect(isAllowedPdfResourceUrl("data:image/png;base64,abc")).toBe(true);
  });

  it("blocks network and local-file resources", () => {
    expect(isAllowedPdfResourceUrl("https://internal.example")).toBe(false);
    expect(isAllowedPdfResourceUrl("http://127.0.0.1")).toBe(false);
    expect(isAllowedPdfResourceUrl("file:///etc/passwd")).toBe(false);
    expect(isAllowedPdfResourceUrl("data:text/html,<h1>untrusted</h1>")).toBe(
      false,
    );
  });
});
