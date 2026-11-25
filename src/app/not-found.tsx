import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="flex flex-col gap-2">
        <p
          className="text-sm font-medium uppercase tracking-widest"
          style={{ color: "var(--muted)" }}
        >
          404
        </p>
        <h1
          className="text-2xl font-semibold sm:text-3xl"
          style={{ color: "var(--ink)" }}
        >
          Page not found
        </h1>
        <p
          className="max-w-md text-sm sm:text-base"
          style={{ color: "var(--muted)" }}
        >
          The page you&apos;re looking for doesn&apos;t exist or may have been
          moved. Check the address, or head back to somewhere useful.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button asChild>
          <Link href="/markets">Browse Markets</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/">Go Home</Link>
        </Button>
      </div>
    </div>
  );
}