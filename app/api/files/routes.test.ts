// The file routes' refusals, through the handlers, against a real checkout — the failing cases the
// Phase 8 approval asked to keep in the suite: a fixture `.html` and `.svg` under uploads fetched
// through `/api/files/raw` with their disposition and headers asserted, and `.env.local` asked for by
// path through every read route and refused, tracked or not.

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { createCheckout } from "../../../lib/testing/checkout.ts";

const checkout = await createCheckout("file-routes");
const raw = (await import("./raw/route.ts")).GET;
const read = (await import("./read/route.ts")).GET;
const tree = (await import("./tree/route.ts")).GET;

const ENV = "ANTHROPIC_API_KEY=" + "sk" + "-ant-" + "R".repeat(30) + "\n";
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);

const FIXTURES: Record<string, Buffer | string> = {
  "files/docs/2026-09/a1b2c3d4-page.html": "<!doctype html><script>fetch('/api/settings/keys').then(r => r.text()).then(alert)</script>",
  "files/images/2026-09/a1b2c3d4-logo.svg": '<svg xmlns="http://www.w3.org/2000/svg" onload="fetch(\'/api/history\')"/>',
  "files/images/2026-09/a1b2c3d4-trick.png": "<html><script>alert(1)</script></html>",
  "files/images/2026-09/a1b2c3d4-photo.png": PNG,
  "files/docs/2026-09/a1b2c3d4-paper.pdf": "%PDF-1.7\n1 0 obj << /OpenAction << /JS (app.alert(1)) >> >>\n",
};

const get = (handler: (request: Request) => Promise<Response>, query: string) => handler(new Request(`http://localhost/api/files?${query}`));

beforeAll(async () => {
  await checkout.reset({
    setup: async () => {
      for (const [rel, bytes] of Object.entries(FIXTURES)) {
        await mkdir(path.dirname(path.join(checkout.data, rel)), { recursive: true });
        await writeFile(path.join(checkout.data, rel), bytes);
      }
      await writeFile(path.join(checkout.dir, ".env.local"), ENV);
    },
  });
});

describe("/api/files/raw holds the sandbox", () => {
  it.each([
    ["files/docs/2026-09/a1b2c3d4-page.html"],
    ["files/images/2026-09/a1b2c3d4-logo.svg"],
    ["files/images/2026-09/a1b2c3d4-trick.png"],
    ["files/docs/2026-09/a1b2c3d4-paper.pdf"],
  ])("serves %s as a download of octet-stream, never as what it claims to be", async (rel) => {
    const response = await get(raw, `path=${encodeURIComponent(rel)}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/octet-stream");
    expect(response.headers.get("content-disposition")).toMatch(/^attachment; filename="/);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-security-policy")).toBe("sandbox");
  });

  it("shows a real PNG inline, still sandboxed and unsniffable", async () => {
    const response = await get(raw, `path=${encodeURIComponent("files/images/2026-09/a1b2c3d4-photo.png")}`);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("content-disposition")).toMatch(/^inline;/);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-security-policy")).toBe("sandbox");
    expect(Buffer.from(await response.arrayBuffer()).equals(PNG)).toBe(true);
  });
});

describe(".env.local, asked for by path", () => {
  it.each([
    ["read, from Whole repo", read, "path=.env.local&repo=1"],
    ["raw, from Whole repo", raw, "path=.env.local&repo=1"],
    ["read, climbing out of data/", read, "path=..%2F.env.local"],
    ["raw, climbing out of data/", raw, "path=..%2F.env.local"],
  ])("is refused by %s, and the answer carries none of it", async (_where, handler, query) => {
    const response = await get(handler, query);
    const text = await response.text();
    expect(response.status).toBe(403);
    expect(text).not.toContain("sk-");
    expect(text).not.toContain("ANTHROPIC_API_KEY");
  });

  it("is in neither tree", async () => {
    for (const query of ["all=1", ""]) {
      const text = await (await get(tree, query)).text();
      expect(text).not.toContain(".env");
    }
    // …and Whole repo is a real tree, so that absence means something.
    expect(await (await get(tree, "all=1")).text()).toContain(".gitattributes");
  });
});
