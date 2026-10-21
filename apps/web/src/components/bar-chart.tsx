import type { ReactNode } from "react";

export interface BarChartDatum {
  label: string;
  value: number;
  color?: string;
}

interface BarChartProps {
  data: BarChartDatum[];
  height?: number;
  formatValue?: (value: number) => ReactNode;
  color?: string;
  className?: string;
}

/**
 * Gráfico de barras verticales sin dependencias externas.
 * Usa variables de tema para integrarse con modo claro/oscuro.
 */
export function BarChart({
  data,
  height = 220,
  formatValue,
  color = "hsl(var(--primary))",
  className,
}: BarChartProps) {
  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className={className}>
      <div className="flex items-end gap-3" style={{ height }}>
        {data.map((d) => {
          const pct = Math.max(0, Math.min(100, (d.value / max) * 100));
          const barColor = d.color ?? color;
          return (
            <div
              key={d.label}
              className="flex flex-1 flex-col items-center justify-end gap-1"
              title={formatValue ? `${d.label}: ${String(formatValue(d.value))}` : d.label}
            >
              <span className="font-mono-label text-on-surface-variant">
                {formatValue ? formatValue(d.value) : d.value}
              </span>
              <div
                className="w-full rounded-t-md transition-[height]"
                style={{
                  height: `${pct}%`,
                  minHeight: d.value > 0 ? 4 : 0,
                  backgroundColor: barColor,
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex gap-3 border-t pt-2">
        {data.map((d) => (
          <span
            key={d.label}
            className="flex-1 truncate text-center font-body-sm text-on-surface-variant"
          >
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}
