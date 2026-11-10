"use client";

import { type ReactNode, useState } from "react";
import { Card, SubmitButton, Textarea } from "@/components/ui";

export interface CandidateForMerge {
  candidateId: string;
  /** Server-rendered badge/confidence line for this candidate. */
  header: ReactNode;
  /** Server-rendered accept/reject/split forms for this candidate. */
  body: ReactNode;
}

interface MergeCandidatesPanelProps {
  candidates: CandidateForMerge[];
  mergeAction: (formData: FormData) => Promise<void>;
}

/**
 * Wraps the whole Pending-candidate list so merge-selection state (which
 * checkboxes are checked) can be shared across sibling rows — each
 * candidate's own accept/reject/split markup stays server-rendered and is
 * passed straight through as `header`/`body`.
 *
 * The merge control is a genuine <form action={mergeAction}> — its hidden
 * candidate_ids inputs are rendered from this component's own `selected`
 * state, since the checkboxes that drive that state live on sibling rows
 * rather than inside the form itself.
 */
export function MergeCandidatesPanel({ candidates, mergeAction }: MergeCandidatesPanelProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <>
      {candidates.length >= 2 && (
        <form action={mergeAction} className="mt-3">
          {Array.from(selected).map((id) => (
            <input key={id} type="hidden" name="candidate_ids" value={id} />
          ))}
          <Card className="border-indigo-200 bg-indigo-50 dark:border-indigo-900 dark:bg-indigo-950">
            <p className="text-xs font-medium text-indigo-900 dark:text-indigo-200">
              Check two or more candidates of the same type below, write the combined statement, then merge.
            </p>
            <Textarea
              name="merged_statement"
              placeholder="Combined statement"
              rows={2}
              className="mt-2 border-indigo-300 bg-white text-xs dark:border-indigo-800 dark:bg-neutral-900"
            />
            <SubmitButton size="sm" className="mt-2 w-fit" disabled={selected.size < 2} pendingLabel="Merging…">
              Merge checked candidates
            </SubmitButton>
          </Card>
        </form>
      )}

      <ul className="mt-3 flex flex-col gap-3">
        {candidates.map((c) => (
          <li key={c.candidateId}>
            <Card>
              <div className="flex items-center justify-between gap-2">
                {c.header}
                {candidates.length >= 2 && (
                  <label className="flex items-center gap-1 text-xs text-muted">
                    <input
                      type="checkbox"
                      checked={selected.has(c.candidateId)}
                      onChange={() => toggle(c.candidateId)}
                    />
                    Merge
                  </label>
                )}
              </div>
              {c.body}
            </Card>
          </li>
        ))}
      </ul>
    </>
  );
}
