import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  addAcceptanceCriterion,
  addDependency,
  deleteAcceptanceCriterion,
  linkStoryToDecision,
  publishStory,
  removeDependency,
  reviewStory,
  submitStoryForReview,
  updateStoryDetail,
} from "../actions";
import { StoryCheckPanel } from "./StoryCheckPanel";

export const dynamic = "force-dynamic";

const EDITABLE_STATUSES = ["Draft", "GuardrailCheck", "ReturnedForRework"];

export default async function StoryDetailPage({
  params,
}: {
  params: Promise<{ id: string; storyId: string }>;
}) {
  const { id: projectId, storyId } = await params;
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    throw new Error("Not signed in.");
  }

  const { data: story, error } = await supabase
    .from("user_story")
    .select("*")
    .eq("user_story_id", storyId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load story: ${error.message}`);
  if (!story) notFound();

  const isEditable = EDITABLE_STATUSES.includes(story.status);

  const { data: criteria } = await supabase
    .from("acceptance_criterion")
    .select("*")
    .eq("user_story_id", storyId)
    .order("sequence_no");

  const { data: dependencies } = await supabase
    .from("story_dependency")
    .select("*, depends_on:depends_on_story_id(title)")
    .eq("user_story_id", storyId);

  const { data: otherStories } = await supabase
    .from("user_story")
    .select("user_story_id, title")
    .eq("project_id", projectId)
    .neq("user_story_id", storyId);

  const { data: traceLinks } = await supabase
    .from("trace_link")
    .select("*")
    .eq("from_object_type", "UserStory")
    .eq("from_object_id", storyId)
    .eq("to_object_type", "Decision");

  const decisionIds = (traceLinks ?? []).map((l) => l.to_object_id);
  const { data: linkedDecisions } = decisionIds.length
    ? await supabase.from("decision").select("decision_id, statement").in("decision_id", decisionIds)
    : { data: [] };

  const { data: candidateDecisions } = await supabase
    .from("decision")
    .select("decision_id, statement")
    .eq("project_id", projectId)
    .eq("status", "Confirmed");

  const { data: reviews } = await supabase
    .from("review")
    .select("*")
    .eq("target_object_type", "UserStory")
    .eq("target_object_id", storyId)
    .order("reviewed_at", { ascending: false });

  const updateForStory = updateStoryDetail.bind(null, projectId, storyId);
  const addCriterionForStory = addAcceptanceCriterion.bind(null, projectId, storyId);
  const deleteCriterionForStory = deleteAcceptanceCriterion.bind(null, projectId, storyId);
  const addDependencyForStory = addDependency.bind(null, projectId, storyId);
  const removeDependencyForStory = removeDependency.bind(null, projectId, storyId);
  const submitForStory = submitStoryForReview.bind(null, projectId, storyId);
  const reviewForStory = reviewStory.bind(null, projectId, storyId);
  const linkDecisionForStory = linkStoryToDecision.bind(null, projectId, storyId);
  const publishForStory = publishStory.bind(null, projectId, storyId);

  return (
    <main className="mx-auto max-w-3xl p-8">
      <Link href={`/projects/${projectId}/stories`} className="text-sm text-neutral-500 hover:underline">
        ← All stories
      </Link>
      <div className="mt-4 flex items-center gap-2">
        <h1 className="text-2xl font-semibold">{story.title}</h1>
        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs dark:bg-neutral-800">
          {story.status}
        </span>
      </div>
      <p className="mt-1 text-sm text-neutral-500">
        {story.actor && `As ${story.actor}, `}
        {story.goal}
      </p>
      {story.agile_studio_ref && (
        <p className="mt-1 text-xs text-neutral-500">Agile Studio ref: {story.agile_studio_ref}</p>
      )}

      {isEditable && (
        <form action={updateForStory} className="mt-6 flex flex-col gap-2">
          <input type="hidden" name="expected_version_no" value={story.version_no} />
          <h2 className="text-sm font-medium">Detail</h2>
          <textarea
            name="description"
            defaultValue={story.description ?? ""}
            placeholder="Description"
            rows={3}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
          <input
            name="prerequisites"
            defaultValue={story.prerequisites ?? ""}
            placeholder="Prerequisites"
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
          <input
            name="assumptions"
            defaultValue={story.assumptions ?? ""}
            placeholder="Assumptions"
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
          <input
            name="exclusions"
            defaultValue={story.exclusions ?? ""}
            placeholder="Exclusions"
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
          <input
            name="nfr_performance"
            defaultValue={story.nfr_performance ?? ""}
            placeholder="NFR: performance"
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
          <input
            name="nfr_security"
            defaultValue={story.nfr_security ?? ""}
            placeholder="NFR: security"
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
          <input
            name="nfr_accessibility"
            defaultValue={story.nfr_accessibility ?? ""}
            placeholder="NFR: accessibility"
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
          <input
            name="nfr_audit"
            defaultValue={story.nfr_audit ?? ""}
            placeholder="NFR: audit"
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
          <button
            type="submit"
            className="w-fit rounded-full border border-neutral-300 px-4 py-2 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
          >
            Save
          </button>
        </form>
      )}
      {!isEditable && story.description && <p className="mt-6 text-sm">{story.description}</p>}

      <h2 className="mt-8 text-sm font-medium">Acceptance criteria</h2>
      <ul className="mt-2 flex flex-col gap-2">
        {criteria?.map((c) => (
          <li
            key={c.criterion_id}
            className="flex items-start justify-between gap-2 rounded-md border border-neutral-200 p-2 text-sm dark:border-neutral-800"
          >
            <span>
              Given {c.given_clause}, When {c.when_clause}, Then {c.then_clause}
              {c.is_negative_path && " (negative path)"}
            </span>
            {isEditable && (
              <form action={deleteCriterionForStory}>
                <input type="hidden" name="criterion_id" value={c.criterion_id} />
                <button type="submit" className="text-xs text-red-700 hover:underline dark:text-red-300">
                  Delete
                </button>
              </form>
            )}
          </li>
        ))}
      </ul>
      {isEditable && (
        <form action={addCriterionForStory} className="mt-2 flex flex-col gap-2">
          <input
            name="given_clause"
            placeholder="Given"
            className="rounded-md border border-neutral-300 px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-900"
          />
          <input
            name="when_clause"
            placeholder="When"
            className="rounded-md border border-neutral-300 px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-900"
          />
          <input
            name="then_clause"
            placeholder="Then"
            className="rounded-md border border-neutral-300 px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-900"
          />
          <label className="flex items-center gap-1 text-xs">
            <input type="checkbox" name="is_negative_path" /> Negative path
          </label>
          <button
            type="submit"
            className="w-fit rounded-full border border-neutral-300 px-3 py-1 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
          >
            Add criterion
          </button>
        </form>
      )}

      <h2 className="mt-8 text-sm font-medium">Dependencies</h2>
      <ul className="mt-2 flex flex-col gap-1 text-sm">
        {dependencies?.map((d) => (
          <li key={d.dependency_id} className="flex items-center justify-between">
            <span>
              {d.dependency_type}: {d.depends_on?.title}
            </span>
            {isEditable && (
              <form action={removeDependencyForStory}>
                <input type="hidden" name="dependency_id" value={d.dependency_id} />
                <button type="submit" className="text-xs text-red-700 hover:underline dark:text-red-300">
                  Remove
                </button>
              </form>
            )}
          </li>
        ))}
      </ul>
      {isEditable && (otherStories?.length ?? 0) > 0 && (
        <form action={addDependencyForStory} className="mt-2 flex items-center gap-2">
          <select
            name="depends_on_story_id"
            className="flex-1 rounded-md border border-neutral-300 px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-900"
          >
            {otherStories?.map((s) => (
              <option key={s.user_story_id} value={s.user_story_id}>
                {s.title}
              </option>
            ))}
          </select>
          <select
            name="dependency_type"
            className="rounded-md border border-neutral-300 px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-900"
          >
            <option value="BlockedBy">Blocked by</option>
            <option value="RelatesTo">Relates to</option>
            <option value="Duplicates">Duplicates</option>
          </select>
          <button
            type="submit"
            className="rounded-full border border-neutral-300 px-3 py-1 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
          >
            Add
          </button>
        </form>
      )}

      {isEditable && (
        <section className="mt-8 border-t border-neutral-200 pt-6 dark:border-neutral-800">
          <h2 className="text-sm font-medium">Check</h2>
          <div className="mt-2">
            <StoryCheckPanel projectId={projectId} storyId={storyId} />
          </div>
          {story.guardrail_pass && (
            <form action={submitForStory} className="mt-4">
              <button
                type="submit"
                className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background hover:bg-[#383838] dark:hover:bg-[#ccc]"
              >
                Submit for review
              </button>
            </form>
          )}
        </section>
      )}

      {story.status === "InReview" && (
        <section className="mt-8 border-t border-neutral-200 pt-6 dark:border-neutral-800">
          <h2 className="text-sm font-medium">Review</h2>
          <form action={reviewForStory} className="mt-2 flex flex-col gap-2">
            <textarea
              name="comments"
              placeholder="Review comments"
              rows={2}
              className="rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                name="outcome"
                value="Approved"
                className="rounded-full bg-foreground px-4 py-2 text-xs font-medium text-background hover:bg-[#383838] dark:hover:bg-[#ccc]"
              >
                Approve
              </button>
              <button
                type="submit"
                name="outcome"
                value="ReturnedForRework"
                className="rounded-full border border-red-300 px-4 py-2 text-xs text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
              >
                Return for rework
              </button>
            </div>
          </form>
        </section>
      )}

      {(story.status === "Approved" || story.status === "Published") && (
        <section className="mt-8 border-t border-neutral-200 pt-6 dark:border-neutral-800">
          <h2 className="text-sm font-medium">Trace links to confirmed decisions</h2>
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {linkedDecisions?.map((d) => (
              <li key={d.decision_id}>{d.statement}</li>
            ))}
          </ul>
          {linkedDecisions?.length === 0 && (
            <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
              No trace link yet — required before publishing (§8 rule 5).
            </p>
          )}
          {story.status === "Approved" && (
            <form action={linkDecisionForStory} className="mt-2 flex items-center gap-2">
              <select
                name="decision_id"
                className="flex-1 rounded-md border border-neutral-300 px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-900"
              >
                {candidateDecisions?.map((d) => (
                  <option key={d.decision_id} value={d.decision_id}>
                    {d.statement.slice(0, 60)}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="rounded-full border border-neutral-300 px-3 py-1 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
              >
                Link
              </button>
            </form>
          )}

          {story.status === "Approved" && (
            <form action={publishForStory} className="mt-4">
              <button
                type="submit"
                className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background hover:bg-[#383838] dark:hover:bg-[#ccc]"
              >
                Publish to Agile Studio
              </button>
            </form>
          )}
        </section>
      )}

      {reviews && reviews.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-medium">Review history</h2>
          <ul className="mt-2 flex flex-col gap-1 text-xs text-neutral-500">
            {reviews.map((r) => (
              <li key={r.review_id}>
                [{r.outcome}] {r.comments}
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}
