import { DashboardShell } from "@/components/dashboard-shell";

export function PhasePlaceholder({
  title,
  phase,
  description,
}: {
  title: string;
  phase: string;
  description: string;
}) {
  return (
    <DashboardShell>
      <div className="rounded-lg border bg-card p-6">
        <h3 className="text-xl font-semibold">{title}</h3>
        <div className="mt-2 inline-flex rounded bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
          {phase}
        </div>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
          {description}
        </p>
      </div>
    </DashboardShell>
  );
}