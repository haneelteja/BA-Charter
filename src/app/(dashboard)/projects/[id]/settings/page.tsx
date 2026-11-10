import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getProjectRole, isLead } from "@/lib/projects/role";
import { setEmbeddingConfig } from "../settings-actions";
import { Button, Card, Field, Input, PageHeader, Select } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ProjectSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    throw new Error("Not signed in.");
  }

  const { data: project, error } = await supabase
    .from("project")
    .select("embedding_provider, embedding_model")
    .eq("project_id", projectId)
    .single();
  if (error) {
    throw new Error(`Failed to load project: ${error.message}`);
  }

  const role = await getProjectRole(supabase, projectId, auth.user.id);
  const userIsLead = isLead(role);
  const setEmbeddingConfigForProject = setEmbeddingConfig.bind(null, projectId);

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <PageHeader title="Settings" subtitle="Project-wide configuration." />

      <section className="mt-6">
        <h2 className="text-sm font-semibold">Embedding model</h2>
        <Card className="mt-3">
          {project.embedding_provider && project.embedding_model ? (
            <p className="text-sm text-muted">
              {project.embedding_provider} / {project.embedding_model} — search, retrieval, and project
              chat are active.
            </p>
          ) : (
            <p className="text-sm text-muted">
              Not configured yet — content won&apos;t be searchable or answerable in chat until a Lead BA
              sets a model.
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

      <p className="mt-10 text-xs text-muted">
        Agile Studio publish uses a stub reference until a real Pega Infinity instance is connected (EPIC 14).
      </p>
    </main>
  );
}
