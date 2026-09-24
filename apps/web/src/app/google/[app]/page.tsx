import Link from "next/link";
import { DashboardShell } from "@/components/dashboard-shell";

export const dynamic = "force-dynamic";

interface GoogleApp {
  label: string;
  url: string;
}

const GOOGLE_APPS: Record<string, GoogleApp> = {
  gmail: {
    label: "Gmail",
    url: "https://mail.google.com/mail/u/0/",
  },
  drive: {
    label: "Google Drive",
    url: "https://drive.google.com",
  },
  sheets: {
    label: "Google Sheets",
    url: "https://docs.google.com/spreadsheets/u/0/",
  },
  docs: {
    label: "Google Docs",
    url: "https://docs.google.com/document/u/0/",
  },
  tasks: {
    label: "Google Tasks",
    url: "https://tasks.google.com/tasks/",
  },
};

export default function GoogleAppPage({
  params,
}: {
  params: { app: string };
}) {
  const app = GOOGLE_APPS[params.app];
  if (!app) {
    return (
      <DashboardShell>
        <div className="flex h-64 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
          <p>App de Google no reconocida.</p>
          <Link href="/dashboard" className="text-primary underline">
            Volver al Dashboard
          </Link>
        </div>
      </DashboardShell>
    );
  }
  return (
    <DashboardShell>
      <div className="flex h-full flex-col px-4 pt-4">
        <div className="mb-3 flex items-center gap-2">
          <span className="font-mono-label text-sm text-on-surface-variant">
            {app.label}
          </span>
          <a
            href={app.url}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-primary underline underline-offset-2"
          >
            Abrir en pestaña nueva
          </a>
        </div>
        <div className="h-[calc(100vh-8rem)] overflow-hidden rounded-lg border border-border">
          <iframe
            src={app.url}
            title={app.label}
            className="h-full w-full border-0"
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-downloads allow-modals"
          />
        </div>
      </div>
    </DashboardShell>
  );
}