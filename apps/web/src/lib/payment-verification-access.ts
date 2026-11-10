const MIGUEL_EMAIL = "miguel.carpio@sistema.com";
const EMELY_EMAIL = "emely.carpio@sistema.com";
const ANGAMOS_PREFIX = "ANG";
const ANGAMOS_VERIFY_PREFIX = "ANG170-";
const BENAVIDES_PREFIX = "BEN2195-";

export type PaymentVerificationScope = "angamos" | "ben2195" | "all" | null;

export interface PaymentVerificationAccess {
  scope: PaymentVerificationScope;
  verifyPrefix: string | null;
  canVerify: boolean;
}

function normalized(value: string | null | undefined): string {
  return (value ?? "").trim().toUpperCase();
}

export function paymentVerificationAccess(
  email: string,
  isAdmin = false,
): PaymentVerificationAccess {
  // Los correos con cartera asignada mantienen su alcance aunque el rol sea
  // ADMIN: la restricción solo aplica a verificación de vouchers.
  switch (email.trim().toLowerCase()) {
    case MIGUEL_EMAIL:
      return { scope: "angamos", verifyPrefix: ANGAMOS_VERIFY_PREFIX, canVerify: true };
    case EMELY_EMAIL:
      return { scope: "ben2195", verifyPrefix: BENAVIDES_PREFIX, canVerify: true };
    default:
      if (isAdmin) return { scope: "all", verifyPrefix: null, canVerify: false };
      return { scope: null, verifyPrefix: null, canVerify: true };
  }
}

export function canViewVerificationPayment(
  email: string,
  contractCode: string,
  departmentCode: string | null,
  isAdmin = false,
): boolean {
  const code = normalized(contractCode);
  const department = normalized(departmentCode);
  const access = paymentVerificationAccess(email, isAdmin);
  const isAngamos = department.startsWith(ANGAMOS_PREFIX) ||
    code.startsWith(ANGAMOS_VERIFY_PREFIX);
  const isBen2195 = code.startsWith(BENAVIDES_PREFIX);

  if (access.scope === "angamos") return isAngamos;
  if (access.scope === "ben2195") return isBen2195;
  if (isAdmin) return true;
  return !isAngamos && !isBen2195;
}

export function canVerifyPayment(email: string, contractCode: string): boolean {
  const code = normalized(contractCode);
  const access = paymentVerificationAccess(email);

  if (access.scope === "angamos") return code.startsWith(ANGAMOS_VERIFY_PREFIX);
  if (access.scope === "ben2195") return code.startsWith(BENAVIDES_PREFIX);
  return !code.startsWith(ANGAMOS_VERIFY_PREFIX) && !code.startsWith(BENAVIDES_PREFIX);
}
