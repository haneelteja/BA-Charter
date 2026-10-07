"use client";

import { useTransition } from "react";
import { mapSpeaker } from "../actions";

interface Option {
  id: string;
  label: string;
  kind: "user" | "stakeholder";
}

export function SpeakerMapSelect({
  projectId,
  interactionId,
  utteranceId,
  options,
}: {
  projectId: string;
  interactionId: string;
  utteranceId: string;
  options: Option[];
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <select
      disabled={isPending}
      defaultValue=""
      onChange={(e) => {
        const selected = options.find((o) => o.id === e.target.value);
        if (!selected) return;
        const formData = new FormData();
        formData.set("utterance_id", utteranceId);
        formData.set("kind", selected.kind);
        formData.set("target_id", selected.id);
        startTransition(() => {
          mapSpeaker(projectId, interactionId, formData);
        });
      }}
      className="rounded-lg border border-surface-border bg-surface px-2 py-1 text-xs focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
    >
      <option value="" disabled>
        Map to…
      </option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
