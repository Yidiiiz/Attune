// Owns: the one JSON shape every API route answers in (PROJECT.md §14) and the translation from a
// thrown StoreError into an HTTP status. Not a route — Next only treats `route.ts` as one.
//
// Failure behavior: an unrecognized error becomes a 500 whose body still carries `ok: false` and a
// message, so a client never has to guess whether a response is a success shape or an error shape.

import { AgentError } from "@/lib/agent/registry";
import { StoreError } from "@/lib/store/paths";

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

/** Run a route body, turning anything it throws into the §14 error shape. */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof StoreError) return fail(err.message, err.code, STATUS[err.code] ?? 400);
    if (err instanceof AgentError) return fail(err.message, err.code, STATUS[err.code] ?? 400);
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
