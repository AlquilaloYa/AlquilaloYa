import Link from "next/link";
import { Button } from "@contract/ui/components/button";

export default function NotFoundPage() {
  return (
    <main className="container flex min-h-screen flex-col items-center justify-center py-16 text-center">
      <h1 className="text-6xl font-bold">404</h1>
      <p className="mt-4 text-muted-foreground">
        La página que buscas no existe.
      </p>
      <div className="mt-8">
        <Button asChild>
          <Link href="/">Volver al inicio</Link>
        </Button>
      </div>
    </main>
  );
}