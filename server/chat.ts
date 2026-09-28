import {
  buildMessages,
  inspectReply,
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
    models: ["nvidia/nemotron-3-super-120b-a12b:free", "qwen/qwen3.8-27b:free"],
    messages: buildMessages(input.messages, input.guidance),
    provider: { max_price: { prompt: 0, completion: 0 } },
    temperature: 0.35,
    max_tokens: 650,
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
  const payload = providerBody(input);
  // a single deadline covers both attempts and stays within the hosted request budget.
  const signal = AbortSignal.timeout(45000);
  for (let attempt = 0; attempt < 2; attempt++) {
    let response: Response;
    try {
      response = await fetcher(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "X-OpenRouter-Title": "Loop CS Tutor",
          },
          body: JSON.stringify(payload),
          signal,
        },
      );
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
    const result = (await response.json().catch(() => ({}))) as {
      error?: { code?: number };
      choices?: { message?: { content?: string }; finish_reason?: string }[];
    };
    const raw = result.choices?.[0]?.message?.content;
    // some providers return an error or empty completion inside an http 200 response.
    if (result.error?.code === 429)
      throw new ChatError(
        429,
        "The shared free AI quota is busy or used up. Please try again later; guided exercises still work.",
      );
    if (typeof raw !== "string" || !raw.trim() || result.error) {
      if (attempt === 0) {
        payload.models.reverse();
        continue;
      }
      throw new ChatError(
        503,
        "The AI service returned no response. Please try again.",
      );
    }
    if (result.choices?.[0]?.finish_reason === "length") {
      payload.messages[0].content +=
        "\nYour response was cut off. Keep the next reply under 120 words with a complete explanation.";
      continue;
    }
    const checked = inspectReply(raw, input.messages);
    if (checked.allowed) return { text: checked.text, fallback: false };
    // retry against the real conversation rather than substituting a canned question.
    payload.messages[0].content += `\nRevise your next reply: ${checked.reason}`;
  }
  throw new ChatError(
    502,
    "The tutor could not produce a useful response. Please retry; your question has been kept.",
  );
}
