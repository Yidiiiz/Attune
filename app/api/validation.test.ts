// A request that fails its route's schema is a 400 in the §14 shape with a fixed message, one route
// per family that parses a body — agent, chats, collections, files, history, settings, tasks. Calendar,
// sync and weather parse no body with zod; knowledge and search parse only a query string. What is checked is the whole
// body, so a zod dump, a field path or anything the client sent cannot ride along in it; and that the
// dump is not lost, only moved to the server's console.
//
// The sandbox is an empty directory: every one of these must fail before it reads the store, so a
// route that reads first answers something other than 400 and the test says so.

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createTempDir } from "../../lib/testing/checkout.ts";

process.env.ATTUNE_REPO_DIR = await createTempDir("validation");

type Handler = (request: Request, context: { params: Promise<Record<string, string>> }) => Promise<Response>;

const SENTINEL = "zq-sentinel-7";

let respond: typeof import("./respond.ts");
let routes: Record<string, { handler: Handler; params?: Record<string, string>; body: unknown }>;

beforeAll(async () => {
  respond = await import("./respond.ts");
  routes = {
    agent: { handler: (await import("./agent/apply/route.ts")).POST as Handler, body: { proposal: { kind: SENTINEL } } },
    chats: { handler: (await import("./chats/route.ts")).POST as Handler, body: { title: 42, [SENTINEL]: SENTINEL } },
    collections: {
      handler: (await import("./collections/[slug]/promote/route.ts")).POST as Handler,
      params: { slug: "movies" },
      body: { item: `Not A Slug ${SENTINEL}` },
    },
    files: { handler: (await import("./files/op/route.ts")).POST as Handler, body: { op: SENTINEL, path: 7 } },
    history: { handler: (await import("./history/undo/route.ts")).POST as Handler, body: { batch: 7, force: SENTINEL } },
    settings: { handler: (await import("./settings/route.ts")).PUT as Handler, body: { timezone: [SENTINEL] } },
    tasks: { handler: (await import("./tasks/route.ts")).POST as Handler, body: { items: SENTINEL } },
  };
});

afterEach(() => vi.restoreAllMocks());

const send = (route: { handler: Handler; params?: Record<string, string>; body: unknown }) =>
  route.handler(
    new Request("http://localhost/api", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(route.body) }),
    { params: Promise.resolve(route.params ?? {}) },
  );

describe("a body that fails its schema", () => {
  for (const family of ["agent", "chats", "collections", "files", "history", "settings", "tasks"]) {
    it(`is 400 with the fixed message and nothing else — ${family}`, async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const response = await send(routes[family]);
      const text = await response.text();

      expect(response.status).toBe(400);
      expect(JSON.parse(text)).toEqual({ ok: false, error: respond.INVALID_REQUEST, code: "invalid" });
      expect(text).not.toContain(SENTINEL);
      // The dump went to the operator's console instead of the body.
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0][0])).toContain("a request failed its schema");
    });
  }

  it("is 400 for a route parameter as well as a body — collections' slug", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const response = await send({ ...routes.collections, params: { slug: `../${SENTINEL}` }, body: { item: "dune" } });
    expect(response.status).toBe(400);
    expect(await response.text()).not.toContain(SENTINEL);
  });
});

describe("what is not a bad request", () => {
  it("answers a ZodError that did not come from parseInput with 500 and the fixed record message", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const refused = z.object({ title: z.string() }).safeParse({ title: SENTINEL.length });
    const response = await respond.handle(async () => {
      throw refused.error;
    });
    const text = await response.text();

    expect(response.status).toBe(500);
    expect(JSON.parse(text)).toEqual({ ok: false, error: respond.INVALID_RECORD, code: "error" });
    expect(text).not.toContain("title");
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("keeps a body that is not JSON at all as the authored 400 it was", async () => {
    const response = await routes.history.handler(new Request("http://localhost/api", { method: "POST", body: "{" }), {
      params: Promise.resolve({}),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: "expected a JSON body", code: "invalid" });
  });

  it("still answers a fault that is not a ZodError with 500", async () => {
    const response = await respond.handle(async () => {
      throw new Error("disk on fire");
    });
    expect(response.status).toBe(500);
  });
});
