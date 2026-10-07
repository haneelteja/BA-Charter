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
import { BackLink, Badge, Button, Card, Input, PageHeader, Select, Textarea } from "@/components/ui";

export const dynamic = "force-dynamic";

const EDITABLE_STATUSES = ["Draft", "GuardrailCheck", "ReturnedForRework"];
const STATUS_TONE: Record<string, "indigo" | "amber" | "green" | "neutral" | "red"> = {
  Draft: "neutral",
  GuardrailCheck: "amber",
  InReview: "amber",
  ReturnedForRework: "red",
  Approved: "indigo",
  Published: "green",
  Deferred: "neutral",
};

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
    <main className="mx-auto max-w-3xl px-6 py-10">
      <BackLink href={`/projects/${projectId}/stories`}>All stories</BackLink>
      <PageHeader
        title={story.title}
        badge={<Badge tone={STATUS_TONE[story.status] ?? "neutral"}>{story.status}</Badge>}
        subtitle={
          <>
            {story.actor && `As ${story.actor}, `}
            {story.goal}
            {story.agile_studio_ref && (
              <span className="mt-1 block text-xs">Agile Studio ref: {story.agile_studio_ref}</span>
            )}
          </>
        }
      />

      {isEditable && (
        <Card className="mt-6">
          <form action={updateForStory} className="flex flex-col gap-2">
            <input type="hidden" name="expected_version_no" value={story.version_no} />
            <h2 className="text-sm font-semibold">Detail</h2>
            <Textarea name="description" defaultValue={story.description ?? ""} placeholder="Description" rows={3} />
            <Input name="prerequisites" defaultValue={story.prerequisites ?? ""} placeholder="Prerequisites" />
            <Input name="assumptions" defaultValue={story.assumptions ?? ""} placeholder="Assumptions" />
            <Input name="exclusions" defaultValue={story.exclusions ?? ""} placeholder="Exclusions" />
            <Input name="nfr_performance" defaultValue={story.nfr_performance ?? ""} placeholder="NFR: performance" />
            <Input name="nfr_security" defaultValue={story.nfr_security ?? ""} placeholder="NFR: security" />
            <Input name="nfr_accessibility" defaultValue={story.nfr_accessibility ?? ""} placeholder="NFR: accessibility" />
            <Input name="nfr_audit" defaultValue={story.nfr_audit ?? ""} placeholder="NFR: audit" />
            <Button type="submit" size="sm" className="w-fit">
              Save
            </Button>
          </form>
        </Card>
      )}
      {!isEditable && story.description && <p className="mt-6 text-sm">{story.description}</p>}

      <h2 className="mt-8 text-sm font-semibold">Acceptance criteria</h2>
      <ul className="mt-3 flex flex-col gap-2">
        {criteria?.map((c) => (
          <li key={c.criterion_id}>
            <Card className="flex items-start justify-between gap-2 py-2.5 text-sm">
              <span>
                Given {c.given_clause}, When {c.when_clause}, Then {c.then_clause}
                {c.is_negative_path && " (negative path)"}
              </span>
              {isEditable && (
                <form action={deleteCriterionForStory}>
                  <input type="hidden" name="criterion_id" value={c.criterion_id} />
                  <button type="submit" className="shrink-0 text-xs text-red-600 hover:underline dark:text-red-400">
                    Delete
                  </button>
                </form>
              )}
            </Card>
          </li>
        ))}
      </ul>
      {isEditable && (
        <form action={addCriterionForStory} className="mt-3 flex flex-col gap-2">
          <Input name="given_clause" placeholder="Given" className="text-xs" />
          <Input name="when_clause" placeholder="When" className="text-xs" />
          <Input name="then_clause" placeholder="Then" className="text-xs" />
          <label className="flex items-center gap-1.5 text-xs text-muted">
            <input type="checkbox" name="is_negative_path" /> Negative path
          </label>
          <Button type="submit" size="sm" className="w-fit">
            Add criterion
          </Button>
        </form>
      )}

      <h2 className="mt-8 text-sm font-semibold">Dependencies</h2>
      <ul className="mt-3 flex flex-col gap-2 text-sm">
        {dependencies?.map((d) => (
          <li key={d.dependency_id}>
            <Card className="flex items-center justify-between py-2.5">
              <span>
                {d.dependency_type}: {d.depends_on?.title}
              </span>
              {isEditable && (
                <form action={removeDependencyForStory}>
                  <input type="hidden" name="dependency_id" value={d.dependency_id} />
                  <button type="submit" className="text-xs text-red-600 hover:underline dark:text-red-400">
                    Remove
                  </button>
                </form>
              )}
            </Card>
          </li>
        ))}
      </ul>
      {isEditable && (otherStories?.length ?? 0) > 0 && (
        <form action={addDependencyForStory} className="mt-3 flex items-center gap-2">
          <Select name="depends_on_story_id" className="flex-1">
            {otherStories?.map((s) => (
              <option key={s.user_story_id} value={s.user_story_id}>
                {s.title}
              </option>
            ))}
          </Select>
          <Select name="dependency_type" className="w-40">
            <option value="BlockedBy">Blocked by</option>
            <option value="RelatesTo">Relates to</option>
            <option value="Duplicates">Duplicates</option>
          </Select>
          <Button type="submit" size="sm">
            Add
          </Button>
        </form>
      )}

      {isEditable && (
        <section className="mt-8 border-t border-surface-border pt-6">
          <h2 className="text-sm font-semibold">Check</h2>
          <div className="mt-3">
            <StoryCheckPanel projectId={projectId} storyId={storyId} />
          </div>
          {story.guardrail_pass && (
            <form action={submitForStory} className="mt-4">
              <Button type="submit" variant="primary">
                Submit for review
              </Button>
            </form>
          )}
        </section>
      )}

      {story.status === "InReview" && (
        <section className="mt-8 border-t border-surface-border pt-6">
          <h2 className="text-sm font-semibold">Review</h2>
          <form action={reviewForStory} className="mt-3 flex flex-col gap-2">
            <Textarea name="comments" placeholder="Review comments" rows={2} />
            <div className="flex gap-2">
              <Button type="submit" name="outcome" value="Approved" variant="primary" size="sm">
                Approve
              </Button>
              <Button type="submit" name="outcome" value="ReturnedForRework" variant="danger" size="sm">
                Return for rework
              </Button>
            </div>
          </form>
        </section>
      )}

      {(story.status === "Approved" || story.status === "Published") && (
        <section className="mt-8 border-t border-surface-border pt-6">
          <h2 className="text-sm font-semibold">Trace links to confirmed decisions</h2>
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {linkedDecisions?.map((d) => (
              <li key={d.decision_id}>{d.statement}</li>
            ))}
          </ul>
          {linkedDecisions?.length === 0 && (
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
              No trace link yet — required before publishing (§8 rule 5).
            </p>
          )}
          {story.status === "Approved" && (
            <form action={linkDecisionForStory} className="mt-3 flex items-center gap-2">
              <Select name="decision_id" className="flex-1">
                {candidateDecisions?.map((d) => (
                  <option key={d.decision_id} value={d.decision_id}>
                    {d.statement.slice(0, 60)}
                  </option>
                ))}
              </Select>
              <Button type="submit" size="sm">
                Link
              </Button>
            </form>
          )}

          {story.status === "Approved" && (
            <form action={publishForStory} className="mt-4">
              <Button type="submit" variant="primary">
                Publish to Agile Studio
              </Button>
            </form>
          )}
        </section>
      )}

      {reviews && reviews.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-semibold">Review history</h2>
          <ul className="mt-2 flex flex-col gap-1 text-xs text-muted">
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
