const TOTP_ISSUER = "AlquilaYa ERP";

export function createTotpUri(email: string, secret: string): string {
  const label = `${encodeURIComponent(TOTP_ISSUER)}:${encodeURIComponent(email)}`;
  const parameters = new URLSearchParams({
    secret,
    issuer: TOTP_ISSUER,
    algorithm: "SHA1",
    digits: "6",
    period: "30",
  });
  return `otpauth://totp/${label}?${parameters.toString()}`;
}
