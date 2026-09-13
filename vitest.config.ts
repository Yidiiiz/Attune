import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // The same mapping `tsconfig.json` gives the compiler, so a module under `components/` can be
    // imported by its test with the `@/` specifier every other file in the app writes.
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)).replace(/[\\/]$/, "") },
  },
  test: {
    environment: "node",
    // `scripts/` is included for check-secrets.test.ts: the scanner is a hook, not a module, and
    // the property it is tested for — never echoing what it matched — has to be observed by
    // running it (PROJECT.md §11.5).
    //
    // `components/` is included for the pure helpers that live beside the components using them —
    // `components/today/format.ts` is the first — which are split by feature rather than moved
    // under `lib/` to be testable (PROJECT.md §1 rule 5).
    //
    // `app/` is included for the route tests, which call a route's handler directly with a `Request`
    // — the only way to observe the whole response body a caller would get.
    include: ["lib/**/*.test.ts", "scripts/**/*.test.ts", "components/**/*.test.ts", "app/**/*.test.ts"],
  },
});
