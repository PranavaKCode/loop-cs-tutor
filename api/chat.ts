import type { IncomingMessage, ServerResponse } from "node:http";
import { answer, validateInput, ChatError } from "../server/chat.ts";

const ALLOWED_ORIGINS = new Set([
  "https://loop-cs-tutor.vercel.app",
  "https://pranavakcode.github.io",
]);

// github pages can use this endpoint too, but arbitrary browser origins cannot.
export default async function handler(
  request: IncomingMessage & { body?: unknown },
  response: ServerResponse,
) {
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  const origin = request.headers.origin;
  const ownOrigin = `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL ?? "loop-cs-tutor.vercel.app"}`;
  const localOrigin =
    process.env.NODE_ENV !== "production" && origin === "http://127.0.0.1:4320";
  if (
    origin &&
    !ALLOWED_ORIGINS.has(origin) &&
    origin !== ownOrigin &&
    !localOrigin
  ) {
    response.statusCode = 403;
    response.end(JSON.stringify({ error: "This origin is not allowed." }));
    return;
  }
  if (origin) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
  }
  if (request.method === "OPTIONS") {
    response.setHeader("Access-Control-Allow-Methods", "POST");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    response.statusCode = 204;
    response.end();
    return;
  }
  if (request.method !== "POST") {
    response.statusCode = 405;
    response.setHeader("Allow", "POST, OPTIONS");
    response.end(JSON.stringify({ error: "Use POST to ask a question." }));
    return;
  }
  // provider quotas remain authoritative; shared networks must not share an extra chat cap.
  try {
    if (
      !request.headers["content-type"]
        ?.toLowerCase()
        .startsWith("application/json")
    )
      throw new ChatError(415, "Send the question as JSON.");
    // reject oversized requests before parsing on both local and hosted runtimes.
    if (Number(request.headers["content-length"] ?? 0) > 32000)
      throw new ChatError(413, "This question is too long.");
    let body = request.body;
    if (body === undefined) {
      let text = "";
      for await (const chunk of request) {
        text += chunk.toString();
        if (text.length > 32000)
          throw new ChatError(413, "This question is too long.");
      }
      try {
        body = JSON.parse(text);
      } catch {
        throw new ChatError(400, "Invalid JSON request.");
      }
    }
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        throw new ChatError(400, "Invalid JSON request.");
      }
    }
    const result = await answer(
      validateInput(body),
      process.env.OPENROUTER_API_KEY,
    );
    response.statusCode = 200;
    response.end(JSON.stringify(result));
  } catch (error) {
    response.statusCode = error instanceof ChatError ? error.status : 500;
    response.end(
      JSON.stringify({
        error:
          error instanceof ChatError
            ? error.message
            : "The tutor could not finish. Please try again.",
      }),
    );
  }
}
