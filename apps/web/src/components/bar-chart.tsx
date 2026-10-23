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
  height = 260,
  formatValue,
  color = "hsl(var(--primary))",
  className,
}: BarChartProps) {
  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className={className}>
      <div className="flex items-end gap-4" style={{ height }}>
        {data.map((d) => {
          const pct = Math.max(0, Math.min(100, (d.value / max) * 100));
          const barColor = d.color ?? color;
          const displayValue = formatValue ? formatValue(d.value) : d.value;
          return (
            <div
              key={d.label}
              className="flex flex-1 flex-col items-center justify-end gap-2"
              title={formatValue ? `${d.label}: ${String(formatValue(d.value))}` : d.label}
            >
              <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-bold text-on-surface shadow-sm">
                {displayValue}
              </span>
              <div
                className="w-full rounded-t-lg transition-[height]"
                style={{
                  height: `${pct}%`,
                  minHeight: d.value > 0 ? 10 : 0,
                  backgroundColor: barColor,
                  boxShadow: "0 6px 18px -12px currentColor",
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex gap-4 border-t border-border pt-3">
        {data.map((d) => (
          <span
            key={d.label}
            className="flex-1 truncate text-center text-sm font-semibold text-on-surface-variant"
          >
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}
