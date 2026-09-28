import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";
import { GIT_FILES } from "./lib/testing/git-files.ts";

// The same mapping `tsconfig.json` gives the compiler, so a module under `components/` can be
// imported by its test with the `@/` specifier every other file in the app writes.
const alias = { "@": fileURLToPath(new URL(".", import.meta.url)).replace(/[\\/]$/, "") };

// `scripts/` is included for check-secrets.test.ts: the scanner is a hook, not a module, and the
// property it is tested for — never echoing what it matched — has to be observed by running it
// (PROJECT.md §11.5).
//
// `components/` is included for the pure helpers that live beside the components using them —
// `components/today/format.ts` is the first — which are split by feature rather than moved under
// `lib/` to be testable (PROJECT.md §1 rule 5).
//
// `app/` is included for the route tests, which call a route's handler directly with a `Request` —
// the only way to observe the whole response body a caller would get.
const INCLUDE = ["lib/**/*.test.ts", "scripts/**/*.test.ts", "components/**/*.test.ts", "app/**/*.test.ts"];

// Two projects, because the files that build a git checkout cannot run beside each other. Twenty
// forks each removing a `data/` tree, copying `seed/` over it and running `git add -A` on one disk
// collide — ENOTEMPTY, EEXIST, EBUSY and a failing `git add` — and the run lands anywhere between
// 727 and 741 passing (AGENTS.md, "The load, diagnosed and not fixed"). `lib/testing/git-files.ts`
// is the set, with the test that keeps it complete.
//
// It has to be `poolOptions.forks.singleFork` and not `fileParallelism`: vitest 3.2 lists
// `fileParallelism` in `NonProjectOptions`, so it cannot be set for one project. `singleFork` puts
// the project's files in one worker, which runs them one after another — the same effect for this
// purpose, and the form the Phase 8 close measured.
export default defineConfig({
  test: {
    // Fails the run if it ends with more test-made temp directories than it began with — the check
    // that `lib/testing/checkout.ts` removed every one it made (AGENTS.md, the B1 review's addendum).
    // It is a root option: one registry and one before/after comparison for the whole run, across
    // both projects.
    globalSetup: ["lib/testing/leftovers.ts"],
    projects: [
      {
        resolve: { alias },
        test: {
          name: "git",
          environment: "node",
          include: GIT_FILES,
          poolOptions: { forks: { singleFork: true } },
        },
      },
      {
        resolve: { alias },
        test: {
          name: "parallel",
          environment: "node",
          include: INCLUDE,
          exclude: [...configDefaults.exclude, ...GIT_FILES],
        },
      },
    ],
  },
});
