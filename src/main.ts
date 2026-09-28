import "@fontsource-variable/dm-sans";
import "./style.css";
import { HostedTutor } from "./ai";
import { exercises, practiceReply, type PracticeState } from "./practice";
import type { Guidance, Message } from "./tutor";

// only trusted interface copy uses this template; all chat content becomes text nodes.
document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <header class="app-header">
    <a class="brand" href="./" aria-label="Loop home"><img src="./favicon.svg" width="30" height="30" alt="" />Loop</a>
    <span class="app-description">CS teaching assistant</span>
    <button id="about-button" class="text-button">How it works</button>
  </header>
  <div class="workspace">
    <aside class="sidebar" aria-label="Study tools">
      <button id="new-chat" class="new-chat"><span aria-hidden="true">＋</span> New conversation</button>
      <button id="toggle-exercises" aria-expanded="false" aria-controls="practice-panel">Exercises</button>
      <section class="practice-section" id="practice-panel"><h2>Guided practice</h2><p class="section-note">Start with a small problem.</p>
        <nav aria-label="Practice exercises">${exercises.map((exercise, i) => `<button class="exercise-button" data-exercise="${exercise.id}"><span class="exercise-number">0${i + 1}</span><span>${exercise.name}<span class="exercise-topic">${exercise.topic}</span></span></button>`).join("")}</nav>
      </section>
      <div class="sidebar-bottom"><a href="https://github.com/PranavaKCode/loop-cs-tutor" target="_blank" rel="noopener noreferrer">View source <span aria-hidden="true">↗</span></a><span>Free. No account needed.</span></div>
    </aside>
    <main class="study">
      <div class="conversation-header"><div><h1 id="conversation-title">Your conversation</h1><p id="mode-label">Socratic AI tutor</p></div><label class="guidance-label" for="guidance">Guidance<select id="guidance"><option value="balanced">Balanced</option><option value="support">More support</option><option value="challenge">Push me</option></select></label></div>
      <div class="conversation-scroll" id="conversation-scroll"><div class="conversation-inner">
        <div id="messages" role="log" aria-label="Conversation" aria-live="polite" aria-relevant="additions"></div>
        <div id="starters" class="starters"><p>Or start with a question</p><button data-starter="Why is binary search faster than checking every element?">Why is binary search faster?</button><button data-starter="I do not understand how recursive functions return their values. Can you help me reason through a small example?">Help me understand recursion</button><button data-starter="My nested loops both run n times. I think the total runtime is O(n). How can I check my reasoning?">Check my Big O reasoning</button></div>
        <div id="thinking" class="thinking" role="status" hidden>Thinking about your next step…</div>
        <p id="chat-error" class="error" role="alert" hidden></p>
      </div></div>
      <div class="composer-area">
        <div class="quick-actions" aria-label="Ask for help"><button data-action="hint" disabled>Small hint</button><button data-action="simpler" disabled>Simpler example</button><button data-action="check" disabled>Check my reasoning</button><button id="discuss" hidden>Discuss with AI</button></div>
        <form id="chat-form"><label for="question" id="question-label">Your question or next step</label><div class="composer"><textarea id="question" rows="3" maxlength="2400" placeholder="Paste your code or describe where you’re stuck…" aria-describedby="composer-note"></textarea><div class="composer-bottom"><span id="character-count">0 / 2,400</span><button type="button" id="stop-response" hidden>Stop</button><button id="send" type="submit" class="primary">Send <span aria-hidden="true">↑</span></button></div></div></form>
        <div class="composer-foot"><p id="composer-note">AI can make mistakes. Check your reasoning with examples.</p><button id="export-chat" class="text-button" disabled>Save conversation</button></div>
      </div>
    </main>
  </div>
  <dialog id="about" aria-labelledby="about-title"><div class="dialog-top"><h2 id="about-title">How Loop teaches</h2><button id="close-about" aria-label="Close explanation" class="text-button">Close</button></div><p>Bring a problem and whatever you’ve tried. Loop asks one focused question, gives a small hint when you’re stuck, and asks you to justify your reasoning.</p><dl><dt>Choose your level of support</dt><dd>Use Balanced for a mix of questions and hints, More support for smaller steps, or Push me for counterexamples and deeper justification. Loop is instructed to avoid finished solutions. Its teaching prompt and answer-dump filter reduce answer-giving, but cannot guarantee it.</dd><dt>Guided practice</dt><dd>Four authored exercises check short answers and offer specific hints. They do not use AI or grade free-form explanations. Choose “Discuss with AI” to take your reasoning into a conversation.</dd><dt>What happens to your messages</dt><dd>AI conversations are sent through our server to OpenRouter and a free model provider. Do not submit passwords, private data, or code you cannot share. Chats stay in this tab until you reload; Loop has no chat database or analytics. Provider and hosting service data policies still apply.</dd><dt>Free, with shared limits</dt><dd>No sign-up, API key, or download is needed. Only zero-cost model routes are enabled, with no paid fallback. If the shared daily quota or hosting limit is reached, the tutor may be temporarily unavailable. Guided exercises still work.</dd></dl><p class="dialog-links"><a href="https://openrouter.ai/privacy" target="_blank" rel="noopener noreferrer">Provider privacy</a><a href="https://github.com/PranavaKCode/loop-cs-tutor" target="_blank" rel="noopener noreferrer">Source code</a></p></dialog>
