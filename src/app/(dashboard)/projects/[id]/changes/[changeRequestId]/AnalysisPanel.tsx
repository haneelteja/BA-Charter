"use client";

import { useState, useTransition } from "react";
import { runChangeImpactAnalysis } from "../actions";

export function AnalysisPanel({ projectId, changeRequestId }: { projectId: string; changeRequestId: string }) {
  const [isPending, startTransition] = useTransition();
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRun = () => {
    setError(null);
    startTransition(async () => {
      try {
        const result = await runChangeImpactAnalysis(projectId, changeRequestId);
        setSummary(`Found ${result.affected.length} affected item(s) and ${result.gaps.length} gap/contradiction finding(s).`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      }
    });
  };

  return (
    <div>
      <button
        onClick={handleRun}
        disabled={isPending}
        className="rounded-full border border-neutral-300 px-4 py-2 text-xs hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
      >
        {isPending ? "Analysing…" : "Run impact analysis"}
      </button>

      {error && (
        <div className="mt-3 rounded-md border border-red-300 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {error}
        </div>
      )}

      {summary && <p className="mt-3 text-xs text-neutral-500">{summary}</p>}
    </div>
  );
}
