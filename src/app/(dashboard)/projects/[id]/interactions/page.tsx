import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { createInteraction } from "./actions";
import { BackLink, Badge, Button, Card, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";

export const dynamic = "force-dynamic";

const SOURCE_TYPES = ["Transcript", "Email", "Chat", "ManualNote", "Document"];

export default async function InteractionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = await params;
  const supabase = await getSupabaseServerClient();

  const { data: interactions, error } = await supabase
    .from("interaction")
    .select("interaction_id, source_type, title, occurred_at, processing_status, ingested_at")
    .eq("project_id", projectId)
    .order("ingested_at", { ascending: false });

  const createForProject = createInteraction.bind(null, projectId);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <BackLink href={`/projects/${projectId}`}>Back to project</BackLink>
      <PageHeader title="Interactions" subtitle="Transcripts, emails, chats and notes captured for this project." />

      {error && (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {error.message}
        </div>
      )}

      <details className="mt-8">
        <summary className="cursor-pointer text-sm font-medium text-muted transition-colors hover:text-indigo-600 dark:hover:text-indigo-400">
          + Capture new interaction
        </summary>
        <Card className="mt-4">
          <form action={createForProject} className="flex flex-col gap-3">
            <Field label="Source type" htmlFor="source_type">
              <Select id="source_type" name="source_type" required>
                {SOURCE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Title" htmlFor="title">
              <Input id="title" name="title" placeholder="Title (optional)" />
            </Field>
            <Field label="Occurred at" htmlFor="occurred_at">
              <Input id="occurred_at" name="occurred_at" type="datetime-local" />
            </Field>
            <Field label="Content" htmlFor="content">
              <Textarea
                id="content"
                name="content"
                placeholder={
                  'Paste the transcript, email or notes here.\nFor multi-speaker transcripts, use "Speaker Name: what they said" per line.'
                }
                required
                rows={10}
                className="font-mono text-xs"
              />
            </Field>
            <Button type="submit" variant="primary" className="w-fit">
              Capture
            </Button>
          </form>
        </Card>
      </details>

      <ul className="mt-10 flex flex-col gap-3">
        {interactions?.map((i) => (
          <li key={i.interaction_id}>
            <Link href={`/projects/${projectId}/interactions/${i.interaction_id}`}>
              <Card className="transition-all hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md dark:hover:border-indigo-800">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{i.title || `Untitled ${i.source_type}`}</p>
                  <Badge>{i.processing_status}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted">{i.source_type}</p>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
      {!error && (interactions ?? []).length === 0 && (
        <Card className="mt-6 text-sm text-muted">No interactions captured yet.</Card>
      )}
    </main>
  );
}
