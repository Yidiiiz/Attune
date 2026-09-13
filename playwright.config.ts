// Owns: how the browser checks run. They exist because Phase 6b's annotation gutter is collision
// layout aligned to `getClientRects()[0]`, and there is no price at which that is verifiable
// without a layout engine — plus the §15 chat items, which are about what a person sees on a page
// and not only about what reaches disk.
//
// Three deliberate choices:
//
//   - **`next dev`, not `next start`.** The checks need `ATTUNE_FAKE_PROVIDER`, and that flag is
//     ignored when `NODE_ENV` is production (Phase 6a approval, condition 2) — which `next start`
//     sets. A harness that could run against the production build would mean the flag was not
//     actually locked out of one, so this is the guard working rather than a limitation.
//   - **A throwaway checkout**, seeded from `seed/` by `e2e/setup.ts` and pointed at with
//     `ATTUNE_REPO_DIR` (Decision 45). Nothing here can touch the owner's `data/`.
//   - **Chromium only.** One browser, because these check this app's behaviour rather than the
//     web platform's.
//
// **Two projects, split by one tag.** A check tagged `@known-flake` fails intermittently for a
// reason that is filed as a deferred amendment and not yet fixed. It still runs, as the
// `known-flake` project, and `check:ui` reports it after the rest under its own heading and never
// lets it set the exit code, so a clean run reads as clean. A check earns the tag only with an
// amendment naming it, and loses it when that amendment closes. The one tagged today is amendment
// `u`'s Stop check. `npx playwright test` run directly runs both projects and counts them together.
//
// Failure behavior: `npm run check:ui` refuses with the install command when the browser is absent,
// and refuses again when something is already listening on this port or on the app's dev port
// (`scripts/check-ui.mjs`); running `npx playwright test` directly is Playwright's own error.

import { defineConfig, devices } from "@playwright/test";
import { E2E_PORT as PORT } from "./e2e/ports.ts";

const KNOWN_FLAKE = /@known-flake/;

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/setup.ts",
  fullyParallel: false, // one app, one data directory, one git repository
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  timeout: 45_000,
  // A failure guard, never a measurement (AGENTS.md, Conventions: timers are never correctness).
  // Raised from 10s because a single `runBatch` commit on a loaded machine has been observed at
  // eight seconds, and a guard tight enough to fire on a slow commit reports the machine as a
  // defect. Every wait in these specs is on a state transition, so a correct run never spends this.
  expect: { timeout: 15_000 },
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  projects: [
    { name: "chromium", grepInvert: KNOWN_FLAKE },
    { name: "known-flake", grep: KNOWN_FLAKE },
  ],
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `http://127.0.0.1:${PORT}/chat`,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ATTUNE_REPO_DIR: ".e2e-sandbox",
      ATTUNE_FAKE_PROVIDER: "1",
      NODE_ENV: "development",
    },
  },
});
