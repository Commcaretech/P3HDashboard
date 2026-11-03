import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  productionSender,
  digestMessage,
  emailConfigured,
} from "../src/lib/email";
const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_FROM;
  delete process.env.EMAIL_ENABLED;
});
function setup() {
  process.env.EMAIL_ENABLED = "true";
  process.env.RESEND_API_KEY = "fictional-not-a-real-api-key";
  process.env.EMAIL_FROM = "fictional@example.test";
  process.env.APP_ORIGIN = "https://p3h.example.test";
  return productionSender()!;
}
test("HTTPS adapter sends plain text and HTML with provider idempotency and confirms acceptance", async () => {
  const sender = setup();
  let captured: RequestInit | undefined;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "https://api.resend.com/emails");
    captured = options;
    return Response.json({ id: "fictional-provider-id" });
  };
  const message = digestMessage(
    "staff@example.test",
    { "Overdue follow-ups": 2 },
    process.env.APP_ORIGIN!,
  );
  const result = await sender.send(message, "digest:fictional:2026-11-05");
  assert.equal(result.id, "fictional-provider-id");
  assert.equal(
    new Headers(captured?.headers).get("Idempotency-Key"),
    "digest:fictional:2026-11-05",
  );
  const body = JSON.parse(String(captured?.body));
  assert.equal(body.text, message.text);
  assert.equal(body.html, message.html);
  assert.equal(body.to, "staff@example.test");
  assert.ok(body.html.includes("Open My Tasks"));
});
test("HTTPS adapter rejects provider failure, malformed acceptance and invalid recipient", async () => {
  const sender = setup(),
    message = digestMessage(
      "staff@example.test",
      {},
      process.env.APP_ORIGIN!,
      true,
    );
  globalThis.fetch = async () =>
    new Response("private provider error", { status: 503 });
  await assert.rejects(sender.send(message, "fictional-key"), /HTTP 503/);
  globalThis.fetch = async () => Response.json({});
  await assert.rejects(
    sender.send(message, "fictional-key"),
    /did not confirm/,
  );
  await assert.rejects(
    sender.send({ ...message, to: "invalid" }, "fictional-key"),
  );
});
test("absent credentials and non-HTTPS deployment leave production email disabled", () => {
  setup();
  delete process.env.RESEND_API_KEY;
  assert.equal(productionSender(), null);
  setup();
  process.env.APP_ORIGIN = "http://localhost:3000";
  assert.equal(emailConfigured(), false);
});
