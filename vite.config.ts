/// <reference types="vitest" />
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  plugins: [viteSingleFile()],
  build: {
    target: "esnext",
  },
  test: {
    environment: "jsdom",
    globals: true,
  },
});
