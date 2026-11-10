"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

export interface ProjectNavItem {
  href: string;
  label: string;
  hint: string;
}

/**
 * Highlights the active tab by comparing the current pathname — a client
 * component so it can call usePathname(), the rest of the sidebar (and the
 * layout around it) stays a server component.
 */
export function ProjectSidebarNav({ projectId, items }: { projectId: string; items: ProjectNavItem[] }) {
  const pathname = usePathname();
  const base = `/projects/${projectId}`;

  return (
    <nav className="flex flex-col gap-1.5">
      {items.map((item) => {
        const href = item.href ? `${base}/${item.href}` : base;
        const isActive = item.href ? pathname.startsWith(href) : pathname === base;

        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "rounded-lg border px-3 py-2 text-sm transition-colors",
              isActive
                ? "border-indigo-200 bg-indigo-50 font-medium text-indigo-700 dark:border-indigo-900 dark:bg-indigo-950/50 dark:text-indigo-300"
                : "border-surface-border bg-surface text-muted hover:border-indigo-200 hover:text-foreground dark:hover:border-indigo-900"
            )}
          >
            <span className="block">{item.label}</span>
            <span className="block text-xs text-muted">{item.hint}</span>
          </Link>
        );
      })}
    </nav>
  );
}
