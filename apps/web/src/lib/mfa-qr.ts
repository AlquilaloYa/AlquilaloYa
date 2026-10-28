const SVG_DATA_URL_PATTERN = /^data:image\/svg\+xml(?:;[^,]*)?,/i;

export function normalizeTotpQrCode(value: string): string {
  let svg: string;

  if (SVG_DATA_URL_PATTERN.test(value)) {
    const commaIndex = value.indexOf(",");
    const metadata = value.slice(0, commaIndex).toLowerCase();
    const payload = value.slice(commaIndex + 1);
    if (metadata.includes(";base64")) {
      svg = Buffer.from(payload, "base64").toString("utf8");
    } else {
      try {
        svg = decodeURIComponent(payload);
      } catch {
        svg = payload;
      }
    }
  } else {
    svg = value.trim();
  }

  if (!/<svg\b[\s\S]*<\/svg\s*>/i.test(svg)) {
    throw new Error("Supabase devolvió un código QR SVG no válido");
  }

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
