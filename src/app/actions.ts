"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { UserStoryStatus } from "@/lib/types";

export async function createProject(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();

  if (!name) {
    throw new Error("Project name is required.");
  }

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("projects")
    .insert({ name, description: description || null })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Failed to create project: ${error.message}`);
  }

  revalidatePath("/");
  redirect(`/projects/${data.id}`);
}

export async function deleteProject(projectId: string) {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from("projects").delete().eq("id", projectId);

  if (error) {
    throw new Error(`Failed to delete project: ${error.message}`);
  }

  revalidatePath("/");
  redirect("/");
}

export async function createUserStory(projectId: string, formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const acceptanceCriteria = String(formData.get("acceptance_criteria") ?? "").trim();

  if (!title) {
    throw new Error("User story title is required.");
  }

  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from("user_stories").insert({
    project_id: projectId,
    title,
    description: description || null,
    acceptance_criteria: acceptanceCriteria || null,
  });

  if (error) {
    throw new Error(`Failed to create user story: ${error.message}`);
  }

  revalidatePath(`/projects/${projectId}`);
}

export async function updateUserStoryStatus(
  projectId: string,
  storyId: string,
  status: UserStoryStatus
) {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase
    .from("user_stories")
    .update({ status })
    .eq("id", storyId);

  if (error) {
    throw new Error(`Failed to update user story: ${error.message}`);
  }

  revalidatePath(`/projects/${projectId}`);
}

export async function deleteUserStory(projectId: string, storyId: string) {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from("user_stories").delete().eq("id", storyId);

  if (error) {
    throw new Error(`Failed to delete user story: ${error.message}`);
  }

  revalidatePath(`/projects/${projectId}`);
}
