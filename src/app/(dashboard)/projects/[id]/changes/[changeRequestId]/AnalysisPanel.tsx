"use client";

import { useState, useTransition } from "react";
import { runChangeImpactAnalysis } from "../actions";
import { Button } from "@/components/ui";

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
      <Button onClick={handleRun} disabled={isPending} size="sm">
        {isPending ? "Analysing…" : "Run impact analysis"}
      </Button>

      {error && (
        <div
          role="alert"
          className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
        >
          {error}
        </div>
      )}

      {summary && (
        <p className="mt-3 text-xs text-muted" role="status" aria-live="polite">
          {summary}
        </p>
      )}
    </div>
  );
}
