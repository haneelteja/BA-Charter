import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { createChangeRequest } from "./actions";
import { BackLink, Badge, Button, Card, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "indigo" | "amber" | "green" | "neutral" | "red"> = {
  Intake: "neutral",
  Analysing: "indigo",
  Brainstorm: "indigo",
  Decision: "amber",
  Accepted: "indigo",
  Deferred: "neutral",
  Rejected: "red",
  Propagated: "green",
};

export default async function ChangeRequestsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = await params;
  const supabase = await getSupabaseServerClient();

  const { data: changeRequests, error } = await supabase
    .from("change_request")
    .select("change_request_id, title, status, urgency, raised_at")
    .eq("project_id", projectId)
    .order("raised_at", { ascending: false });

  const createForProject = createChangeRequest.bind(null, projectId);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <BackLink href={`/projects/${projectId}`}>Back to project</BackLink>
      <PageHeader title="Change requests" />

      {error && (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {error.message}
        </div>
      )}

      <details className="mt-6">
        <summary className="cursor-pointer text-sm font-medium text-muted transition-colors hover:text-indigo-600 dark:hover:text-indigo-400">
          + New change request
        </summary>
        <Card className="mt-4">
          <form action={createForProject} className="flex flex-col gap-3">
            <Field label="Title" htmlFor="cr-title">
              <Input id="cr-title" name="title" placeholder="Title" required />
            </Field>
            <Field label="Description" htmlFor="cr-description">
              <Textarea id="cr-description" name="description" placeholder="Description" rows={4} />
            </Field>
            <Field label="Requested by" htmlFor="cr-requested-by">
              <Input id="cr-requested-by" name="requested_by" placeholder="Requested by" />
            </Field>
            <Field label="Urgency" htmlFor="cr-urgency">
              <Select id="cr-urgency" name="urgency" defaultValue="">
                <option value="">Urgency</option>
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
                <option value="Critical">Critical</option>
              </Select>
            </Field>
            <Button type="submit" variant="primary" className="w-fit">
              Create
            </Button>
          </form>
        </Card>
      </details>

      <ul className="mt-6 flex flex-col gap-3">
        {changeRequests?.map((c) => (
          <li key={c.change_request_id}>
            <Link href={`/projects/${projectId}/changes/${c.change_request_id}`}>
              <Card className="transition-all hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md dark:hover:border-indigo-800">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{c.title}</p>
                  <div className="flex shrink-0 gap-1.5">
                    <Badge tone={STATUS_TONE[c.status] ?? "neutral"}>{c.status}</Badge>
                    {c.urgency && <Badge>{c.urgency}</Badge>}
                  </div>
                </div>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
      {!error && (changeRequests ?? []).length === 0 && (
        <Card className="mt-6 text-sm text-muted">No change requests yet.</Card>
      )}
    </main>
  );
}
