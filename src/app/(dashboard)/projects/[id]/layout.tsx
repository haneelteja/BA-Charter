import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui";
import { ProjectSidebarNav, type ProjectNavItem } from "./ProjectSidebarNav";

const STATUS_TONE: Record<string, "green" | "indigo" | "amber" | "neutral"> = {
  Active: "green",
  Setup: "indigo",
  OnHold: "amber",
  Closed: "neutral",
};

const NAV_ITEMS: ProjectNavItem[] = [
  { href: "", label: "Chat", hint: "Ask about this project" },
  { href: "charter", label: "Charter", hint: "Knowledge model" },
  { href: "interactions", label: "Interactions", hint: "Capture & extraction" },
  { href: "action-items", label: "Action items", hint: "Follow-ups" },
  { href: "clarifications", label: "Clarifications", hint: "Open questions" },
  { href: "epics", label: "Epics", hint: "Delivery scope" },
  { href: "stories", label: "Stories", hint: "User stories" },
  { href: "changes", label: "Change requests", hint: "Impact analysis" },
  { href: "guardrails", label: "Guardrails", hint: "Quality rules" },
  { href: "search", label: "Search", hint: "Semantic retrieval" },
  { href: "delivery", label: "Delivery partners", hint: "Vendors & analytics" },
  { href: "members", label: "Members", hint: "Project team" },
  { href: "settings", label: "Settings", hint: "Embedding model" },
];

export default async function ProjectLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = await params;
  const supabase = await getSupabaseServerClient();

  const { data: project, error } = await supabase
    .from("project")
    .select("project_name, client_name, status")
    .eq("project_id", projectId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load project: ${error.message}`);
  }
  if (!project) {
    notFound();
  }

  return (
    <div className="mx-auto flex h-full max-w-7xl overflow-hidden">
      <aside className="scrollbar-thin h-full w-64 shrink-0 overflow-y-auto border-r border-surface-border px-4 py-6">
        <div className="px-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h1 className="truncate text-sm font-semibold tracking-tight">{project.project_name}</h1>
            <Badge tone={STATUS_TONE[project.status] ?? "neutral"}>{project.status}</Badge>
          </div>
          <p className="mt-0.5 truncate text-xs text-muted">{project.client_name ?? "No client set"}</p>
        </div>
        <div className="mt-5">
          <ProjectSidebarNav projectId={projectId} items={NAV_ITEMS} />
        </div>
      </aside>
      <main className="scrollbar-thin h-full min-w-0 flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
