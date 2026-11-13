import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@contract/config/env";
import { NextResponse } from "next/server";

const COOKIE_NAME = "payment_verification";
const SERVICIOS_COOKIE_NAME = "servicio_verification";
const SESSION_SECONDS = 30 * 60;
const SERVICIOS_COOKIE_PATH = "/api/servicios-extras";

function signature(payload: string): string {
  return createHmac("sha256", env.CONNECTOR_ENCRYPTION_KEY)
    .update(payload)
    .digest("base64url");
}

function cookieValue(userId: string): string {
  const payload = `${userId}.${Date.now() + SESSION_SECONDS * 1000}`;
  return `${Buffer.from(payload).toString("base64url")}.${signature(payload)}`;
}

export function grantPaymentVerification(
  response: NextResponse,
  userId: string
): NextResponse {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  response.headers.append(
    "Set-Cookie",
    `${COOKIE_NAME}=${cookieValue(userId)}; Path=/api/payments; HttpOnly; SameSite=Lax; Max-Age=${SESSION_SECONDS}${secure}`
  );
  return response;
}

export function clearPaymentVerification(response: NextResponse): NextResponse {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  response.headers.append(
    "Set-Cookie",
    `${COOKIE_NAME}=; Path=/api/payments; HttpOnly; SameSite=Lax; Max-Age=0${secure}`
  );
  return response;
}

export function hasPaymentVerification(
  request: Request,
  userId: string
): boolean {
  const cookie = request.headers
    .get("cookie")
    ?.split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${COOKIE_NAME}=`))
    ?.slice(COOKIE_NAME.length + 1);
  if (!cookie) return false;

  try {
    const [encodedPayload, providedSignature] = cookie.split(".");
    if (!encodedPayload || !providedSignature) return false;
    const payload = Buffer.from(encodedPayload, "base64url").toString();
    const [sessionUserId, expiresAt] = payload.split(".");
    if (sessionUserId !== userId || !expiresAt || Number(expiresAt) <= Date.now()) {
      return false;
    }

    const expected = Buffer.from(signature(payload));
    const provided = Buffer.from(providedSignature);
    return expected.length === provided.length && timingSafeEqual(expected, provided);
  } catch {
    return false;
  }
}

/** Sesión de verificación MFA para vouchers de servicios extras
 * (cookie propia: Path=/api/servicios-extras). */
export function grantServiciosVerification(
  response: NextResponse,
  userId: string
): NextResponse {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  response.headers.append(
    "Set-Cookie",
    `${SERVICIOS_COOKIE_NAME}=${cookieValue(userId)}; Path=${SERVICIOS_COOKIE_PATH}; HttpOnly; SameSite=Lax; Max-Age=${SESSION_SECONDS}${secure}`
  );
  return response;
}

export function clearServiciosVerification(response: NextResponse): NextResponse {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  response.headers.append(
    "Set-Cookie",
    `${SERVICIOS_COOKIE_NAME}=; Path=${SERVICIOS_COOKIE_PATH}; HttpOnly; SameSite=Lax; Max-Age=0${secure}`
  );
  return response;
}

export function hasServiciosVerification(
  request: Request,
  userId: string
): boolean {
  const cookie = request.headers
    .get("cookie")
    ?.split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${SERVICIOS_COOKIE_NAME}=`))
    ?.slice(SERVICIOS_COOKIE_NAME.length + 1);
  if (!cookie) return false;

  try {
    const [encodedPayload, providedSignature] = cookie.split(".");
    if (!encodedPayload || !providedSignature) return false;
    const payload = Buffer.from(encodedPayload, "base64url").toString();
    const [sessionUserId, expiresAt] = payload.split(".");
    if (sessionUserId !== userId || !expiresAt || Number(expiresAt) <= Date.now()) {
      return false;
    }

    const expected = Buffer.from(signature(payload));
    const provided = Buffer.from(providedSignature);
    return expected.length === provided.length && timingSafeEqual(expected, provided);
  } catch {
    return false;
  }
}
