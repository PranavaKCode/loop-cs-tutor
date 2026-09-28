import { createServer } from "node:http";
import { createServer as createViteServer } from "vite";
import handler from "../api/chat.ts";

// development uses the production handler and reads secrets only from the environment.
const api = createServer((req, res) => {
  void handler(req, res);
});
api.listen(4319, "127.0.0.1");
const vite = await createViteServer({
  server: { host: "127.0.0.1", port: 4320, strictPort: true },
});
await vite.listen();
vite.printUrls();

// release both listeners when the local developer stops the preview.
async function close() {
  await vite.close();
  api.close();
  process.exit(0);
}
process.on("SIGINT", close);
process.on("SIGTERM", close);
