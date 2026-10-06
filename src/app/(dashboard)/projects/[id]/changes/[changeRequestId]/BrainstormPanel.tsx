"use client";

import { useState, useTransition } from "react";
import { generateQuestions, type BrainstormQuestion } from "../actions";

const PRIORITY_STYLES: Record<string, string> = {
  High: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  Medium: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  Low: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300",
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
      <button
        onClick={handleGenerate}
        disabled={isPending}
        className="rounded-full border border-neutral-300 px-4 py-2 text-xs hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
      >
        {isPending ? "Generating…" : "Generate question list"}
      </button>

      {error && (
        <div
          role="alert"
          className="mt-3 rounded-md border border-red-300 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
        >
          {error}
        </div>
      )}

      {questions && questions.length === 0 && (
        <p className="mt-3 text-xs text-neutral-500" role="status" aria-live="polite">
          No questions suggested.
        </p>
      )}

      {questions && questions.length > 0 && (
        <ul className="mt-4 flex flex-col gap-3" role="status" aria-live="polite">
          {questions.map((q, i) => (
            <li key={i} className="rounded-md border border-neutral-200 p-3 text-xs dark:border-neutral-800">
              <span className={`rounded-full px-2 py-0.5 ${PRIORITY_STYLES[q.priority]}`}>{q.priority}</span>
              <span className="ml-2 text-neutral-500">{q.audience}</span>
              <p className="mt-2 font-medium">{q.question}</p>
              <p className="mt-1 text-neutral-500">{q.rationale}</p>
              <form action={raiseAction} className="mt-2 flex items-center gap-2">
                <input type="hidden" name="question" value={q.question} />
                <input type="hidden" name="audience_type" value={q.audience} />
                <label className="flex items-center gap-1">
                  <input type="checkbox" name="is_blocking" defaultChecked={q.priority === "High"} /> Blocking
                </label>
                <button
                  type="submit"
                  className="rounded-full border border-neutral-300 px-3 py-1 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
                >
                  Raise as clarification
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
