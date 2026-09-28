# Loop — Socratic CS teaching assistant

**[Open the tutor](https://loop-cs-tutor.vercel.app)**

A free web chatbot that helps students reason through computer science problems with a focused question at a time. Students open the link and chat: no account, API key, model download, or local setup.

## Teaching behavior

- Responds to the student's latest attempt, instead of handing over a finished solution.
- Uses smaller examples when the student is stuck and counterexamples or changed assumptions when they understand.
- Offers Balanced, More support, and Push me guidance.
- Includes four authored exercises: binary search, recursion, nested-loop complexity, and index-error debugging.
- Lets students save the conversation as a Markdown file.

The system prompt lives in `src/tutor.ts`. A server-side response check rejects code dumps, explicit solution phrases, completed arithmetic examples, multiple questions, and declarative answer paragraphs before display. Rejected responses become clearly labeled authored questions. This is a heuristic, not a guarantee of correctness or perfect Socratic behavior. Free models can still give over-leading, mistaken, or awkward questions. The authored exercises check short answers only; they do not pretend to evaluate prose.

## Hosting and cost

The frontend and `/api/chat` run on Vercel Hobby. A private production environment secret holds the OpenRouter key. GitHub contains source code only. GitHub Pages alone cannot protect a shared API key or run the backend.

The server permits only these routes:

1. `qwen/qwen3.8-27b:free`
2. `google/gemma-4-31b-it:free`
3. `openrouter/free`

Every request also sets a zero input/output price ceiling. The client cannot select a model, endpoint, provider, or system instruction. There are no paid model fallbacks, paid plugins, or billing upgrades. Free model availability changes; quota exhaustion returns an explicit error, and authored practice stays available.

Vercel Hobby has hard free usage limits and is intended for personal, noncommercial projects. OpenRouter's free quota is shared across the API account, not reserved for this app. At setup on September 28, 2026, the account reported a limit of 1,000 free-model requests per UTC day. That is a dated observation, not a guaranteed future allowance.

References: [Vercel Hobby](https://vercel.com/docs/plans/hobby), [OpenRouter free routes](https://openrouter.ai/docs/guides/routing/model-variants/free), [OpenRouter limits](https://openrouter.ai/docs/api/reference/limits).

## Privacy and security

- Student messages travel through the server to OpenRouter and its selected model provider. Their data policies apply; do not enter private code, secrets, or personal data.
- No application chat database, analytics, browser persistence, or prompt logging. Reloading clears the current chat. Hosting/provider infrastructure may retain operational data.
- API credentials are server-side environment variables, never `VITE_` variables or client assets. `.env*` and `.vercel/` are ignored.
- Input role/length limits, output checks, a 45-second upstream timeout, and explicit browser-origin checks protect the endpoint. The interface allows one pending question at a time.
- There is no additional per-IP message cap: students on the same network can ask follow-up questions independently. Direct callers can still consume the shared free quota. Provider limits remain the hard cap.

## Development

Use Node 24 or later. Set `OPENROUTER_API_KEY` in the local process environment using your preferred secret manager; do not commit it or put it in a `VITE_` variable.

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:4320`. Vite serves the frontend; the same production API handler runs on port 4319. A missing key gives a clear error; guided practice requires none.

```sh
npm test
npm run build
```

`npm run preview` previews static assets only. Use `npm run dev` to test the API locally.

## Deployment

Import this repository into a Vercel Hobby project. Add `OPENROUTER_API_KEY` as a sensitive Production environment variable, then deploy. `vercel.json` defines the build, API duration, and browser security headers. Never turn on paid fallback routes to work around quota exhaustion.

If deploying under a different hostname, update the API origin allowlist in `api/chat.ts`; Vercel's `VERCEL_PROJECT_PRODUCTION_URL` is also accepted. For an optional GitHub Pages frontend, set `VITE_API_BASE` at build time to the hosted backend origin. That value is a public URL, not a secret.

## Try it

Ask: “My nested loops each run n times, so I think this is O(n).” Reply with your reasoning. Try Small hint or switch to Push me. Then select “Trace an index error” for a guided exercise.
