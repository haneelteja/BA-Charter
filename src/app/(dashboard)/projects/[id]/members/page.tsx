import { getSupabaseServerClient } from "@/lib/supabase/server";
import { Card, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function MembersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const supabase = await getSupabaseServerClient();

  const { data: memberRows } = await supabase
    .from("project_member")
    .select("role_name, user_id")
    .eq("project_id", projectId);

  const userIds = (memberRows ?? []).map((m) => m.user_id);
  const { data: users } = userIds.length
    ? await supabase.from("app_user").select("user_id, full_name, email").in("user_id", userIds)
    : { data: [] };

  const members = (memberRows ?? []).map((m) => ({
    role_name: m.role_name,
    user: (users ?? []).find((u) => u.user_id === m.user_id) ?? null,
  }));

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <PageHeader title="Members" subtitle="Everyone with access to this project." />

      <Card className="mt-6 divide-y divide-surface-border p-0">
        {members.map((m, i) => (
          <div key={i} className="flex items-center justify-between px-4 py-2.5 text-sm">
            <span>{m.user?.full_name ?? m.user?.email ?? "Unknown user"}</span>
            <span className="text-xs text-muted">{m.role_name}</span>
          </div>
        ))}
      </Card>
    </main>
  );
}
