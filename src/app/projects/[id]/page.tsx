import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Project, UserStory } from "@/lib/types";
import { createUserStory, deleteProject, deleteUserStory } from "../../actions";
import { StoryStatusSelect } from "./StoryStatusSelect";

export const dynamic = "force-dynamic";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = getSupabaseServerClient();

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .maybeSingle<Project>();

  if (projectError) {
    throw new Error(`Failed to load project: ${projectError.message}`);
  }
  if (!project) {
    notFound();
  }

  const { data: stories, error: storiesError } = await supabase
    .from("user_stories")
    .select("*")
    .eq("project_id", id)
    .order("created_at", { ascending: false });

  if (storiesError) {
    throw new Error(`Failed to load user stories: ${storiesError.message}`);
  }

  const createUserStoryForProject = createUserStory.bind(null, id);

  return (
    <main className="mx-auto max-w-2xl p-8">
      <Link href="/" className="text-sm text-neutral-500 hover:underline">
        ← All projects
      </Link>

      <div className="mt-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{project.name}</h1>
          {project.description && (
            <p className="mt-1 text-neutral-500">{project.description}</p>
          )}
        </div>
        <form action={deleteProject.bind(null, project.id)}>
          <button
            type="submit"
            className="shrink-0 rounded-full border border-red-300 px-4 py-2 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
          >
            Delete project
          </button>
        </form>
      </div>

      <form
        action={createUserStoryForProject}
        className="mt-8 flex flex-col gap-3"
      >
        <h2 className="text-sm font-medium">New user story</h2>
        <input
          name="title"
          placeholder="As a ... I want to ... so that ..."
          required
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
        <textarea
          name="description"
          placeholder="Description (optional)"
          rows={2}
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
        <textarea
          name="acceptance_criteria"
          placeholder="Acceptance criteria (optional)"
          rows={2}
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
        <button
          type="submit"
          className="w-fit rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
        >
          Add user story
        </button>
      </form>

      <h2 className="mt-10 text-sm font-medium">User stories</h2>
      {(!stories || stories.length === 0) && (
        <p className="mt-3 text-sm text-neutral-500">No user stories yet.</p>
      )}
      <ul className="mt-3 flex flex-col gap-4">
        {(stories as UserStory[] | null)?.map((story) => (
          <li
            key={story.id}
            className="rounded-md border border-neutral-200 p-4 dark:border-neutral-800"
          >
            <div className="flex items-start justify-between gap-4">
              <p className="font-medium">{story.title}</p>
              <form action={deleteUserStory.bind(null, project.id, story.id)}>
                <button
                  type="submit"
                  className="shrink-0 text-xs text-red-700 hover:underline dark:text-red-300"
                >
                  Delete
                </button>
              </form>
            </div>

            {story.description && (
              <p className="mt-1 text-sm text-neutral-500">
                {story.description}
              </p>
            )}
            {story.acceptance_criteria && (
              <p className="mt-2 text-xs text-neutral-500">
                <span className="font-medium">Acceptance criteria:</span>{" "}
                {story.acceptance_criteria}
              </p>
            )}

            <div className="mt-3">
              <StoryStatusSelect
                projectId={project.id}
                storyId={story.id}
                status={story.status}
              />
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
