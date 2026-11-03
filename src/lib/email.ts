import { z } from "zod";
export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
};
export interface EmailSender {
  send(
    message: EmailMessage,
    key: string,
  ): Promise<{ id: string; mock?: boolean }>;
}
export function emailConfigured() {
  return (
    process.env.EMAIL_ENABLED === "true" &&
    Boolean(
      process.env.RESEND_API_KEY &&
      process.env.EMAIL_FROM &&
      process.env.APP_ORIGIN?.startsWith("https://"),
    )
  );
}
export function productionSender(): EmailSender | null {
  if (!emailConfigured()) return null;
  return {
    async send(message, key) {
      z.email().parse(message.to);
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
          "Idempotency-Key": key,
        },
        body: JSON.stringify({ from: process.env.EMAIL_FROM, ...message }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok)
        throw new Error(
          `Email provider rejected request (HTTP ${response.status}).`,
        );
      const body = await response.json();
      if (typeof body.id !== "string")
        throw new Error("Email provider did not confirm acceptance.");
      return { id: body.id };
    },
  };
}
export function mockSender(messages: EmailMessage[]): EmailSender {
  return {
    async send(message) {
      messages.push(message);
      return { id: `mock-${messages.length}`, mock: true };
    },
  };
}
export function digestMessage(
  to: string,
  counts: Record<string, number>,
  origin: string,
  test = false,
): EmailMessage {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const subject = test
    ? "P3H test notification"
    : `P3H Daily Reminder: ${total} Tasks Need Attention`;
  const lines = Object.entries(counts).map(([k, v]) => `${k}: ${v}`);
  const link = new URL("/alerts?view=my", origin).href;
  const text = `Good morning,\n\n${test ? "This is an administrator test. No caregiver information is included." : lines.join("\n")}\n\nOpen My Tasks: ${link}\nSign in to review your assigned tasks. Please do not reply to this automated notification.`;
  const escape = (s: string) =>
    s.replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c]!,
    );
  return {
    to,
    subject,
    text,
    html: `<html><meta name="viewport" content="width=device-width"><body style="font:16px Arial;color:#173047;background:#f4f7f8;padding:24px"><main style="max-width:560px;margin:auto;background:white;padding:24px"><h1 style="font-size:24px">${subject}</h1><p>Good morning,</p>${test ? "<p>This is an administrator test. No caregiver information is included.</p>" : lines.map((s) => `<p>${escape(s)}</p>`).join("")}<p><a style="color:#006b72" href="${escape(link)}">Open My Tasks</a></p><p>Sign in to review your assigned tasks.</p><small>Please do not reply to this automated notification.</small></main></body></html>`,
  };
}
