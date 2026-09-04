import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // `scripts/` is included for check-secrets.test.ts: the scanner is a hook, not a module, and
    // the property it is tested for — never echoing what it matched — has to be observed by
    // running it (PROJECT.md §11.5).
    include: ["lib/**/*.test.ts", "scripts/**/*.test.ts"],
  },
});
