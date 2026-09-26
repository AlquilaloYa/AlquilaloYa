import { DrizzleDashboardRepository } from "./src/repositories/dashboard-repository";

async function main() {
  const repo = new DrizzleDashboardRepository();
  const r = await repo.getResumenPortafolio();
  console.log(JSON.stringify({
    unidadesTotales: r.unidadesTotales,
    ocupadas: r.ocupadas,
    disponibles: r.disponibles,
    tasaOcupacion: r.tasaOcupacion,
    mantenimiento: r.mantenimiento,
    aPuntoDeFinalizar: r.aPuntoDeFinalizar,
    proximosAVencer: r.proximosAVencer.length,
    ingresosYTD: r.ingresosYTD,
    egresos: r.egresos,
    resultadosYTD: r.resultadosYTD,
    incidencias: r.incidencias,
    morosidad: r.morosidad,
    clientesReportados: r.clientesReportados,
    enProceso: r.enProceso,
    pagosVencenHoy: r.pagosVencenHoy.length,
  }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});