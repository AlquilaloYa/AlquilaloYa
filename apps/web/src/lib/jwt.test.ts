import { describe, expect, it } from "vitest";
import { decodeJwtPayload } from "./jwt";

function token(payload: unknown): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.firma`;
}

describe("decodeJwtPayload (SEC-015)", () => {
  it("lee el claim aal de la sesión", () => {
    expect(decodeJwtPayload(token({ aal: "aal1", sub: "u1" }))?.aal).toBe("aal1");
    expect(decodeJwtPayload(token({ aal: "aal2" }))?.aal).toBe("aal2");
  });

  it("devuelve null para tokens ausentes o malformados", () => {
    expect(decodeJwtPayload(undefined)).toBeNull();
    expect(decodeJwtPayload("")).toBeNull();
    expect(decodeJwtPayload("noesunjwt")).toBeNull();
    expect(decodeJwtPayload("a.%%%.c")).toBeNull();
  });

  it("maneja UTF-8 y rechaza payloads que no son objeto", () => {
    expect(decodeJwtPayload(token({ name: "José Ángel" }))?.name).toBe("José Ángel");
    const scalar = Buffer.from(JSON.stringify("hola")).toString("base64url");
    expect(decodeJwtPayload(`x.${scalar}.y`)).toBeNull();
  });
});
