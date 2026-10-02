import Link from "next/link";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { createProject } from "./projects/actions";

export const dynamic = "force-dynamic";

export default async function WorkspacePage() {
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();

  // DashboardLayout also redirects unauthenticated requests, but Next.js can
  // render a layout and its page concurrently — this page's own query must
  // not assume the layout's redirect has already taken effect.
  if (!auth.user) {
    redirect("/sign-in");
  }

  const { data: memberships, error: membershipError } = await supabase
    .from("project_member")
    .select("project_id")
    .eq("user_id", auth.user.id);

  const projectIds = (memberships ?? []).map((m) => m.project_id);

  const { data: projects, error: projectError } = projectIds.length
    ? await supabase
        .from("project")
        .select("project_id, project_name, client_name, status")
        .in("project_id", projectIds)
        .order("created_at", { ascending: false })
    : { data: [], error: null };

  const error = membershipError ?? projectError;

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold">Your projects</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Every project you&apos;re a member of. Full context opens within the
        owning project; the cross-project workspace (My action items, My
        clarifications, Call preparation) lands in a later phase.
      </p>

      {error && (
        <div className="mt-6 rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {error.message}
        </div>
      )}

      {!error && (projects ?? []).length === 0 && (
        <p className="mt-6 text-sm text-neutral-500">
          No projects yet — create one below.
        </p>
      )}

      <ul className="mt-6 divide-y divide-neutral-200 dark:divide-neutral-800">
        {(projects ?? []).map((project) => (
          <li key={project.project_id} className="py-3">
            <Link href={`/projects/${project.project_id}`} className="font-medium hover:underline">
              {project.project_name}
            </Link>
            <p className="text-xs text-neutral-500">
              {project.client_name ?? "No client set"} · {project.status}
            </p>
          </li>
        ))}
      </ul>

      <details className="mt-10">
        <summary className="cursor-pointer text-sm font-medium">New project</summary>
        <form action={createProject} className="mt-4 flex flex-col gap-3">
          <input
            name="project_name"
            placeholder="Project name"
            required
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
          <input
            name="client_name"
            placeholder="Client name (optional)"
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
          <textarea
            name="description"
            placeholder="Description (optional)"
            rows={2}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
          <input
            name="start_date"
            type="date"
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
          <button
            type="submit"
            className="mt-1 w-fit rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background hover:bg-[#383838] dark:hover:bg-[#ccc]"
          >
            Create project
          </button>
        </form>
      </details>
    </main>
  );
}
