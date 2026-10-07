import { getSupabaseServerClient } from "@/lib/supabase/server";
import { saveLlmSetting, clearLlmSetting } from "./actions";
import { Button, Card, Field, Input, PageHeader, Select } from "@/components/ui";

export const dynamic = "force-dynamic";

const PROVIDER_LABELS: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  openrouter: "OpenRouter (recommended — one key, any model)",
};

export default async function SettingsPage() {
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();

  const { data: existing } = auth.user
    ? await supabase
        .from("user_llm_setting")
        .select("provider, model, updated_at")
        .eq("user_id", auth.user.id)
        .maybeSingle()
    : { data: null };

  return (
    <main className="mx-auto max-w-xl px-6 py-10">
      <PageHeader
        title="Settings"
        subtitle="Configure the LLM provider used for AI actions you trigger — extraction, guardrail checks, retrieval and change-impact analysis all run under your own key, not a shared platform key."
      />

      {existing && (
        <Card className="mt-6">
          <p className="text-sm">
            Currently configured: <span className="font-medium">{existing.provider}</span> / {existing.model}
          </p>
          <form action={clearLlmSetting} className="mt-2">
            <button type="submit" className="text-xs text-red-600 hover:underline dark:text-red-400">
              Remove
            </button>
          </form>
        </Card>
      )}

      <Card className="mt-6">
        <form action={saveLlmSetting} className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold">{existing ? "Update provider" : "Add your LLM provider"}</h2>

          <Field label="Provider" htmlFor="provider">
            <Select id="provider" name="provider" required defaultValue={existing?.provider ?? "openrouter"}>
              <option value="openrouter">{PROVIDER_LABELS.openrouter}</option>
              <option value="openai">{PROVIDER_LABELS.openai}</option>
              <option value="anthropic">{PROVIDER_LABELS.anthropic}</option>
            </Select>
          </Field>

          <Field label="Model" htmlFor="model">
            <Input
              id="model"
              name="model"
              placeholder="e.g. openai/gpt-4.1-mini or anthropic/claude-sonnet-4.5 (OpenRouter), gpt-4.1-mini (OpenAI), claude-sonnet-5 (Anthropic)"
              required
              defaultValue={existing?.model ?? ""}
            />
          </Field>

          <Field label="API key" htmlFor="api_key" hint="Encrypted before storage. Never displayed again after saving.">
            <Input id="api_key" name="api_key" type="password" placeholder="sk-..." required autoComplete="off" />
          </Field>

          <Button type="submit" variant="primary" className="mt-1 w-fit">
            Save
          </Button>
        </form>
      </Card>
    </main>
  );
}
