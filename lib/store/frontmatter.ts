// Owns: splitting a markdown file into its YAML frontmatter and its body, and putting them back.
// Ten lines of delimiter handling on top of `yaml` (PROJECT.md Decision 28). The body is treated as
// opaque bytes: it is never trimmed, re-wrapped, or otherwise touched, which is what lets a LaTeX
// note survive edit-and-save byte for byte (§15).
//
// Failure behavior: a file whose frontmatter will not parse throws; callers that scan directories
// (listTasks) catch it, skip the file, and report the path so the UI can show a one-line warning.
// A file with no frontmatter is not an error — it is a body with no data.

import { parse, stringify } from "yaml";
import { StoreError } from "./paths.ts";

const DELIMITER = "---";

export interface Frontmatter {
  data: Record<string, unknown>;
  body: string;
}

/**
 * Split `---\n<yaml>\n---\n<body>`. Returns `{ data: {}, body: text }` when there is no
 * frontmatter block. The body is everything after the closing delimiter's newline, verbatim.
 */
export function splitFrontmatter(text: string): Frontmatter {
  const normalized = text.startsWith("﻿") ? text.slice(1) : text;

  const opening = /^---[ \t]*\r?\n/.exec(normalized);
  if (!opening) return { data: {}, body: normalized };

  const rest = normalized.slice(opening[0].length);
  const closing = /^---[ \t]*(\r?\n|$)/m.exec(rest);
  if (!closing) return { data: {}, body: normalized }; // unterminated block: it is body text, not data

  const yamlText = rest.slice(0, closing.index);
  const body = rest.slice(closing.index + closing[0].length);

  let data: unknown;
  try {
    data = parse(yamlText);
  } catch (err) {
    throw new StoreError("invalid", `frontmatter is not valid YAML: ${(err as Error).message}`);
  }

  if (data === null || data === undefined) return { data: {}, body };
  if (typeof data !== "object" || Array.isArray(data)) {
    throw new StoreError("invalid", "frontmatter must be a mapping");
  }
  return { data: data as Record<string, unknown>, body };
}

/**
 * The inverse. An empty `data` still gets a block, so a record file always looks like a record file.
 * Empty values are written as bare keys (`completedAt:`), matching the shapes in PROJECT.md §4.
 */
export function joinFrontmatter(data: Record<string, unknown>, body: string): string {
  const yamlText = stringify(data, { lineWidth: 0, nullStr: "" });
  const block = yamlText === "{}\n" || yamlText === "" ? "" : yamlText;
  return `${DELIMITER}\n${block}${DELIMITER}\n${body}`;
}
