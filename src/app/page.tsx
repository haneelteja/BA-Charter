import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Project } from "@/lib/types";
import { createProject } from "./actions";

export const dynamic = "force-dynamic";

export default async function Home() {
  let projects: Project[] = [];
  let error: string | null = null;

  try {
    const supabase = getSupabaseServerClient();
    const { data, error: queryError } = await supabase
      .from("projects")
      .select("*")
      .order("created_at", { ascending: false });

    if (queryError) throw new Error(queryError.message);
    projects = data ?? [];
  } catch (err) {
    error = err instanceof Error ? err.message : "Unknown error";
  }

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-3xl font-semibold">BA Application</h1>
      <p className="mt-1 text-neutral-500">
        Draft and organize projects and user stories.
      </p>

      {error && (
        <div className="mt-6 rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          <p className="font-medium">Couldn&apos;t reach Supabase</p>
          <p className="mt-1">{error}</p>
        </div>
      )}

      <form action={createProject} className="mt-8 flex flex-col gap-3">
        <h2 className="text-sm font-medium">New project</h2>
        <input
          name="name"
          placeholder="Project name"
          required
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
        <textarea
          name="description"
          placeholder="Description (optional)"
          rows={2}
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
        <button
          type="submit"
          className="w-fit rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
        >
          Create project
        </button>
      </form>

      <h2 className="mt-10 text-sm font-medium">Projects</h2>
      {!error && projects.length === 0 && (
        <p className="mt-3 text-sm text-neutral-500">No projects yet.</p>
      )}
      <ul className="mt-3 divide-y divide-neutral-200 dark:divide-neutral-800">
        {projects.map((project) => (
          <li key={project.id} className="py-3">
            <Link
              href={`/projects/${project.id}`}
              className="font-medium hover:underline"
            >
              {project.name}
            </Link>
            {project.description && (
              <p className="text-sm text-neutral-500">{project.description}</p>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
