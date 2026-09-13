// Owns: the one JSON shape every API route answers in (PROJECT.md §14), the translation from a
// thrown StoreError into an HTTP status, and how a request that fails its schema is answered.
// Not a route — Next only treats `route.ts` as one.
//
// **A body that fails its schema is a 400 with a fixed message, and the zod dump never leaves the
// server.** A zod message is schema internals — every field path, every bound — and can carry what
// the client sent, so it is not something to hand back to a caller, least of all on routes that take
// model-generated writes. Outside production the dump goes to the server's console instead. That is
// not "in the body outside production": this app only ever runs under `next dev`, so a body gated on
// NODE_ENV would carry the dump in the only place the app is used.
//
// Failure behavior: an unrecognized error becomes a 500 whose body still carries `ok: false` and a
// message, so a client never has to guess whether a response is a success shape or an error shape.
// A ZodError that reaches here unconverted did not come from `parseInput` — it is the store refusing
// a record, which is a fault rather than a bad request — so it is a 500, with the same fixed-message
// rule as a 400.

import { ZodError } from "zod";
import type { z } from "zod";
import { AgentError } from "@/lib/agent/registry";
import { StoreError } from "@/lib/store/paths";

const PRODUCTION = process.env.NODE_ENV === "production";

/** What a client is told when its request does not match the route's schema. Stable: routed on `code`. */
export const INVALID_REQUEST = "The request was not in the expected shape.";
/** What a client is told when the server's own records failed a schema. */
export const INVALID_RECORD = "A record failed validation on the server.";

const STATUS: Record<string, number> = {
  not_found: 404,
  exists: 409,
  invalid: 400,
  forbidden_path: 403,
  // Well-formed, understood, and refused on its content (§11.5).
  secret_rejected: 422,
  // The `AgentError` codes (§13.5). `auth` and `provider` are the two the client turns into a
  // toast, because their remedy is on another screen; the codes travel in the body, so a client
  // routes on them rather than on the status or on the wording of the message.
  auth: 401,
  provider: 502,
  aborted: 499,
  unsupported: 501,
};

export function ok(data: Record<string, unknown> = {}): Response {
  return Response.json({ ok: true, ...data });
}

export function fail(error: string, code = "error", status = 400): Response {
  return Response.json({ ok: false, error, code }, { status });
}

/** The dump, where only the operator sees it — and not at all in production. */
function logDump(what: string, err: ZodError): void {
  if (!PRODUCTION) console.warn(`api: ${what}\n${JSON.stringify(err.issues, null, 2)}`);
}

/**
 * Parse a request's input against its schema. A mismatch is a StoreError `invalid` with a fixed
 * message, so `handle` answers it 400 in the §14 shape; the issues go to the server's console.
 */
export function parseInput<Schema extends z.ZodType>(schema: Schema, value: unknown): z.output<Schema> {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  logDump("a request failed its schema", parsed.error);
  throw new StoreError("invalid", INVALID_REQUEST);
}

/** Run a route body, turning anything it throws into the §14 error shape. */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof StoreError) return fail(err.message, err.code, STATUS[err.code] ?? 400);
    if (err instanceof AgentError) return fail(err.message, err.code, STATUS[err.code] ?? 400);
    if (err instanceof ZodError) {
      logDump("a record failed its schema", err);
      return fail(INVALID_RECORD, "error", 500);
    }
    return fail((err as Error).message, "error", 500);
  }
}

/** Parse a JSON body, giving a useful message rather than a stack when it is not JSON. */
export async function body(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new StoreError("invalid", "expected a JSON body");
  }
}
