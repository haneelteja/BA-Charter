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
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-neutral-200 px-6 py-3 dark:border-neutral-800">
        <nav className="flex items-center gap-5 text-sm">
          <Link href="/" className="font-semibold">
            BA Charter
          </Link>
          <Link href="/settings" className="text-neutral-500 hover:text-foreground">
            Settings
          </Link>
        </nav>
        <form action={signOut}>
          <button type="submit" className="text-sm text-neutral-500 hover:text-foreground">
            Sign out
          </button>
        </form>
      </header>
      <div className="flex-1">{children}</div>
    </div>
  );
}
