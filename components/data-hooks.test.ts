// Holds the `data-*` convention (AGENTS.md, Conventions) as a check instead of a sentence: a
// `data-<thing>` attribute marks an element for a check to find, and application code never depends
// on one. The sentence alone did not hold — `useSidebar.ts` and `anchoring-dom.ts` both read
// `dataset.message` from Phase 6b to Phase 8 B2, while `MessageRow.tsx` said nothing did — which is
// the same drift `imports.test.ts` exists for.
//
// **Two things count as depending on one, and the second was added by the B2 review.** A *read* is
// `.dataset` in any form, and `getAttribute` / `getAttributeNS` / `getAttributeNode` with a literal
// `data-` name. A *selector* is any `[data-…]` in a query, a `closest` or a `matches`: the
// attributes are test hooks, so a check may rename one freely, and an app selector keyed on one
// makes app behaviour depend on a test hook just as a read does. The chat's six selector lookups
// became callback refs through `components/chat/element-registry.ts` (Decision 99).
//
// **One selector is allowed, and the allowance is pinned rather than listed.** §16.4's injected-UI
// filter in `anchoring-dom.ts` is not a lookup of a known element: it asks whether a node sits
// inside *any* app control, which is a class of elements rather than an identity, and `PROJECT.md`
// §16.4 spells that filter `[data-ui]`. So the check requires exactly one selector in the tree, in
// that file, inside `textNodes`, matching `[data-ui]` — a file that grows a second one fails, and
// so does any other file with any selector at all. It is reported for the owner to decide, and the
// pin is what stops it spreading while they do.
//
// What it still does not cover, said here so the gap stays on record: a `getAttribute` whose name
// is not a literal, and a selector assembled from fragments at runtime.
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

/** An attribute selector naming a `data-` attribute, in any of the forms a query takes. */
const SELECTORS: RegExp[] = [/\[\s*data-[A-Za-z-]+/];

/** The one selector allowed to exist, and where (see the header). */
const ALLOWED = { file: "components/chat/anchoring-dom.ts", inside: "textNodes", is: "[data-ui]" };

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : sources(abs);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [abs] : [];
  });
}

function isComment(code: string): boolean {
  return code.startsWith("//") || code.startsWith("*") || code.startsWith("/*");
}

/** Every line of `text` matching one of `patterns`, as `line: statement`, comments skipped. */
function matchesIn(text: string, patterns: RegExp[]): string[] {
  const found: string[] = [];
  text.split("\n").forEach((line, index) => {
    const code = line.trim();
    if (isComment(code)) return;
    if (patterns.some((pattern) => pattern.test(line))) found.push(`${index + 1}: ${code}`);
  });
  return found;
}

/** Every line of `text` that reads a `data-*` attribute back, as `line: statement`. */
export function readsIn(text: string): string[] {
  return matchesIn(text, READS);
}

/** Every line of `text` that selects on a `data-*` attribute, as `line: statement`. */
export function selectorsIn(text: string): string[] {
  return matchesIn(text, SELECTORS);
}

function relative(file: string): string {
  return path.relative(REPO, file).split(path.sep).join("/");
}

describe("the data-* convention: application code never reads one, and never selects on one", () => {
  it("tells a read and a selector from a mark and from a comment", () => {
    const text = [
      "const id = element.dataset.message;",
      'const { message } = row["dataset"];',
      'const role = row.getAttribute("data-role");',
      "const kind = node.getAttributeNS(null, 'data-kind');",
      'const aria = row.getAttribute("aria-label");',
      "<article data-message={message.id} data-role={message.role}>",
      "// never `element.dataset.message` — see the convention",
      " * or `getAttribute(\"data-x\")` in a block comment",
    ].join("\n");
    expect(readsIn(text).map((one) => Number(one.split(":")[0]))).toEqual([1, 2, 3, 4]);
    expect(selectorsIn(text)).toEqual([]);

    const queries = [
      "scroller.querySelector(`[data-message='${CSS.escape(id)}']`);",
      'list.querySelectorAll("[data-pair]");',
      'parent.closest("[data-ui]");',
      "node.matches('[ data-node = \"x\" ]');",
      "const rows = list.querySelectorAll(`.${styles.row}`);",
      "// the `[data-ui]` filter, named in a comment",
    ].join("\n");
    expect(selectorsIn(queries).map((one) => Number(one.split(":")[0]))).toEqual([1, 2, 3, 4]);
  });

  it("holds for every source file under app/, components/ and lib/", () => {
    const files = SCOPE.flatMap((dir) => sources(path.join(REPO, dir)));
    const read: string[] = [];
    const selected: string[] = [];
    let marks = 0;
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      if (/\sdata-[a-z-]+=\{/.test(text)) marks += 1;
      for (const one of readsIn(text)) read.push(`${relative(file)}:${one}`);
      if (relative(file) === ALLOWED.file) continue;
      for (const one of selectorsIn(text)) selected.push(`${relative(file)}:${one}`);
    }
    // The scan has to be reading the real tree for an empty list to mean anything: the hooks it
    // guards are written in these files, so some must be found being written.
    expect(marks).toBeGreaterThan(5);
    expect(read).toEqual([]);
    expect(selected).toEqual([]);
  });

  it("pins the one allowed selector to §16.4's filter, inside the function that owns it", () => {
    const text = readFileSync(path.join(REPO, ...ALLOWED.file.split("/")), "utf8");
    const found = selectorsIn(text);
    expect(found).toHaveLength(1);
    expect(found[0]).toContain(ALLOWED.is);

    // Inside the function, not merely in the file: "the file may" is a rule scoped to an address,
    // which is the shape that let three writers drift past Decision 71.
    const lines = text.split("\n");
    const at = Number(found[0].split(":")[0]) - 1;
    const opens = lines.findIndex((line) => line.startsWith(`function ${ALLOWED.inside}(`));
    const closes = lines.findIndex((line, index) => index > opens && line === "}");
    expect(opens).toBeGreaterThan(-1);
    expect(at).toBeGreaterThan(opens);
    expect(at).toBeLessThan(closes);
  });
});
