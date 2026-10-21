import type { ReactNode } from "react";

export interface LineChartPoint {
  label: string;
  value: number;
}

interface LineChartProps {
  data: LineChartPoint[];
  height?: number;
  width?: number;
  color?: string;
  formatValue?: (value: number) => ReactNode;
  className?: string;
}

const PADDING = { top: 16, right: 16, bottom: 28, left: 40 };

/**
 * Gráfico de línea SVG sin dependencias externas.
 * Escala automáticamente al ancho disponible y respeta el tema.
 */
export function LineChart({
  data,
  height = 240,
  width = 720,
  color = "hsl(var(--primary))",
  formatValue,
  className,
}: LineChartProps) {
  if (data.length === 0) {
    return (
      <div className={className}>
        <p className="py-8 text-center font-body-sm text-on-surface-variant">
          Sin datos para el periodo
        </p>
      </div>
    );
  }

  const innerW = width - PADDING.left - PADDING.right;
  const innerH = height - PADDING.top - PADDING.bottom;
  const values = data.map((d) => d.value);
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const span = max - min || 1;

  const x = (i: number) =>
    PADDING.left + (data.length === 1 ? innerW / 2 : (i / (data.length - 1)) * innerW);
  const y = (v: number) => PADDING.top + innerH - ((v - min) / span) * innerH;

  const linePath = data.map((d, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(d.value)}`).join(" ");
  const areaPath = `${linePath} L ${x(data.length - 1)} ${PADDING.top + innerH} L ${x(0)} ${PADDING.top + innerH} Z`;

  const gridLines = 4;
  const ticks = Array.from({ length: gridLines + 1 }, (_, i) => min + (span / gridLines) * i);

  const labelStep = Math.ceil(data.length / 12);

  return (
    <div className={className}>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img">
        {ticks.map((t, i) => (
          <g key={i}>
            <line
              x1={PADDING.left}
              x2={width - PADDING.right}
              y1={y(t)}
              y2={y(t)}
              stroke="hsl(var(--surface-variant))"
              strokeWidth={1}
            />
            <text
              x={PADDING.left - 6}
              y={y(t)}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-on-surface-variant"
              fontSize={10}
            >
              {formatValue ? formatValue(t) : Math.round(t)}
            </text>
          </g>
        ))}
        <path d={areaPath} fill={color} opacity={0.12} />
        <path
          d={linePath}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {data.map((d, i) => (
          <circle key={d.label} cx={x(i)} cy={y(d.value)} r={2.5} fill={color} />
        ))}
        {data.map((d, i) =>
          i % labelStep === 0 || i === data.length - 1 ? (
            <text
              key={`label-${d.label}`}
              x={x(i)}
              y={height - 8}
              textAnchor="middle"
              className="fill-on-surface-variant"
              fontSize={10}
            >
              {d.label}
            </text>
          ) : null
        )}
      </svg>
    </div>
  );
}
