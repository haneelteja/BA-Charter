"use client";

import { useState, useTransition } from "react";
import { runGuardrailCheck } from "./actions";
import type { GuardrailFinding, StoryPayload } from "@/lib/ai/guardrails";

const SEVERITY_STYLES: Record<string, string> = {
  Blocking: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  Warning: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  Info: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300",
};

export function StoryChecker({ projectId }: { projectId: string }) {
  const [isPending, startTransition] = useTransition();
  const [findings, setFindings] = useState<GuardrailFinding[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (formData: FormData) => {
    const payload: StoryPayload = {
      title: String(formData.get("title") ?? ""),
      actor: String(formData.get("actor") ?? "") || null,
      goal: String(formData.get("goal") ?? "") || null,
      businessValue: String(formData.get("business_value") ?? "") || null,
      description: String(formData.get("description") ?? "") || null,
      acceptanceCriteria: String(formData.get("acceptance_criteria") ?? "") || null,
    };

    setError(null);
    startTransition(async () => {
      try {
        const result = await runGuardrailCheck(projectId, payload);
        setFindings(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      }
    });
  };

  return (
    <div>
      <form action={handleSubmit} className="flex flex-col gap-2">
        <input
          name="title"
          placeholder="Story title"
          required
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
        <input
          name="actor"
          placeholder="Actor"
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
        <input
          name="goal"
          placeholder="Goal"
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
        <input
          name="business_value"
          placeholder="Business value"
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
        <textarea
          name="description"
          placeholder="Description"
          rows={3}
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
        <textarea
          name="acceptance_criteria"
          placeholder="Acceptance criteria"
          rows={3}
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
        <button
          type="submit"
          disabled={isPending}
          className="w-fit rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
        >
          {isPending ? "Checking…" : "Run guardrail check"}
        </button>
      </form>

      {error && (
        <div
          role="alert"
          className="mt-4 rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
        >
          {error}
        </div>
      )}

      {findings && (
        <div className="mt-6" role="status" aria-live="polite">
          <h3 className="text-sm font-medium">
            {findings.length === 0 ? "No findings — clean." : `${findings.length} finding(s)`}
          </h3>
          <ul className="mt-2 flex flex-col gap-2">
            {findings.map((f, i) => (
              <li key={i} className="rounded-md border border-neutral-200 p-3 text-sm dark:border-neutral-800">
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${SEVERITY_STYLES[f.severity]}`}>
                    {f.severity}
                  </span>
                  <span className="text-xs text-neutral-500">
                    {f.ruleType} · {f.ruleName}
                    {f.fieldName ? ` · ${f.fieldName}` : ""}
                  </span>
                </div>
                <p className="mt-1">{f.message}</p>
                {f.suggestedCorrection && (
                  <p className="mt-1 text-xs text-neutral-500">Suggestion: {f.suggestedCorrection}</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
