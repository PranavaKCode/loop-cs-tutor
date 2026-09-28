import { compactHistory, type Message, type Guidance } from "./tutor";

export class HostedTutor {
  private controller?: AbortController;

  // students call our server; the provider key never enters a browser bundle.
  async reply(
    messages: Message[],
    guidance: Guidance,
  ): Promise<{ text: string; fallback: boolean }> {
    const controller = new AbortController();
    this.controller = controller;
    const timer = window.setTimeout(() => controller.abort(), 55000);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_BASE ?? ""}/api/chat`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: compactHistory(messages),
            guidance,
          }),
          signal: controller.signal,
        },
      );
      const result = (await response.json().catch(() => ({}))) as {
        text?: string;
        fallback?: boolean;
        error?: string;
      };
      if (!response.ok)
        throw new Error(
          result.error ??
            "The tutor is temporarily unavailable. Please try again.",
        );
      if (!result.text)
        throw new Error(
          "The tutor returned an empty response. Please try again.",
        );
      return { text: result.text, fallback: Boolean(result.fallback) };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError")
        throw new Error(
          "The response was stopped or timed out. Your question is ready to retry.",
        );
      if (error instanceof TypeError)
        throw new Error(
          "Could not reach the tutor. Check your connection and try again.",
        );
      throw error;
    } finally {
      window.clearTimeout(timer);
    }
  }

  // cancel a pending browser request when the learner changes or stops a conversation.
  stop() {
    this.controller?.abort();
  }
}
