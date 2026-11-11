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
  // Cuando todos los vouchers (ya verificados y nuevos) tienen monto, el
  // abonado es la suma de sus montos: los vouchers verificados conservan el
  // suyo y los nuevos aportan el abono de esta verificación. Así no se
  // duplica `amountAlreadyPaid` con pagos históricos ya marcados PAGADO.
  const todosTienenMonto =
    vouchers.length > 0 &&
    vouchers.every((voucher) => typeof voucher.monto === "number");
  const montoPagado = todosTienenMonto
    ? vouchers.reduce((sum, voucher) => sum + (voucher.monto ?? 0), 0)
    : amountAlreadyPaid > 0
      ? amountAlreadyPaid
      : total;

  return {
    estado: montoPagado + 0.001 >= total ? "PAGADO" : "PARCIAL",
    montoPagado,
  };
}
