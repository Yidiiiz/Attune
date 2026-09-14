// Owns: a file's bytes for `<img>` and for download (PROJECT.md §10.2, §14). What it may be shown as,
// and the headers that keep a hostile upload from running as this app, are `lib/security/raw.ts`'s:
// inline only for a PNG, JPEG, GIF or WebP whose bytes and name agree; everything else — SVG, HTML
// and PDF included — `application/octet-stream` as an attachment; `nosniff` and a CSP sandbox on all
// of it. The same reads as `/api/files/read`, through `readForBrowser`.
//
// Failure behavior: a refused or missing file is the §14 JSON error, not bytes.

import { z } from "zod";
import { readForBrowser } from "@/lib/store/browse";
import { trackedFiles } from "@/lib/history/git";
import { deliveryFor } from "@/lib/security/raw";
import { handle, parseInput } from "../../respond";

export const dynamic = "force-dynamic";

const Query = z.object({ path: z.string().min(1).max(500), repo: z.enum(["0", "1"]).optional() });

export async function GET(request: Request): Promise<Response> {
  return handle(async () => {
    const { path, repo } = parseInput(Query, Object.fromEntries(new URL(request.url).searchParams));
    const where = repo === "1" ? "repo" : "data";
    const bytes = await readForBrowser(path, where, where === "repo" ? new Set(await trackedFiles()) : undefined);
    const { headers } = deliveryFor(path, bytes);
    return new Response(new Uint8Array(bytes), { status: 200, headers: { ...headers, "Content-Length": String(bytes.length) } });
  });
}
