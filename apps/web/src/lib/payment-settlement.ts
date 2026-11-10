export type VoucherPaymentAmount = { monto?: number };

export type VerifiedPaymentSettlement = {
  estado: "PAGADO" | "PARCIAL";
  montoPagado: number;
};

export function settleVerifiedPayment(
  vouchers: readonly VoucherPaymentAmount[],
  total: number,
  amountAlreadyPaid: number,
): VerifiedPaymentSettlement {
  const vouchersHaveCompleteAmounts =
    vouchers.length > 0 &&
    vouchers.every((voucher) => typeof voucher.monto === "number");
  const voucherAmount = vouchersHaveCompleteAmounts
    ? vouchers.reduce((sum, voucher) => sum + (voucher.monto ?? 0), 0)
    : 0;
  const montoPagado =
    vouchersHaveCompleteAmounts
      ? voucherAmount
      : amountAlreadyPaid > 0
        ? amountAlreadyPaid
        : total;

  return {
    estado: montoPagado + 0.001 >= total ? "PAGADO" : "PARCIAL",
    montoPagado,
  };
}
