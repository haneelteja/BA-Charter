"use client";

import { useState, useTransition } from "react";
import { runStoryCheck, type StoryCheckResult } from "../actions";
import { Badge, Button, Card } from "@/components/ui";

const SEVERITY_TONE: Record<string, "red" | "amber" | "neutral"> = {
  Blocking: "red",
  Warning: "amber",
  Info: "neutral",
};

export function StoryCheckPanel({ projectId, storyId }: { projectId: string; storyId: string }) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<StoryCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCheck = () => {
    setError(null);
    startTransition(async () => {
      try {
        const r = await runStoryCheck(projectId, storyId);
        setResult(r);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      }
    });
  };

  return (
    <div>
      <Button onClick={handleCheck} disabled={isPending} size="sm">
        {isPending ? "Checking…" : "Run guardrail + duplicate check"}
      </Button>

      {error && (
        <div
          role="alert"
          className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
        >
          {error}
        </div>
      )}

      {result && (
        <div className="mt-4" role="status" aria-live="polite">
          <p className="text-xs font-medium">
            {result.passed ? "No blocking findings." : "Blocking findings must be resolved before review."}
          </p>

          {result.findings.length > 0 && (
            <ul className="mt-2 flex flex-col gap-2">
              {result.findings.map((f, i) => (
                <li key={i}>
                  <Card className="py-2.5 text-xs">
                    <Badge tone={SEVERITY_TONE[f.severity]}>{f.severity}</Badge>
                    <span className="ml-2 text-muted">
                      {f.ruleType} · {f.ruleName}
                      {f.fieldName ? ` · ${f.fieldName}` : ""}
                    </span>
                    <p className="mt-1">{f.message}</p>
                    {f.suggestedCorrection && <p className="mt-1 text-muted">Suggestion: {f.suggestedCorrection}</p>}
                  </Card>
                </li>
              ))}
            </ul>
          )}

          {result.duplicates.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-medium">Possible duplicates</p>
              <ul className="mt-1 flex flex-col gap-1 text-xs text-muted">
                {result.duplicates.map((d) => (
                  <li key={d.userStoryId}>
                    {d.title} ({Math.round(d.similarityScore * 100)}% similar)
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
