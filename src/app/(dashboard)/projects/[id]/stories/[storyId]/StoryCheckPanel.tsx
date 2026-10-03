"use client";

import { useState, useTransition } from "react";
import { runStoryCheck, type StoryCheckResult } from "../actions";

const SEVERITY_STYLES: Record<string, string> = {
  Blocking: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  Warning: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  Info: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300",
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
      <button
        onClick={handleCheck}
        disabled={isPending}
        className="rounded-full border border-neutral-300 px-4 py-2 text-xs hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
      >
        {isPending ? "Checking…" : "Run guardrail + duplicate check"}
      </button>

      {error && (
        <div className="mt-3 rounded-md border border-red-300 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-4">
          <p className="text-xs font-medium">
            {result.passed ? "No blocking findings." : "Blocking findings must be resolved before review."}
          </p>

          {result.findings.length > 0 && (
            <ul className="mt-2 flex flex-col gap-2">
              {result.findings.map((f, i) => (
                <li key={i} className="rounded-md border border-neutral-200 p-2 text-xs dark:border-neutral-800">
                  <span className={`rounded-full px-2 py-0.5 ${SEVERITY_STYLES[f.severity]}`}>{f.severity}</span>
                  <span className="ml-2 text-neutral-500">
                    {f.ruleType} · {f.ruleName}
                    {f.fieldName ? ` · ${f.fieldName}` : ""}
                  </span>
                  <p className="mt-1">{f.message}</p>
                  {f.suggestedCorrection && (
                    <p className="mt-1 text-neutral-500">Suggestion: {f.suggestedCorrection}</p>
                  )}
                </li>
              ))}
            </ul>
          )}

          {result.duplicates.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-medium">Possible duplicates</p>
              <ul className="mt-1 flex flex-col gap-1 text-xs text-neutral-500">
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
