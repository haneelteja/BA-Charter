import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { signOut } from "../(auth)/actions";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();

  if (!auth.user) {
    redirect("/sign-in");
  }

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex shrink-0 items-center justify-between border-b border-surface-border bg-surface/80 px-6 py-3 backdrop-blur-sm">
        <nav className="flex items-center gap-6 text-sm">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-indigo-600 text-[11px] font-bold text-white">
              BA
            </span>
            BA Charter
          </Link>
          <Link href="/workspace" className="text-muted transition-colors hover:text-indigo-600 dark:hover:text-indigo-400">
            Workspace
          </Link>
          <Link href="/settings" className="text-muted transition-colors hover:text-indigo-600 dark:hover:text-indigo-400">
            Settings
          </Link>
        </nav>
        <form action={signOut}>
          <button
            type="submit"
            className="text-sm text-muted transition-colors hover:text-foreground"
          >
            Sign out
          </button>
        </form>
      </header>
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
