import { Resend } from "resend";
import { requireEnv } from "@/lib/env";

export interface SendEmailInput {
  to: string[];
  subject: string;
  html: string;
}

/**
 * Generic send used by every outbound email in the platform (EXECUTION_PLAN.md
 * §3.F). Specific templates — minutes of meeting, clarification requests,
 * change notifications — land with their owning case type (EPIC 5/7/12);
 * this is just the transport.
 */
export async function sendEmail(input: SendEmailInput): Promise<void> {
  const resend = new Resend(requireEnv("RESEND_API_KEY"));
  const from = process.env.RESEND_FROM_EMAIL ?? "BA Charter <notifications@resend.dev>";

  const { error } = await resend.emails.send({
    from,
    to: input.to,
    subject: input.subject,
    html: input.html,
  });

  if (error) {
    throw new Error(`Failed to send email: ${error.message}`);
  }
}
