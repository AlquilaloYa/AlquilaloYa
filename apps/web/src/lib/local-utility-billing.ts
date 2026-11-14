export function calcularMontoPorcentual(recibo: number, porcentaje: number): number {
  return Math.round((recibo * porcentaje / 100 + Number.EPSILON) * 100) / 100;
}

export function calcularImpuestoRenta(alquiler: number, porcentaje: number): number {
  return calcularMontoPorcentual(alquiler, porcentaje);
}
