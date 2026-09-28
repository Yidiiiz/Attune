// Owns: the list of test files that build a git checkout, which is the set `vitest.config.ts` runs
// in one fork, in series.
//
// Why there is a list at all. Every file here calls `createCheckout`, and so runs `reset()` once per
// test: `rm -rf data`, copy `seed/` over it, `git add -A`, commit. Run twenty forks of that against
// one disk and the calls collide — `ENOTEMPTY` on the remove, `EEXIST` on the copy, `EBUSY` on a
// file git is reading, and `git add -A` failing outright — while each file passes on its own. The
// Phase 8 close measured it both ways: parallel gave 3 to 13 failures a run and fully serial gave
// 741/741 in 111 seconds (AGENTS.md, "The load, diagnosed and not fixed"). Serialising these files
// and leaving the rest parallel costs a few seconds over fully serial and keeps the result the same
// every time, which is what someone cloning this repo sees first.
//
// It is a list rather than a glob because the property is "builds a git checkout", and no directory
// in this project holds exactly those files — they are spread across `app/`, `lib/agent/`,
// `lib/history/`, `lib/knowledge/` and `lib/store/`. `git-files.test.ts` is what keeps the list
// honest: it fails if a file calls `createCheckout` and is not named here, so a new one cannot be
// added to the suite and quietly go back to racing the others.
//
// Failure behavior: none of its own — it is a constant. A file missing from it runs in the parallel
// project and reintroduces the contention, which is what its test exists to prevent.

/** Every test file that calls `createCheckout`, in the order `git ls-files` gives them. */
export const GIT_FILES = [
  "app/api/files/routes.test.ts",
  "lib/agent/auto-apply.test.ts",
  "lib/agent/distill.test.ts",
  "lib/agent/turn.test.ts",
  "lib/history/batch-commit.test.ts",
  "lib/history/chat-actions.test.ts",
  "lib/history/document-actions.test.ts",
  "lib/history/file-actions.test.ts",
  "lib/history/git-snapshot.test.ts",
  "lib/history/knowledge-actions.test.ts",
  "lib/history/links.test.ts",
  "lib/history/sweep.test.ts",
  "lib/knowledge/index.test.ts",
  "lib/store/browse.test.ts",
  "lib/store/manifest.test.ts",
];
