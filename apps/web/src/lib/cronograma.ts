export function parseLocalDate(iso: string): Date {
  const partes = iso.slice(0, 10).split("-");
  const y = Number(partes[0] ?? 0);
  const m = Number(partes[1] ?? 1);
  const d = Number(partes[2] ?? 1);
  return new Date(y, m - 1, d);
}

export function addMonths(base: Date, n: number): Date {
  const day = base.getDate();
  const next = new Date(base.getFullYear(), base.getMonth() + n, 1);
  const last = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(day, last));
  return next;
}

export function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function cronogramaMeses(inicio: Date, fin: Date): Date[] {
  const out: Date[] = [];
  for (let i = 0; i < 120; i++) {
    const d = addMonths(inicio, i);
    if (d.getTime() > fin.getTime()) break;
    out.push(d);
  }
  return out;
}
