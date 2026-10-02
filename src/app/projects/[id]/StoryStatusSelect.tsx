"use client";

import { useTransition } from "react";
import type { UserStoryStatus } from "@/lib/types";
import { updateUserStoryStatus } from "../../actions";

const STATUSES: UserStoryStatus[] = ["draft", "ready", "in_progress", "done"];

export function StoryStatusSelect({
  projectId,
  storyId,
  status,
}: {
  projectId: string;
  storyId: string;
  status: UserStoryStatus;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <select
      defaultValue={status}
      disabled={isPending}
      onChange={(e) => {
        const next = e.target.value as UserStoryStatus;
        startTransition(() => {
          updateUserStoryStatus(projectId, storyId, next);
        });
      }}
      className="rounded-md border border-neutral-300 px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-900"
    >
      {STATUSES.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  );
}
