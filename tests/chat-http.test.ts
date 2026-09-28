import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import handler from "../api/chat.ts";

// rapid follow-ups on a shared connection must not exhaust a separate app quota.
test("twelve sequential questions from one network reach the provider", async (context) => {
  const originalKey = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = "test-only-key";
  let providerCalls = 0;
  const originalFetch = fetch;
  context.mock.method(globalThis, "fetch", async () => {
    providerCalls++;
    return Response.json({
      choices: [
        { message: { content: "What happens on the next iteration?" } },
      ],
    });
  });
  const server = createServer((request, response) => {
    void handler(request, response);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const url = `http://127.0.0.1:${address.port}/api/chat`;
    for (let turn = 1; turn <= 12; turn++) {
      const response = await originalFetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Forwarded-For": "192.0.2.1",
          Origin: "https://loop-cs-tutor.vercel.app",
        },
        body: JSON.stringify({
          messages: [
            { role: "user", content: `Help me with loop step ${turn}.` },
          ],
        }),
      });
      assert.equal(response.status, 200, `question ${turn} should be accepted`);
      assert.equal(
        (await response.json()).text,
        "What happens on the next iteration?",
      );
    }
    assert.equal(providerCalls, 12);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = originalKey;
  }
});
