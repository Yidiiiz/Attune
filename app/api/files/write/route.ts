// Owns: saving from the document view, and a checkbox click in it (PROJECT.md §10.2, §14) — logged
// by path as `task.update`, `knowledge.write` or `file.write`. The rules are the builders' in
// `lib/history/document-actions.ts`, enforced inside the batch; this is the adapter.
//
// A save is `{ path, base, fields, body }` from the table and the editor, or `{ path, base, text }`
// for a file with no frontmatter or one whose frontmatter will not parse; `base: null` creates. A
// click is `{ path, checkbox: { line, expected } }`. An unchanged save answers `unchanged: true` with
// no batch behind it.
//
// Failure behavior: 409 `conflict` when the file changed after it was opened, 422 when the text
// holds a credential, 403 when the policy refuses — each with nothing written, so the text the page
// sent is still the page's.

import { z } from "zod";
import { store } from "@/lib/history/batch";
import { saveDocument, toggleCheckbox } from "@/lib/history/document-actions";
import { body as readBody, handle, ok, parseInput } from "../../respond";

export const dynamic = "force-dynamic";

const Path = z.string().min(1).max(500);
const Toggle = z.object({ path: Path, checkbox: z.object({ line: z.number().int().min(0), expected: z.string().max(10_000) }) });
const Save = z.object({
  path: Path,
  base: z.string().regex(/^[0-9a-f]{64}$/).nullable(),
  fields: z.record(z.string(), z.unknown()).nullable().optional(),
  body: z.string().optional(),
  text: z.string().optional(),
  mapLink: z.string().max(500).nullable().optional(),
  reason: z.string().max(500).optional(),
});

export async function PUT(request: Request): Promise<Response> {
  return handle(async () => {
    const input = parseInput(z.union([Toggle, Save]), await readBody(request));
    if ("checkbox" in input) {
      const result = await toggleCheckbox(store, { path: input.path, ...input.checkbox });
      return ok({ ...result, unchanged: false });
    }
    return ok({ ...(await saveDocument(store, input)) });
  });
}
