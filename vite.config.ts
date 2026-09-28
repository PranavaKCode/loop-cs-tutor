import { defineConfig } from "vite";

// relative assets work on both github project pages and localhost.
export default defineConfig({
  base: "./",
  server: { proxy: { "/api": "http://127.0.0.1:4319" } },
});
