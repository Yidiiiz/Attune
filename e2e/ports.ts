// Owns: the ports `npm run check:ui` cares about, in one place, because the check that refuses to
// start and the harness that starts the server must not be able to disagree about which port that
// is. A guard watching a port nothing runs on is worse than no guard: it passes, silently.
//
// `DEV_PORTS` is not this harness's own port — it is the app's. A dev server left running competes
// with the checks for a single-worker, layout-bound suite, and `next dev` walks forward when 3000 is
// taken, so a second stray lands on 3001 and a third on 3002. Three is where the walk is worth
// following; past that a listener is more likely to be something else entirely.
//
// Failure behavior: none to have. Two constants, no logic.

/** The port the browser checks start their own `next dev` on (`playwright.config.ts`). */
export const E2E_PORT = 3123;

/** `npm run dev` and the two ports Next walks to when it finds that one taken. */
export const DEV_PORTS = [3000, 3001, 3002];
