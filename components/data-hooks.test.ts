// Holds the `data-*` convention (AGENTS.md, Conventions) as a check instead of a sentence: a
// `data-<thing>` attribute marks an element for a check to find, and application code never reads
// one back. The sentence alone did not hold — `useSidebar.ts` and `anchoring-dom.ts` both read
// `dataset.message` from Phase 6b to Phase 8 B2, while `MessageRow.tsx` said nothing did — which is
// the same drift `imports.test.ts` exists for.
//
// What counts as a read: `.dataset` in any form, and `getAttribute` / `getAttributeNS` /
// `getAttributeNode` with a literal `data-` name. What it does not cover, said here so the gap is
// on record: finding an element *by* an id the app already holds, as a selector
// (`[data-message='…']`), which the chat still does, and a `getAttribute` whose name is not a literal.
//
// Scope is every source file under `app/`, `components/` and `lib/`, test files excluded. A line
// whose first non-space characters are `//` or `*` is a comment and is skipped, so a header may
// name what it forbids.
//
// Failure behavior: names every offending file, line and statement, not just the first.

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCOPE = ["app", "components", "lib"];

const READS: RegExp[] = [
  /\.dataset\b/,
  /\[\s*["'`]dataset["'`]\s*\]/,
  /\.getAttribute(?:NS|Node)?\(\s*(?:[^,()]+,\s*)?["'`]data-/,
];

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : sources(abs);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [abs] : [];
  });
}

/** Every line of `text` that reads a `data-*` attribute back, as `line: statement`. */
export function readsIn(text: string): string[] {
  const found: string[] = [];
  text.split("\n").forEach((line, index) => {
    const code = line.trim();
    if (code.startsWith("//") || code.startsWith("*") || code.startsWith("/*")) return;
    if (READS.some((pattern) => pattern.test(line))) found.push(`${index + 1}: ${code}`);
  });
  return found;
}

describe("the data-* convention: application code never reads one", () => {
  it("tells a read from a mark, a lookup by a held id, and a comment", () => {
    const text = [
      "const id = element.dataset.message;",
      'const { message } = row["dataset"];',
      'const role = row.getAttribute("data-role");',
      "const kind = node.getAttributeNS(null, 'data-kind');",
      'const aria = row.getAttribute("aria-label");',
      "<article data-message={message.id} data-role={message.role}>",
      "scroller.querySelector(`[data-message='${CSS.escape(id)}']`);",
      "// never `element.dataset.message` — see the convention",
      " * or `getAttribute(\"data-x\")` in a block comment",
    ].join("\n");
    expect(readsIn(text).map((one) => Number(one.split(":")[0]))).toEqual([1, 2, 3, 4]);
  });

  it("holds for every source file under app/, components/ and lib/", () => {
    const files = SCOPE.flatMap((dir) => sources(path.join(REPO, dir)));
    const broken: string[] = [];
    let marks = 0;
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      if (/\sdata-[a-z-]+=\{/.test(text)) marks += 1;
      for (const one of readsIn(text)) broken.push(`${path.relative(REPO, file).split(path.sep).join("/")}:${one}`);
    }
    // The scan has to be reading the real tree for an empty list to mean anything: the hooks it
    // guards are written in these files, so some must be found being written.
    expect(marks).toBeGreaterThan(5);
    expect(broken).toEqual([]);
  });
});
