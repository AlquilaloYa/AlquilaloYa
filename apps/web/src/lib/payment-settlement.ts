export type VoucherPaymentAmount = {
  monto?: number;
  verificadoEn?: string | null;
};

export type VerifiedPaymentSettlement = {
  estado: "PAGADO" | "PARCIAL";
  montoPagado: number;
};

export function settleVerifiedPayment(
  vouchers: readonly VoucherPaymentAmount[],
  total: number,
  amountAlreadyPaid: number,
): VerifiedPaymentSettlement {
  // Los vouchers ya verificados en verificaciones anteriores ya están
  // incluidos en `amountAlreadyPaid`; solo se suman los montos de los
  // vouchers nuevos (sin verificar) que se están verificando ahora.
  const nuevos = vouchers.filter((voucher) => !voucher.verificadoEn);
  const nuevosTienenMontos =
    nuevos.length > 0 &&
    nuevos.every((voucher) => typeof voucher.monto === "number");
  const montoNuevos = nuevosTienenMontos
    ? nuevos.reduce((sum, voucher) => sum + (voucher.monto ?? 0), 0)
    : 0;
  const montoPagado = nuevosTienenMontos
    ? amountAlreadyPaid + montoNuevos
    : amountAlreadyPaid > 0
      ? amountAlreadyPaid
      : total;

  return {
    estado: montoPagado + 0.001 >= total ? "PAGADO" : "PARCIAL",
    montoPagado,
  };
}
