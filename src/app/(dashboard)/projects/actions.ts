"use server";

import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { logAuditEvent } from "@/lib/audit/log";

/**
 * Project Setup — Initiate stage (Requirements §3.1 stage 1), with Activate
 * folded in immediately rather than as a separate confirmation screen for
 * now. Seed (document/backlog/glossary import) and the member-management
 * part of Configure are deferred until EPIC 3/9/14 exist to seed from —
 * tracked in docs/BACKLOG.md EPIC 1, not silently dropped.
 *
 * Project + first-member creation goes through the create_project RPC
 * (migration 0007) rather than two separate inserts: a project with no
 * member can never be read again under RLS, so the two writes must be
 * atomic, and a direct `.insert().select()` from the client fails outright
 * because PostgREST re-selects the row under RLS before membership exists.
 */
export async function createProject(formData: FormData) {
  const projectName = String(formData.get("project_name") ?? "").trim();
  const clientName = String(formData.get("client_name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const startDate = String(formData.get("start_date") ?? "").trim();

  if (!projectName) {
    throw new Error("Project name is required.");
  }

  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    throw new Error("Not signed in.");
  }

  const { data: project, error: projectError } = await supabase
    .rpc("create_project", {
      p_project_name: projectName,
      p_client_name: clientName || null,
      p_description: description || null,
      p_start_date: startDate || null,
    })
    .single<{ project_id: string }>();

  if (projectError) {
    throw new Error(`Failed to create project: ${projectError.message}`);
  }

  await logAuditEvent(supabase, {
    projectId: project.project_id,
    actorUserId: auth.user.id,
    eventType: "Created",
    targetObjectType: "Project",
    targetObjectId: project.project_id,
    newValue: { project_name: projectName, status: "Active" },
  });

  redirect(`/projects/${project.project_id}`);
}
