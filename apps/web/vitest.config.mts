import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

export default defineConfig({
  // The same `@/` alias tsconfig.json defines. Without it a unit test can only
  // reach modules that happen to use relative imports, which quietly makes
  // "is it testable?" depend on how its imports were written.
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
})
