import { getSupabaseServerClient } from "@/lib/supabase/server";
import { saveLlmSetting, clearLlmSetting } from "./actions";

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
    <main className="mx-auto max-w-xl p-8">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Configure the LLM provider used for AI actions you trigger — extraction,
        guardrail checks, retrieval and change-impact analysis all run under
        your own key, not a shared platform key.
      </p>

      {existing && (
        <div className="mt-6 rounded-md border border-neutral-200 p-4 text-sm dark:border-neutral-800">
          <p>
            Currently configured: <span className="font-medium">{existing.provider}</span> /{" "}
            {existing.model}
          </p>
          <form action={clearLlmSetting} className="mt-2">
            <button type="submit" className="text-xs text-red-700 hover:underline dark:text-red-300">
              Remove
            </button>
          </form>
        </div>
      )}

      <form action={saveLlmSetting} className="mt-6 flex flex-col gap-3">
        <h2 className="text-sm font-medium">
          {existing ? "Update provider" : "Add your LLM provider"}
        </h2>

        <label className="text-xs text-neutral-500">Provider</label>
        <select
          name="provider"
          required
          defaultValue={existing?.provider ?? "openrouter"}
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        >
          <option value="openrouter">{PROVIDER_LABELS.openrouter}</option>
          <option value="openai">{PROVIDER_LABELS.openai}</option>
          <option value="anthropic">{PROVIDER_LABELS.anthropic}</option>
        </select>

        <label className="text-xs text-neutral-500">Model</label>
        <input
          name="model"
          placeholder="e.g. openai/gpt-4.1-mini or anthropic/claude-sonnet-4.5 (OpenRouter), gpt-4.1-mini (OpenAI), claude-sonnet-5 (Anthropic)"
          required
          defaultValue={existing?.model ?? ""}
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />

        <label className="text-xs text-neutral-500">API key</label>
        <input
          name="api_key"
          type="password"
          placeholder="sk-..."
          required
          autoComplete="off"
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
        <p className="text-xs text-neutral-500">
          Encrypted before storage. Never displayed again after saving.
        </p>

        <button
          type="submit"
          className="mt-2 w-fit rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background hover:bg-[#383838] dark:hover:bg-[#ccc]"
        >
          Save
        </button>
      </form>
    </main>
  );
}
