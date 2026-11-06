import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  createDelivery,
  createDeliveryPartner,
  declineCurrentPartner,
  deleteDeliveryPartner,
  markDeliveryDelivered,
  markDeliveryInTransit,
  reorderDeliveryPartner,
  toggleDeliveryPartnerActive,
  updateDeliveryPartnerSla,
} from "./actions";
import { Badge, BackLink, Button, Card, Field, Input, PageHeader, Textarea } from "@/components/ui";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "indigo" | "amber" | "green" | "red" | "neutral"> = {
  Pending: "neutral",
  Assigned: "indigo",
  InTransit: "amber",
  Delivered: "green",
  Failed: "red",
};

function formatCurrency(value: number | null): string {
  if (value == null) return "—";
  return `$${value.toFixed(2)}`;
}

function formatDuration(ms: number): string {
  const hours = ms / (1000 * 60 * 60);
  if (hours < 1) return `${Math.round(ms / (1000 * 60))}m`;
  if (hours < 48) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

export default async function DeliveryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const supabase = await getSupabaseServerClient();

  const { data: partners, error: partnersError } = await supabase
    .from("delivery_partner")
    .select("*")
    .eq("project_id", projectId)
    .order("priority_order", { ascending: true });

  const { data: deliveries, error: deliveriesError } = await supabase
    .from("delivery")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  const partnerIds = (partners ?? []).map((p) => p.delivery_partner_id);
  const { data: attempts } = partnerIds.length
    ? await supabase
        .from("delivery_attempt")
        .select("delivery_partner_id, status, assigned_at, resolved_at")
        .in("delivery_partner_id", partnerIds)
    : { data: [] };

  const deliveredCostByPartner = new Map<string, number>();
  for (const d of deliveries ?? []) {
    if (d.status === "Delivered" && d.current_partner_id && d.cost != null) {
      deliveredCostByPartner.set(
        d.current_partner_id,
        (deliveredCostByPartner.get(d.current_partner_id) ?? 0) + Number(d.cost)
      );
    }
  }

  const analyticsByPartner = (partners ?? []).map((p) => {
    const partnerAttempts = (attempts ?? []).filter((a) => a.delivery_partner_id === p.delivery_partner_id);
    const delivered = partnerAttempts.filter((a) => a.status === "Delivered");
    const declined = partnerAttempts.filter((a) => a.status === "Declined");
    const resolvedDurationsMs = delivered
      .filter((a) => a.resolved_at)
      .map((a) => new Date(a.resolved_at!).getTime() - new Date(a.assigned_at).getTime());
    const avgDurationMs = resolvedDurationsMs.length
      ? resolvedDurationsMs.reduce((sum, v) => sum + v, 0) / resolvedDurationsMs.length
      : null;
    const resolvedCount = delivered.length + declined.length;

    return {
      partner: p,
      volume: partnerAttempts.length,
      delivered: delivered.length,
      declined: declined.length,
      successRate: resolvedCount ? delivered.length / resolvedCount : null,
      avgTurnaroundMs: avgDurationMs,
      cost: deliveredCostByPartner.get(p.delivery_partner_id) ?? 0,
    };
  });

  const createPartnerForProject = createDeliveryPartner.bind(null, projectId);
  const toggleActiveForProject = toggleDeliveryPartnerActive.bind(null, projectId);
  const reorderForProject = reorderDeliveryPartner.bind(null, projectId);
  const deleteForProject = deleteDeliveryPartner.bind(null, projectId);
  const updateSlaForProject = updateDeliveryPartnerSla.bind(null, projectId);
  const createDeliveryForProject = createDelivery.bind(null, projectId);
  const markInTransitForProject = markDeliveryInTransit.bind(null, projectId);
  const markDeliveredForProject = markDeliveryDelivered.bind(null, projectId);
  const declineForProject = declineCurrentPartner.bind(null, projectId);

  const partnerName = (id: string | null) =>
    (partners ?? []).find((p) => p.delivery_partner_id === id)?.name ?? "—";

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <BackLink href={`/projects/${projectId}`}>Back to project</BackLink>
      <PageHeader
        title="Delivery partners"
        subtitle="Configure delivery vendors in priority order, track deliveries, and see per-partner performance."
      />

      {(partnersError || deliveriesError) && (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {partnersError?.message ?? deliveriesError?.message}
        </div>
      )}

      <section className="mt-8">
        <h2 className="text-sm font-semibold">Partners (priority order)</h2>
        <p className="mt-1 text-xs text-muted">
          A new delivery is assigned to partner #1. If a partner declines or fails it, the delivery falls back to the
          next active partner in this order. Set an SLA on a partner to fall back automatically if they haven&apos;t
          resolved it in time — leave it blank for manual-only fallback.
        </p>
        <ul className="mt-3 flex flex-col gap-2">
          {(partners ?? []).map((p, index) => (
            <li key={p.delivery_partner_id}>
              <Card className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700 dark:bg-indigo-900 dark:text-indigo-200">
                    {index + 1}
                  </span>
                  <div>
                    <p className="font-medium">
                      {p.name} {!p.is_active && <span className="text-xs text-muted">(inactive)</span>}
                    </p>
                    <p className="text-xs text-muted">
                      {[p.contact_name, p.contact_email, p.contact_phone].filter(Boolean).join(" · ") || "No contact info"}
                    </p>
                    <form action={updateSlaForProject} className="mt-1.5 flex items-center gap-1.5">
                      <input type="hidden" name="delivery_partner_id" value={p.delivery_partner_id} />
                      <label htmlFor={`sla-${p.delivery_partner_id}`} className="text-xs text-muted">
                        SLA (hours before auto fallback):
                      </label>
                      <Input
                        id={`sla-${p.delivery_partner_id}`}
                        name="sla_hours"
                        type="number"
                        step="0.5"
                        min="0"
                        defaultValue={p.sla_hours ?? ""}
                        placeholder="Off"
                        className="h-7 w-20 py-1 text-xs"
                      />
                      <button type="submit" className="text-xs text-indigo-600 hover:underline dark:text-indigo-400">
                        Save
                      </button>
                    </form>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <form action={reorderForProject}>
                    <input type="hidden" name="delivery_partner_id" value={p.delivery_partner_id} />
                    <input type="hidden" name="direction" value="up" />
                    <button
                      type="submit"
                      disabled={index === 0}
                      className="text-xs text-muted hover:text-indigo-600 disabled:opacity-30 dark:hover:text-indigo-400"
                    >
                      ↑
                    </button>
                  </form>
                  <form action={reorderForProject}>
                    <input type="hidden" name="delivery_partner_id" value={p.delivery_partner_id} />
                    <input type="hidden" name="direction" value="down" />
                    <button
                      type="submit"
                      disabled={index === (partners ?? []).length - 1}
                      className="text-xs text-muted hover:text-indigo-600 disabled:opacity-30 dark:hover:text-indigo-400"
                    >
                      ↓
                    </button>
                  </form>
                  <form action={toggleActiveForProject}>
                    <input type="hidden" name="delivery_partner_id" value={p.delivery_partner_id} />
                    <input type="hidden" name="is_active" value={String(p.is_active)} />
                    <button type="submit" className="text-xs text-indigo-600 hover:underline dark:text-indigo-400">
                      {p.is_active ? "Deactivate" : "Activate"}
                    </button>
                  </form>
                  <form action={deleteForProject}>
                    <input type="hidden" name="delivery_partner_id" value={p.delivery_partner_id} />
                    <button type="submit" className="text-xs text-red-600 hover:underline dark:text-red-400">
                      Delete
                    </button>
                  </form>
                </div>
              </Card>
            </li>
          ))}
        </ul>

        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-muted transition-colors hover:text-indigo-600 dark:hover:text-indigo-400">
            + Add delivery partner
          </summary>
          <Card className="mt-3">
            <form action={createPartnerForProject} className="flex flex-col gap-2">
              <Field label="Name" htmlFor="name">
                <Input id="name" name="name" placeholder="Partner name" required />
              </Field>
              <Field label="Contact name" htmlFor="contact_name">
                <Input id="contact_name" name="contact_name" placeholder="Contact name" />
              </Field>
              <Field label="Contact email" htmlFor="contact_email">
                <Input id="contact_email" name="contact_email" type="email" placeholder="Contact email" />
              </Field>
              <Field label="Contact phone" htmlFor="contact_phone">
                <Input id="contact_phone" name="contact_phone" placeholder="Contact phone" />
              </Field>
              <Field label="SLA hours (optional)" htmlFor="sla_hours">
                <Input
                  id="sla_hours"
                  name="sla_hours"
                  type="number"
                  step="0.5"
                  min="0"
                  placeholder="Leave blank for no automatic fallback"
                />
              </Field>
              <Button type="submit" size="sm" className="w-fit">
                Add partner
              </Button>
            </form>
          </Card>
        </details>
      </section>

      <section className="mt-10 border-t border-surface-border pt-8">
        <h2 className="text-sm font-semibold">Partner analytics</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {analyticsByPartner.map((a) => (
            <Card key={a.partner.delivery_partner_id}>
              <p className="font-medium">{a.partner.name}</p>
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                <dt className="text-muted">Volume handled</dt>
                <dd>{a.volume}</dd>
                <dt className="text-muted">Success rate</dt>
                <dd>{a.successRate == null ? "—" : `${Math.round(a.successRate * 100)}%`}</dd>
                <dt className="text-muted">Avg. turnaround</dt>
                <dd>{a.avgTurnaroundMs == null ? "—" : formatDuration(a.avgTurnaroundMs)}</dd>
                <dt className="text-muted">Delivered spend</dt>
                <dd>{formatCurrency(a.cost)}</dd>
              </dl>
            </Card>
          ))}
          {analyticsByPartner.length === 0 && <p className="text-sm text-muted">No partners configured yet.</p>}
        </div>
      </section>

      <section className="mt-10 border-t border-surface-border pt-8">
        <h2 className="text-sm font-semibold">Deliveries</h2>

        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-muted transition-colors hover:text-indigo-600 dark:hover:text-indigo-400">
            + New delivery
          </summary>
          <Card className="mt-3">
            <form action={createDeliveryForProject} className="flex flex-col gap-2">
              <Field label="Recipient name" htmlFor="recipient_name">
                <Input id="recipient_name" name="recipient_name" placeholder="Recipient name" required />
              </Field>
              <Field label="Delivery address" htmlFor="delivery_address">
                <Input id="delivery_address" name="delivery_address" placeholder="Delivery address" />
              </Field>
              <Field label="Cost" htmlFor="cost">
                <Input id="cost" name="cost" type="number" step="0.01" placeholder="0.00" />
              </Field>
              <Field label="Notes" htmlFor="notes">
                <Textarea id="notes" name="notes" placeholder="Notes" rows={2} />
              </Field>
              <Button type="submit" size="sm" className="w-fit">
                Create delivery
              </Button>
            </form>
          </Card>
        </details>

        <ul className="mt-4 flex flex-col gap-3">
          {(deliveries ?? []).map((d) => (
            <li key={d.delivery_id}>
              <Card>
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium">{d.recipient_name}</p>
                  <Badge tone={STATUS_TONE[d.status] ?? "neutral"}>{d.status}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted">
                  {d.delivery_address && `${d.delivery_address} · `}
                  Partner: {partnerName(d.current_partner_id)}
                  {d.cost != null && ` · ${formatCurrency(Number(d.cost))}`}
                </p>
                {d.notes && <p className="mt-1 text-xs text-muted">{d.notes}</p>}

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {d.status === "Assigned" && (
                    <form action={markInTransitForProject}>
                      <input type="hidden" name="delivery_id" value={d.delivery_id} />
                      <Button type="submit" size="sm">
                        Mark in transit
                      </Button>
                    </form>
                  )}
                  {(d.status === "Assigned" || d.status === "InTransit") && (
                    <form action={markDeliveredForProject}>
                      <input type="hidden" name="delivery_id" value={d.delivery_id} />
                      <Button type="submit" variant="primary" size="sm">
                        Mark delivered
                      </Button>
                    </form>
                  )}
                  {(d.status === "Assigned" || d.status === "InTransit") && (
                    <form action={declineForProject}>
                      <input type="hidden" name="delivery_id" value={d.delivery_id} />
                      <button type="submit" className="text-xs text-red-600 hover:underline dark:text-red-400">
                        Partner declined / failed — try next partner
                      </button>
                    </form>
                  )}
                </div>
              </Card>
            </li>
          ))}
          {(deliveries ?? []).length === 0 && (
            <li>
              <Card className="text-sm text-muted">No deliveries yet.</Card>
            </li>
          )}
        </ul>
      </section>
    </main>
  );
}
