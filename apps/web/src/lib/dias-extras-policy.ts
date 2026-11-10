export const MAX_DIAS_EXTRAS = 7;
export const MONTO_POR_DIA_EXTRA = 100;

export function evaluarDiasExtras(
  dias: number,
  diasYaRegistrados = 0,
): {
  valido: boolean;
  permitido: boolean;
  requiereAdenda: boolean;
  monto: number;
} {
  const valido = Number.isInteger(dias) && dias > 0;
  const requiereAdenda =
    valido && (dias > MAX_DIAS_EXTRAS || diasYaRegistrados + dias > MAX_DIAS_EXTRAS);
  const permitido = valido && !requiereAdenda;
  return {
    valido,
    permitido,
    requiereAdenda,
    monto: permitido ? dias * MONTO_POR_DIA_EXTRA : 0,
  };
}
