import type { ReactNode } from "react";

export interface StatCardProps {
  label: string;
  value: string | number;
  hint?: string;
  accent?: string;
  icon?: ReactNode;
}

export function StatCard({ label, value, hint, accent, icon }: StatCardProps) {
  return (
    <div className="rounded-lg border bg-card p-5 text-card-foreground shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        {icon ? <span className="text-muted-foreground">{icon}</span> : null}
      </div>
      <p
        className="mt-2 text-3xl font-bold tracking-tight"
        style={accent ? { color: accent } : undefined}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}