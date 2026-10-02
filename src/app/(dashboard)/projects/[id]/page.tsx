import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await getSupabaseServerClient();

  const { data: project, error } = await supabase
    .from("project")
    .select("*")
    .eq("project_id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load project: ${error.message}`);
  }
  if (!project) {
    notFound();
  }

  const { data: memberRows } = await supabase
    .from("project_member")
    .select("role_name, user_id")
    .eq("project_id", id);

  const userIds = (memberRows ?? []).map((m) => m.user_id);
  const { data: users } = userIds.length
    ? await supabase.from("app_user").select("user_id, full_name, email").in("user_id", userIds)
    : { data: [] };

  const members = (memberRows ?? []).map((m) => ({
    role_name: m.role_name,
    user: (users ?? []).find((u) => u.user_id === m.user_id) ?? null,
  }));

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold">{project.project_name}</h1>
      <p className="mt-1 text-sm text-neutral-500">
        {project.client_name ?? "No client set"} · {project.status}
      </p>
      {project.description && <p className="mt-4 text-sm">{project.description}</p>}

      <div className="mt-6 flex gap-3">
        <Link
          href={`/projects/${id}/charter`}
          className="rounded-full border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
        >
          Charter
        </Link>
        <Link
          href={`/projects/${id}/interactions`}
          className="rounded-full border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
        >
          Interactions
        </Link>
      </div>

      <h2 className="mt-8 text-sm font-medium">Members</h2>
      <ul className="mt-3 divide-y divide-neutral-200 dark:divide-neutral-800">
        {members.map((m, i) => (
          <li key={i} className="py-2 text-sm">
            {m.user?.full_name ?? m.user?.email ?? "Unknown user"} — {m.role_name}
          </li>
        ))}
      </ul>

      <div className="mt-10 rounded-md border border-neutral-200 p-4 text-sm text-neutral-500 dark:border-neutral-800">
        Meeting Ingestion, the charter, action items, clarifications, epics,
        stories and change requests land in later phases (see
        docs/EXECUTION_PLAN.md). This page is the Phase 0 proof that project
        creation, membership and RLS are wired correctly end to end.
      </div>
    </main>
  );
}
