// Covers the guard, not the suite: `npm run check:ui` must refuse to start while another server is
// on one of the ports it needs free, and must name what to kill. Only the refusal is checkable here
// — the passing path launches a browser, which is exactly what `npm test` must never do — so these
// cases occupy a port first and assert the script never gets as far as Playwright.
//
// This is why the port scan runs before the browser check in `check-ui.mjs`: a guard placed after it
// would be unverifiable on any machine without the 130 MB Chromium download.

import { spawnSync } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, "check-ui.mjs");
const { DEV_PORTS, E2E_PORT } = await import("../e2e/ports.ts");

const release: Array<() => void> = [];

/**
 * Hold a port for the duration of a case. A port that is already taken needs no help: something
 * else is the listener the script is supposed to notice, which is the same condition under test.
 */
function occupy(port: number): Promise<void> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve());
    server.listen(port, "127.0.0.1", () => {
      release.push(() => server.close());
      resolve();
    });
  });
}

function run(): { code: number; output: string } {
  const result = spawnSync(process.execPath, [SCRIPT], { encoding: "utf8", timeout: 30_000 });
  return { code: result.status ?? -1, output: `${result.stdout}${result.stderr}` };
}

afterEach(() => {
  for (const close of release.splice(0)) close();
});

describe("check:ui's port guard", () => {
  it("refuses while something holds the port the checks start their own server on", async () => {
    await occupy(E2E_PORT);
    const { code, output } = run();

    expect(code).toBe(1);
    expect(output).toContain(`127.0.0.1:${E2E_PORT}`);
    expect(output).toContain("refusing to start");
    // It stopped here rather than going on to Playwright, which is the point of refusing.
    expect(output).not.toContain("playwright install");
  });

  it("refuses for the app's dev port too, since a stray dev server competes rather than collides", async () => {
    await occupy(DEV_PORTS[0]);
    const { code, output } = run();

    expect(code).toBe(1);
    expect(output).toContain(`127.0.0.1:${DEV_PORTS[0]}`);
    expect(output).toContain("competes with them");
  });

  it("names what to kill rather than describing it", async () => {
    await occupy(E2E_PORT);
    const { output } = run();

    // Either a pid and the command for it, or — when netstat/lsof is unavailable — the command that
    // finds one. Never just the port with no way forward.
    const named = /pid \d+ — (taskkill \/PID \d+ \/F|kill \d+)/.test(output);
    const howToFind = /(netstat -ano|lsof -ti)/.test(output);
    expect(named || howToFind).toBe(true);
  });
});
