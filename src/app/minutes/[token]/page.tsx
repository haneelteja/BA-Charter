import type { ReactNode } from "react";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { getMinutesAckRecord } from "@/lib/minutes/ackToken";
import { acknowledgeMinutes, disputeMinutesPublic } from "./actions";
import { Badge, Card, Field, SubmitButton, Textarea } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function MinutesAckPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = getSupabaseServiceRoleClient();
  const record = await getMinutesAckRecord(supabase, token);

  const shell = (children: ReactNode) => (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-50 via-background to-background p-6 dark:from-indigo-950/30">
      <div className="w-full max-w-xl">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-600 text-lg font-bold text-white shadow-sm">
            BA
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">BA Charter</h1>
        </div>
        {children}
      </div>
    </main>
  );

  if (!record) {
    return shell(
      <Card className="p-6 text-center text-sm text-muted">This link is invalid or has expired.</Card>
    );
  }

  const acknowledgeForToken = acknowledgeMinutes.bind(null, token);
  const disputeForToken = disputeMinutesPublic.bind(null, token);

  return shell(
    <>
      <Card className="p-6">
        <p className="text-xs text-muted">{record.projectName}</p>
        <h2 className="mt-1 text-lg font-semibold">{record.subject ?? "Minutes of meeting"}</h2>
        <p className="mt-1 text-xs text-muted">Sent to {record.email}</p>

        <div
          className="prose prose-sm mt-4 max-w-none dark:prose-invert"
          dangerouslySetInnerHTML={{ __html: record.bodyHtml ?? "" }}
        />
      </Card>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Card>
          <p className="text-sm font-medium">Acknowledge</p>
          {record.acknowledgedAt ? (
            <p className="mt-2 text-xs text-muted">
              Acknowledged on {new Date(record.acknowledgedAt).toLocaleString()}.
            </p>
          ) : (
            <>
              <p className="mt-1 text-xs text-muted">Confirm you&apos;ve reviewed these minutes.</p>
              <form action={acknowledgeForToken} className="mt-3">
                <SubmitButton variant="primary" size="sm" pendingLabel="Acknowledging…">
                  Acknowledge
                </SubmitButton>
              </form>
            </>
          )}
        </Card>

        <Card>
          <p className="text-sm font-medium">Flag an issue</p>
          {record.status === "Disputed" ? (
            <div className="mt-2 flex items-center gap-2">
              <Badge tone="red">Disputed</Badge>
              <p className="text-xs text-muted">{record.disputeNote}</p>
            </div>
          ) : (
            <>
              <p className="mt-1 text-xs text-muted">
                If something here is wrong, describe it — this reopens the meeting for review.
              </p>
              <form action={disputeForToken} className="mt-3 flex flex-col gap-2">
                <Field label="What's wrong?" htmlFor="dispute_note">
                  <Textarea id="dispute_note" name="dispute_note" rows={3} required />
                </Field>
                <SubmitButton size="sm" className="w-fit" pendingLabel="Submitting…">
                  Submit
                </SubmitButton>
              </form>
            </>
          )}
        </Card>
      </div>
    </>
  );
}
