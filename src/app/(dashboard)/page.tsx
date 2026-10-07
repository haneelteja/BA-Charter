import Link from "next/link";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { createProject } from "./projects/actions";
import { Badge, Button, Card, Field, Input, Textarea } from "@/components/ui";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "green" | "indigo" | "amber" | "neutral"> = {
  Active: "green",
  Setup: "indigo",
  OnHold: "amber",
  Closed: "neutral",
};

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
    <main className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Your projects</h1>
      <p className="mt-1 text-sm text-muted">
        Every project you&apos;re a member of. Full context opens within the owning project; see the{" "}
        <Link href="/workspace" className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">
          workspace
        </Link>{" "}
        for everything aggregated across all of them.
      </p>

      {error && (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {error.message}
        </div>
      )}

      {!error && (projects ?? []).length === 0 && (
        <Card className="mt-6 text-sm text-muted">No projects yet — create one below.</Card>
      )}

      {(projects ?? []).length > 0 && (
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {(projects ?? []).map((project) => (
            <li key={project.project_id}>
              <Link href={`/projects/${project.project_id}`}>
                <Card className="h-full transition-all hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md dark:hover:border-indigo-800">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium">{project.project_name}</p>
                    <Badge tone={STATUS_TONE[project.status] ?? "neutral"}>{project.status}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted">{project.client_name ?? "No client set"}</p>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <details className="mt-10">
        <summary className="cursor-pointer text-sm font-medium text-muted transition-colors hover:text-indigo-600 dark:hover:text-indigo-400">
          + New project
        </summary>
        <Card className="mt-4 max-w-md">
          <form action={createProject} className="flex flex-col gap-3">
            <Field label="Project name" htmlFor="project_name">
              <Input id="project_name" name="project_name" placeholder="Project name" required />
            </Field>
            <Field label="Client name" htmlFor="client_name">
              <Input id="client_name" name="client_name" placeholder="Client name (optional)" />
            </Field>
            <Field label="Description" htmlFor="description">
              <Textarea id="description" name="description" placeholder="Description (optional)" rows={2} />
            </Field>
            <Field label="Start date" htmlFor="start_date">
              <Input id="start_date" name="start_date" type="date" />
            </Field>
            <Button type="submit" variant="primary" className="mt-1 w-fit">
              Create project
            </Button>
          </form>
        </Card>
      </details>
    </main>
  );
}
