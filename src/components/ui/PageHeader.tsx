import Link from "next/link";
import type { ReactNode } from "react";

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-sm text-muted transition-colors hover:text-indigo-600 dark:hover:text-indigo-400"
    >
      <span aria-hidden="true">←</span> {children}
    </Link>
  );
}

export function PageHeader({
  title,
  subtitle,
  badge,
}: {
  title: string;
  subtitle?: ReactNode;
  badge?: ReactNode;
}) {
  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        {badge}
      </div>
      {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
    </div>
  );
}
