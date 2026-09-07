// Owns: the API-key section of Settings, over HTTP (PROJECT.md §14, §11.5). Three verbs, one file
// on disk, and one rule that shapes all of it: a key value travels *in* on a PUT and never travels
// out again. GET answers with the mask and the name; the log records the name and whether it is
// set; nothing anywhere returns, echoes, or writes the value itself.
//
// The write goes through `runBatch` like every other write in the app (§1 rule 6), with two things
// that make it unlike the others. `commit: false`, because `.env.local` is git-ignored and there is
// nothing to commit. And `scope: "user"`, because scope records *whose* change this is rather than
// which directory it touched — `.env.local` is outside `data/` and is as personal as anything in it
// (§12, Decision 57).
//
// Failure behavior: an unknown key name is a 400 that names the keys this app knows, rather than
// writing a line nothing will ever read. The entry the batch leaves behind is deliberately not
// undoable, and `undoBatch` says so in those words (§7.2, Decision 58).

import { z } from "zod";
import { runBatch } from "@/lib/history/batch";
import { setKey } from "@/lib/history/actions";
import { KNOWN_KEYS, maskKey, readKeys } from "@/lib/store/env";
import { StoreError } from "@/lib/store/paths";
import { body, handle, ok } from "../../respond";

export const dynamic = "force-dynamic";

const Input = z.object({
  name: z.string().min(1),
  /** Present on a PUT, absent on a DELETE. It is read once and handed to the store. */
  value: z.string().min(1).optional(),
});

function known(name: string): void {
  if (!KNOWN_KEYS.some((key) => key.name === name)) {
    const names = KNOWN_KEYS.map((key) => key.name).join(", ");
    throw new StoreError("invalid", `${name} is not a key this app uses. Known keys: ${names}.`);
  }
}

/** Every known key, said or unsaid, with the mask §11.5 shows and never the value. */
export async function GET(): Promise<Response> {
  return handle(async () => {
    const stored = await readKeys();
    const keys = KNOWN_KEYS.map((key) => {
      const value = stored[key.name];
      const set = value !== undefined && value.length > 0;
      return { name: key.name, label: key.label, set, masked: set ? maskKey(value) : null };
    });
    return ok({ keys });
  });
}

export async function PUT(request: Request): Promise<Response> {
  return handle(async () => {
    const { name, value } = Input.parse(await body(request));
    known(name);
    if (value === undefined) throw new StoreError("invalid", "a value is required; use DELETE to clear one");

    const result = await write(name, value.trim());
    return ok({ ...result, name, masked: maskKey(value.trim()) });
  });
}

export async function DELETE(request: Request): Promise<Response> {
  return handle(async () => {
    const asked = new URL(request.url).searchParams.get("name");
    const name = asked ?? (Input.parse(await body(request)).name);
    known(name);
    return ok({ ...(await write(name, null)), name });
  });
}

function write(name: string, value: string | null): ReturnType<typeof runBatch> {
  const summary = value === null ? `remove ${name}` : `set ${name}`;
  return runBatch({
    actor: "user",
    scope: "user",
    summary,
    commitPrefix: "settings",
    commit: false,
    actions: [setKey(name, value)],
  });
}
