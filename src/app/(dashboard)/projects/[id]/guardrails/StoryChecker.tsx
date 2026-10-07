"use client";

import { useState, useTransition } from "react";
import { runGuardrailCheck } from "./actions";
import type { GuardrailFinding, StoryPayload } from "@/lib/ai/guardrails";
import { Badge, Button, Card, Field, Input, Textarea } from "@/components/ui";

const SEVERITY_TONE: Record<string, "red" | "amber" | "neutral"> = {
  Blocking: "red",
  Warning: "amber",
  Info: "neutral",
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
      <form action={handleSubmit} className="flex flex-col gap-3">
        <Field label="Story title" htmlFor="story-title">
          <Input id="story-title" name="title" placeholder="Story title" required />
        </Field>
        <Field label="Actor" htmlFor="story-actor">
          <Input id="story-actor" name="actor" placeholder="Actor" />
        </Field>
        <Field label="Goal" htmlFor="story-goal">
          <Input id="story-goal" name="goal" placeholder="Goal" />
        </Field>
        <Field label="Business value" htmlFor="story-value">
          <Input id="story-value" name="business_value" placeholder="Business value" />
        </Field>
        <Field label="Description" htmlFor="story-description">
          <Textarea id="story-description" name="description" placeholder="Description" rows={3} />
        </Field>
        <Field label="Acceptance criteria" htmlFor="story-ac">
          <Textarea id="story-ac" name="acceptance_criteria" placeholder="Acceptance criteria" rows={3} />
        </Field>
        <Button type="submit" variant="primary" disabled={isPending} className="w-fit">
          {isPending ? "Checking…" : "Run guardrail check"}
        </Button>
      </form>

      {error && (
        <div
          role="alert"
          className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
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
              <li key={i}>
                <Card className="text-sm">
                  <div className="flex items-center gap-2">
                    <Badge tone={SEVERITY_TONE[f.severity]}>{f.severity}</Badge>
                    <span className="text-xs text-muted">
                      {f.ruleType} · {f.ruleName}
                      {f.fieldName ? ` · ${f.fieldName}` : ""}
                    </span>
                  </div>
                  <p className="mt-1">{f.message}</p>
                  {f.suggestedCorrection && <p className="mt-1 text-xs text-muted">Suggestion: {f.suggestedCorrection}</p>}
                </Card>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