`;

// catch missing required controls during development instead of failing silently.
function element<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing interface element: ${id}`);
  return node as T;
}

const question = element<HTMLTextAreaElement>("question");
const send = element<HTMLButtonElement>("send");
const chatError = element("chat-error");
const stopButton = element<HTMLButtonElement>("stop-response");
const guidance = element<HTMLSelectElement>("guidance");
const messagesNode = element("messages");
const scroll = element("conversation-scroll");
const tutor = new HostedTutor();
let messages: Message[] = [];
let practice: PracticeState | undefined;
let busy = false;
let generation = 0;

// render a small, safe subset of markdown; html and links are never interpreted.
function renderText(container: HTMLElement, text: string) {
  text.split(/```(?:[\w+-]*)\n?([\s\S]*?)```/g).forEach((block, index) => {
    if (index % 2) {
      const pre = document.createElement("pre");
      const code = document.createElement("code");
      code.textContent = block.trimEnd();
      pre.append(code);
      container.append(pre);
    } else {
      for (const paragraph of block.split(/\n\s*\n/).filter(Boolean)) {
        const p = document.createElement("p");
        paragraph.split(/`([^`\n]+)`/g).forEach((part, i) => {
          if (i % 2) {
            const code = document.createElement("code");
            code.textContent = part;
            p.append(code);
          } else p.append(document.createTextNode(part));
        });
        container.append(p);
      }
    }
  });
}

// append turns instead of replacing the log, preserving screen reader announcements.
function addMessage(role: Message["role"], content: string, source?: string) {
  messages.push({ role, content });
  const article = document.createElement("article");
  article.className = `message ${role}`;
  const label = document.createElement("div");
  label.className = "message-label";
  label.textContent = role === "user" ? "You" : "Loop";
  const body = document.createElement("div");
  body.className = "message-body";
  renderText(body, content);
  if (source) {
    const note = document.createElement("p");
    note.className = "source-note";
    note.textContent = source;
    body.append(note);
  }
  article.append(label, body);
  messagesNode.append(article);
  scroll.scrollTop = scroll.scrollHeight;
  refreshControls();
}

// derive controls from a single lifecycle to prevent overlapping requests.
function refreshControls() {
  send.disabled = busy || !question.value.trim();
  question.readOnly = busy;
  stopButton.hidden = !busy;
  element("thinking").hidden = !busy;
  element("starters").hidden = Boolean(practice) || messages.length > 1;
  element("discuss").hidden = !practice;
  guidance.disabled = busy || Boolean(practice);
  element<HTMLButtonElement>("export-chat").disabled =
    messages.length <= 1 || busy;
  document
    .querySelectorAll<HTMLButtonElement>("[data-action]")
    .forEach((button) => {
      button.disabled =
        busy ||
        (!messages.some((message) => message.role === "user") && !practice);
      if (practice && button.dataset.action !== "hint") button.disabled = true;
      if (practice && practice.step >= practice.exercise.steps.length)
        button.disabled = true;
    });
  document
    .querySelectorAll<HTMLButtonElement>("[data-exercise]")
    .forEach((button) =>
      button.setAttribute(
        "aria-current",
        String(button.dataset.exercise === practice?.exercise.id),
      ),
    );
  element("character-count").textContent =
    `${question.value.length.toLocaleString()} / 2,400`;
  element("mode-label").textContent = practice
    ? `Guided practice · ${Math.min(practice.step + 1, practice.exercise.steps.length)} of ${practice.exercise.steps.length} checks · no AI`
    : "Socratic AI tutor";
  element("composer-note").textContent = practice
    ? "Short answers are checked. Explanations are self-checked."
    : "AI can make mistakes. Check your reasoning with examples.";
}

// a new conversation invalidates unfinished responses before they can appear.
function newConversation(exerciseId?: string) {
  generation++;
  tutor.stop();
  busy = false;
  practice = undefined;
  messages = [];
  messagesNode.replaceChildren();
  chatError.hidden = true;
  question.value = "";
  const exercise = exercises.find((item) => item.id === exerciseId);
  if (exercise) {
    practice = { exercise, step: 0, misses: 0 };
    element("conversation-title").textContent = exercise.name;
    question.placeholder = "Think it through, then give a short answer…";
    addMessage(
      "assistant",
      `${exercise.intro}\n\n${exercise.steps[0].question}`,
      "Guided exercise · authored questions",
    );
  } else {
    element("conversation-title").textContent = "Your conversation";
    question.placeholder = "Paste your code or describe where you’re stuck…";
    addMessage(
      "assistant",
      "What are you working on? Share the question, your code, or a first attempt. I’ll help you work through it, one question at a time.",
    );
  }
  refreshControls();
}

// preserve a failed question as a draft and keep model history in complete turns.
function restoreLastQuestion() {
  if (messages.at(-1)?.role === "user") {
    question.value = messages.pop()!.content;
    messagesNode.lastElementChild?.remove();
  }
}

async function submit(text: string, hint = false) {
  if (busy || !text.trim()) return;
  if (text.length > 2400) {
    chatError.textContent = "Please shorten your message to 2,400 characters.";
    chatError.hidden = false;
    return;
  }
  chatError.hidden = true;
  addMessage("user", text.trim());
  question.value = "";
  if (practice) {
    const result = practiceReply(practice, text, hint);
    practice = result.state;
    addMessage("assistant", result.text);
    refreshControls();
    question.focus({ preventScroll: true });
    return;
  }
  busy = true;
  const requestId = ++generation;
  refreshControls();
  try {
    const result = await tutor.reply(messages, guidance.value as Guidance);
    if (requestId === generation)
      addMessage(
        "assistant",
        result.text,
        result.fallback
          ? "Guided prompt · the AI response did not pass the teaching check"
          : undefined,
      );
  } catch (error) {
    if (requestId === generation) {
      chatError.textContent =
        error instanceof Error
          ? error.message
          : "The tutor could not finish. Please try again.";
      chatError.hidden = false;
      restoreLastQuestion();
    }
  } finally {
    if (requestId === generation) {
      busy = false;
      refreshControls();
      question.focus({ preventScroll: true });
    }
  }
}

element("chat-form").addEventListener("submit", (event) => {
  event.preventDefault();
  void submit(question.value);
});
question.addEventListener("input", refreshControls);
question.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    void submit(question.value);
  }
});
element("new-chat").addEventListener("click", () => {
  newConversation();
  question.focus();
});
// keep mobile practice navigation available without pushing the chat below the first screen.
element("toggle-exercises").addEventListener("click", () => {
  const button = element("toggle-exercises");
  const expanded = button.getAttribute("aria-expanded") !== "true";
  button.setAttribute("aria-expanded", String(expanded));
  document
    .querySelector(".sidebar")!
    .classList.toggle("practice-open", expanded);
});
document
  .querySelectorAll<HTMLButtonElement>("[data-exercise]")
  .forEach((button) =>
    button.addEventListener("click", () => {
      newConversation(button.dataset.exercise);
      question.focus({ preventScroll: true });
    }),
  );
document
  .querySelectorAll<HTMLButtonElement>("[data-starter]")
  .forEach((button) =>
    button.addEventListener("click", () => {
      void submit(button.dataset.starter!);
    }),
  );
document
  .querySelectorAll<HTMLButtonElement>("[data-action]")
  .forEach((button) =>
    button.addEventListener("click", () => {
      const action = button.dataset.action;
      if (action === "check") {
        question.value = "Here is my reasoning: ";
        refreshControls();
        question.focus();
        return;
      }
      void submit(
        action === "hint"
          ? "I’m stuck. Give me a small hint for the next step."
          : "Can we try a simpler example of the same idea?",
        action === "hint",
      );
    }),
  );

// moving an exercise into ai chat is explicit because it sends text to the provider.
element("discuss").addEventListener("click", () => {
  if (!practice) return;
  const exercise = practice.exercise;
  newConversation();
  question.value = `I’m working on this exercise: ${exercise.intro}\n\n${exercise.reflection}\n\nHere is my reasoning: `;
  refreshControls();
  question.focus();
});
stopButton.addEventListener("click", () => {
  generation++;
  tutor.stop();
  busy = false;
  restoreLastQuestion();
  refreshControls();
});

const about = element<HTMLDialogElement>("about");
element("about-button").addEventListener("click", () => about.showModal());
element("close-about").addEventListener("click", () => about.close());
about.addEventListener("click", (event) => {
  if (event.target === about) about.close();
});

// export only this tab's conversation; there is no persistent chat database.
element("export-chat").addEventListener("click", () => {
  const text = `# Loop study notes\n\nMode: ${practice ? "Guided practice (authored)" : "Socratic AI tutor"}\n\n${messages.map((message) => `## ${message.role === "user" ? "You" : "Loop"}\n\n${message.content}`).join("\n\n")}`;
  const url = URL.createObjectURL(
    new Blob([text], { type: "text/markdown;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "loop-study-notes.md";
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
});
window.addEventListener("pagehide", () => tutor.stop());
newConversation();
