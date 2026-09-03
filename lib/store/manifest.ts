// Owns: the uploads directory and the generated table that indexes it (PROJECT.md §4.8) — where a
// file dropped into the app lands, and what `files/index.md` says about it. Split from files.ts so
// neither file has to carry both generic file access and upload policy.
//
// Failure behavior: a manifest that cannot be regenerated leaves the previous table in place and
// the file itself already stored; an index is a convenience, and losing an upload to a failed table
// write would not be. Hand-written descriptions in the table survive regeneration; nothing else does.

import { createHash } from "node:crypto";
import { exists, listTree, readText, writeBinary, writeText } from "./files.ts";
import type { TreeNode } from "./files.ts";
import path from "node:path";

/** `name` reduced to something safe on every filesystem, keeping the extension readable. */
export function sanitizeFileName(name: string): string {
  const base = path.basename(name).normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  const cleaned = base.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned.length > 0 ? cleaned.slice(0, 80) : "file";
}

const MANIFEST_PATH = "files/index.md";
const MANIFEST_HEADER =
  "# Files\n\nGenerated from the contents of `files/`. Everything but the description column is overwritten.\n\n";

interface ManifestRow {
  added: string;
  source: string;
  description: string;
}

/** Parse the existing table so hand-written descriptions survive regeneration. */
async function readManifestRows(): Promise<Map<string, ManifestRow>> {
  const rows = new Map<string, ManifestRow>();
  let text: string;
  try {
    text = await readText(MANIFEST_PATH);
  } catch {
    return rows;
  }
  for (const line of text.split("\n")) {
    if (!line.startsWith("|")) continue;
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    if (cells.length < 5 || cells[0] === "path" || /^-+$/.test(cells[0])) continue;
    rows.set(cells[0], { added: cells[1], source: cells[2], description: cells[3] });
  }
  return rows;
}

/**
 * Rewrite `files/index.md` from what is on disk. The `used-by` column stays empty until the link
 * index exists (Phase 8); the column is here from the start so the table shape never changes.
 */
export async function regenerateManifest(sources: Map<string, string> = new Map()): Promise<void> {
  const previous = await readManifestRows();
  const files: TreeNode[] = [];
  const collect = (nodes: TreeNode[]): void => {
    for (const node of nodes) {
      if (node.type === "dir") collect(node.children ?? []);
      else if (node.path !== MANIFEST_PATH) files.push(node);
    }
  };
  collect(await listTree("files"));
  files.sort((a, b) => a.path.localeCompare(b.path));

  const lines = ["| path | added | source | description | used-by |", "| --- | --- | --- | --- | --- |"];
  for (const file of files) {
    const prior = previous.get(file.path);
    const added = prior?.added || (file.updatedAt ?? "").slice(0, 10);
    const source = sources.get(file.path) ?? prior?.source ?? "";
    lines.push(`| ${file.path} | ${added} | ${source} | ${prior?.description ?? ""} |  |`);
  }
  await writeText(MANIFEST_PATH, `${MANIFEST_HEADER}${lines.join("\n")}\n`);
}

/**
 * Store an upload at `files/<kind>/<YYYY-MM>/<sha256-8>-<name>` (§4.8). The content hash prefix is
 * what makes re-uploading the same bytes idempotent rather than a second copy.
 */
export async function addFile(
  kind: "images" | "docs" | "other",
  name: string,
  bytes: Buffer,
  source: string,
): Promise<{ rel: string }> {
  const digest = createHash("sha256").update(bytes).digest("hex").slice(0, 8);
  const month = new Date().toISOString().slice(0, 7);
  const rel = `files/${kind}/${month}/${digest}-${sanitizeFileName(name)}`;
  if (!(await exists(rel))) await writeBinary(rel, bytes);
  await regenerateManifest(new Map([[rel, source]]));
  return { rel };
}
