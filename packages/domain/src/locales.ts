export const LOCAL_CODES = [
  { codigo: "BEN2195-A1", sede: "Benavides" },
  { codigo: "BEN2195-A2", sede: "Benavides" },
  { codigo: "BEN2195-A3", sede: "Benavides" },
  { codigo: "ANG170-A1", sede: "Angamos" },
  { codigo: "ANG170-A2", sede: "Angamos" },
  { codigo: "ANG170-A3", sede: "Angamos" },
] as const;

export type LocalCode = (typeof LOCAL_CODES)[number]["codigo"];
export type LocalSite = (typeof LOCAL_CODES)[number]["sede"];

export function localSiteForCode(code: string): LocalSite | null {
  return LOCAL_CODES.find((local) => local.codigo === code)?.sede ?? null;
}
