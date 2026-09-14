// Owns: one file for the document view (PROJECT.md §10.2, §14) — its text split into frontmatter and
// body, its `version` for the stale-save check, what kind of thing it is, what the view may do with
// it, and a collection's items for amendment `s`'s rows. `repo=1` reads from "Whole repo".
//
// Every read goes through `readForBrowser`, which refuses a credential-shaped name, an untracked
// repository file, and a link that leads out of its tree — asked for directly, not only when listed.
// `version` is `versionOf` over exactly the bytes read here, the same function the save builder uses
// on the same read (`lib/history/document-actions.ts`), and the page sends it back untouched.
//
// Failure behavior: a markdown file whose frontmatter will not parse is still returned — as `text`,
// with `frontmatterError` saying why — so the view can open it raw and the owner can fix it there.

import { z } from "zod";
import { splitFrontmatter } from "@/lib/store/frontmatter";
import { readForBrowser } from "@/lib/store/browse";
import { trackedFiles } from "@/lib/history/git";
import { versionOf } from "@/lib/history/document-actions";
import { policyFor } from "@/lib/history/write-policy";
import { itemsOf } from "@/lib/knowledge/items";
import { deliveryFor, looksLikeText } from "@/lib/security/raw";
import { handle, ok, parseInput } from "../../respond";

export const dynamic = "force-dynamic";

const Query = z.object({ path: z.string().min(1).max(500), repo: z.enum(["0", "1"]).optional() });

/** §10.2: "Outside `data/` the tree is read-only unless the composer is in Build mode." */
const REPO_READ_ONLY = "Outside data/, files are read-only here; Build mode is where the project's own files change.";

export async function GET(request: Request): Promise<Response> {
  return handle(async () => {
    const { path, repo } = parseInput(Query, Object.fromEntries(new URL(request.url).searchParams));
    const where = repo === "1" ? "repo" : "data";
    const bytes = await readForBrowser(path, where, where === "repo" ? new Set(await trackedFiles()) : undefined);

    const text = looksLikeText(bytes);
    const kind = text ? (path.endsWith(".md") ? "markdown" : "text") : deliveryFor(path, bytes).inline ? "image" : "binary";
    const policy =
      where === "repo"
        ? { kind: "readonly", save: REPO_READ_ONLY, create: REPO_READ_ONLY, rename: REPO_READ_ONLY, remove: REPO_READ_ONLY, fields: false }
        : policyFor(path, { text });

    const payload: Record<string, unknown> = { path, where, kind, size: bytes.length, version: versionOf(bytes), policy };
    if (kind === "markdown") {
      const whole = bytes.toString("utf8");
      try {
        const { data, body } = splitFrontmatter(whole);
        Object.assign(payload, { fields: data, body });
        if (/^knowledge\/collections\/[^/]+\.md$/.test(path) && where === "data") payload.items = itemsOf(body);
      } catch (err) {
        Object.assign(payload, { text: whole, frontmatterError: (err as Error).message });
      }
    } else if (kind === "text") {
      payload.text = bytes.toString("utf8");
    }
    return ok(payload);
  });
}
