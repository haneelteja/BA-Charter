"use client";

import { useState, useTransition } from "react";
import { generateQuestions, type BrainstormQuestion } from "../actions";
import { Badge, Button, Card } from "@/components/ui";

const PRIORITY_TONE: Record<string, "red" | "amber" | "neutral"> = {
  High: "red",
  Medium: "amber",
  Low: "neutral",
};

export function BrainstormPanel({
  projectId,
  changeRequestId,
  raiseAction,
}: {
  projectId: string;
  changeRequestId: string;
  raiseAction: (formData: FormData) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [questions, setQuestions] = useState<BrainstormQuestion[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = () => {
    setError(null);
    startTransition(async () => {
      try {
        const result = await generateQuestions(projectId, changeRequestId);
        setQuestions(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      }
    });
  };

  return (
    <div>
      <Button onClick={handleGenerate} disabled={isPending} size="sm">
        {isPending ? "Generating…" : "Generate question list"}
      </Button>

      {error && (
        <div
          role="alert"
          className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
        >
          {error}
        </div>
      )}

      {questions && questions.length === 0 && (
        <p className="mt-3 text-xs text-muted" role="status" aria-live="polite">
          No questions suggested.
        </p>
      )}

      {questions && questions.length > 0 && (
        <ul className="mt-4 flex flex-col gap-3" role="status" aria-live="polite">
          {questions.map((q, i) => (
            <li key={i}>
              <Card className="text-xs">
                <Badge tone={PRIORITY_TONE[q.priority]}>{q.priority}</Badge>
                <span className="ml-2 text-muted">{q.audience}</span>
                <p className="mt-2 text-sm font-medium">{q.question}</p>
                <p className="mt-1 text-muted">{q.rationale}</p>
                <form action={raiseAction} className="mt-2 flex items-center gap-2">
                  <input type="hidden" name="question" value={q.question} />
                  <input type="hidden" name="audience_type" value={q.audience} />
                  <label className="flex items-center gap-1 text-muted">
                    <input type="checkbox" name="is_blocking" defaultChecked={q.priority === "High"} /> Blocking
                  </label>
                  <Button type="submit" size="sm">
                    Raise as clarification
                  </Button>
                </form>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
