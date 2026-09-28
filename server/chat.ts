import {
  buildMessages,
  inspectReply,
  fallbackQuestion,
  type Guidance,
  type Message,
} from "../src/tutor.ts";

export type ChatInput = { messages: Message[]; guidance: Guidance };
export class ChatError extends Error {
  status: number;
  // attach a safe status code to errors that may be shown to the student.
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// client-supplied roles, model names, and prompts cannot replace the server's teaching policy.
export function validateInput(body: unknown): ChatInput {
  if (!body || typeof body !== "object")
    throw new ChatError(400, "Send a question to begin.");
  const value = body as Record<string, unknown>;
  if (
    !Array.isArray(value.messages) ||
    value.messages.length < 1 ||
    value.messages.length > 30
  )
    throw new ChatError(400, "Please start a new conversation and try again.");
  const messages: Message[] = [];
  let size = 0;
  for (const item of value.messages) {
    if (
      !item ||
      typeof item !== "object" ||
      !["user", "assistant"].includes(item.role) ||
      typeof item.content !== "string" ||
      !item.content.trim() ||
      item.content.length > 2400
    )
      throw new ChatError(400, "Each message must contain 1–2,400 characters.");
    size += item.content.length;
    messages.push({ role: item.role, content: item.content });
  }
  if (size > 24000)
    throw new ChatError(
      400,
      "This conversation is too long. Save it and start a new one.",
    );
  if (messages.at(-1)?.role !== "user")
    throw new ChatError(400, "A student question is required.");
  const guidance = value.guidance ?? "balanced";
  if (!["balanced", "support", "challenge"].includes(guidance as string))
    throw new ChatError(400, "Choose a valid guidance level.");
  return { messages, guidance: guidance as Guidance };
}

// every route is explicitly free, with a zero-price ceiling and no paid tools or plugins.
export function providerBody(input: ChatInput) {
  return {
    model: "qwen/qwen3.8-27b:free",
    models: [
      "qwen/qwen3.8-27b:free",
      "google/gemma-4-31b-it:free",
      "openrouter/free",
    ],
    messages: buildMessages(input.messages, input.guidance),
    provider: { max_price: { prompt: 0, completion: 0 } },
    temperature: 0.45,
    max_tokens: 400,
    reasoning: { enabled: false },
  };
}

// return actionable errors without leaking upstream payloads or credentials.
export async function answer(
  input: ChatInput,
  apiKey: string | undefined,
  fetcher: typeof fetch = fetch,
) {
  if (!apiKey)
    throw new ChatError(
      503,
      "The tutor is not configured yet. Guided practice is available in the meantime.",
    );
  let response: Response;
  try {
    response = await fetcher("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-OpenRouter-Title": "Loop CS Tutor",
      },
      body: JSON.stringify(providerBody(input)),
      signal: AbortSignal.timeout(45000),
    });
  } catch {
    throw new ChatError(
      504,
      "The free AI service took too long to respond. Please retry, or use a guided exercise.",
    );
  }
  if (!response.ok) {
    if (response.status === 429)
      throw new ChatError(
        429,
        "The shared free AI quota is busy or used up. Please try again later; guided exercises still work.",
      );
    throw new ChatError(
      503,
      "The free AI service is temporarily unavailable. Try again later or choose a guided exercise.",
    );
  }
  const result = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const raw = result.choices?.[0]?.message?.content;
  if (typeof raw !== "string" || !raw.trim())
    throw new ChatError(
      503,
      "The AI service returned no response. Please try again.",
    );
  const checked = inspectReply(raw);
  // rejected responses become labeled authored prompts, never hidden answer dumps.
  return checked.allowed
    ? { text: checked.text, fallback: false }
    : { text: fallbackQuestion(input.messages), fallback: true };
}
