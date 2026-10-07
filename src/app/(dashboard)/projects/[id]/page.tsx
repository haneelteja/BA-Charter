import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getProjectRole, isLead } from "@/lib/projects/role";
import { setEmbeddingConfig } from "./settings-actions";
import { Badge, Button, Card, Field, Input, Select } from "@/components/ui";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "green" | "indigo" | "amber" | "neutral"> = {
  Active: "green",
  Setup: "indigo",
  OnHold: "amber",
  Closed: "neutral",
};

const SECTIONS = [
  { href: "charter", label: "Charter", hint: "Knowledge model" },
  { href: "interactions", label: "Interactions", hint: "Capture & extraction" },
  { href: "action-items", label: "Action items", hint: "Follow-ups" },
  { href: "clarifications", label: "Clarifications", hint: "Open questions" },
  { href: "epics", label: "Epics", hint: "Delivery scope" },
  { href: "stories", label: "Stories", hint: "User stories" },
  { href: "changes", label: "Change requests", hint: "Impact analysis" },
  { href: "guardrails", label: "Guardrails", hint: "Quality rules" },
  { href: "search", label: "Search", hint: "Semantic retrieval" },
];

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    throw new Error("Not signed in.");
  }

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

  const role = await getProjectRole(supabase, id, auth.user.id);
  const userIsLead = isLead(role);
  const setEmbeddingConfigForProject = setEmbeddingConfig.bind(null, id);

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{project.project_name}</h1>
        <Badge tone={STATUS_TONE[project.status] ?? "neutral"}>{project.status}</Badge>
      </div>
      <p className="mt-1 text-sm text-muted">{project.client_name ?? "No client set"}</p>
      {project.description && <p className="mt-4 text-sm">{project.description}</p>}

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {SECTIONS.map((s) => (
          <Link key={s.href} href={`/projects/${id}/${s.href}`}>
            <Card className="h-full transition-all hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md dark:hover:border-indigo-800">
              <p className="font-medium">{s.label}</p>
              <p className="mt-0.5 text-xs text-muted">{s.hint}</p>
            </Card>
          </Link>
        ))}
      </div>

      <div className="mt-10 grid gap-6 sm:grid-cols-2">
        <section>
          <h2 className="text-sm font-semibold">Members</h2>
          <Card className="mt-3 divide-y divide-surface-border p-0">
            {members.map((m, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span>{m.user?.full_name ?? m.user?.email ?? "Unknown user"}</span>
                <span className="text-xs text-muted">{m.role_name}</span>
              </div>
            ))}
          </Card>
        </section>

        <section>
          <h2 className="text-sm font-semibold">Embedding model</h2>
          <Card className="mt-3">
            {project.embedding_provider && project.embedding_model ? (
              <p className="text-sm text-muted">
                {project.embedding_provider} / {project.embedding_model} — search and retrieval are active.
              </p>
            ) : (
              <p className="text-sm text-muted">
                Not configured yet — content won&apos;t be searchable until a Lead BA sets a model.
              </p>
            )}
            {userIsLead && (
              <form action={setEmbeddingConfigForProject} className="mt-3 flex flex-col gap-2">
                <Field label="Provider" htmlFor="embedding_provider">
                  <Select
                    id="embedding_provider"
                    name="embedding_provider"
                    defaultValue={project.embedding_provider ?? "openrouter"}
                  >
                    <option value="openrouter">OpenRouter</option>
                    <option value="openai">OpenAI</option>
                  </Select>
                </Field>
                <Field label="Model" htmlFor="embedding_model">
                  <Input
                    id="embedding_model"
                    name="embedding_model"
                    defaultValue={project.embedding_model ?? ""}
                    placeholder="e.g. openai/text-embedding-3-small"
                  />
                </Field>
                <Button type="submit" size="sm" className="w-fit">
                  Save
                </Button>
              </form>
            )}
          </Card>
        </section>
      </div>

      <p className="mt-10 text-xs text-muted">
        Agile Studio publish uses a stub reference until a real Pega Infinity instance is connected (EPIC 14).
      </p>
    </main>
  );
}
