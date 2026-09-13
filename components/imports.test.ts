// Holds §3's rule for components as a check instead of a sentence, because the sentence alone did
// not hold: it forbade every import from `lib/store/`, and type-only imports stood against it from
// Phase 3 to the Phase 7 close without anyone noticing (Decision 82). As amended, a component may
// `import type` from `lib/store/`, may not import a value from it, and may not import anything from
// `lib/history/`.
//
// Only `import type` / `export type` count as type-only. `import { type Task } from …` does not:
// under `verbatimModuleSyntax` it leaves `import {} from …` behind, which still loads the module.
//
// Failure behavior: names every offending file and statement, not just the first.

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const GUARDED = /(^|\/)lib\/(store|history)(\/|$)/;

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) return sources(abs);
    return /\.tsx?$/.test(entry.name) && !entry.name.endsWith(".test.ts") ? [abs] : [];
  });
}

interface Found {
  statement: string;
  specifier: string;
  typeOnly: boolean;
}

/** Every static import or re-export, whole (they span lines), and every dynamic `import()`. */
export function importsIn(text: string): Found[] {
  const found: Found[] = [];
  for (const match of text.matchAll(/^\s*(import|export)\b([^;]*?)\bfrom\s*["']([^"']+)["']/gm)) {
    found.push({ statement: match[0].trim(), specifier: match[3], typeOnly: /^\s*type\b/.test(match[2]) });
  }
  for (const match of text.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)) {
    found.push({ statement: match[0], specifier: match[1], typeOnly: false });
  }
  return found;
}

/** Why one import breaks §3, or null when it does not. */
export function breach(found: Found): string | null {
  const guarded = GUARDED.exec(found.specifier);
  if (guarded === null) return null;
  if (guarded[2] === "history") return "imports lib/history/, which is closed to components, types included";
  return found.typeOnly ? null : "imports a value from lib/store/; only `import type` is allowed";
}

describe("§3: what a component may import from lib/", () => {
  it("tells a type-only import from one that loads the module", () => {
    const text = [
      'import type { Task } from "@/lib/store/tasks";',
      'import type {\n  Settings,\n  Theme,\n} from "@/lib/store/settings";',
      'import { type Task } from "@/lib/store/tasks";',
      'import { listTasks } from "../../lib/store/tasks";',
      'export { readSettings } from "@/lib/store/settings";',
      'import type { Batch } from "@/lib/history/log";',
      'const mod = await import("@/lib/store/files");',
      'import { activePath } from "@/lib/chat/tree";',
    ].join("\n");
    const verdicts = importsIn(text).map((one) => [one.specifier, breach(one) === null]);
    expect(verdicts).toEqual([
      ["@/lib/store/tasks", true],
      ["@/lib/store/settings", true],
      ["@/lib/store/tasks", false],
      ["../../lib/store/tasks", false],
      ["@/lib/store/settings", false],
      ["@/lib/history/log", false],
      ["@/lib/chat/tree", true],
      ["@/lib/store/files", false],
    ]);
  });

  it("holds for every file under components/", () => {
    const files = sources(ROOT);
    const seen: Found[] = [];
    const broken: string[] = [];
    for (const file of files) {
      for (const one of importsIn(readFileSync(file, "utf8"))) {
        seen.push(one);
        const why = breach(one);
        if (why !== null) broken.push(`${path.relative(ROOT, file)}: ${why}\n    ${one.statement}`);
      }
    }
    // The scan has to be reading real statements for an empty list to mean anything: the type-only
    // imports of `Task` and `Settings` are there to be found.
    expect(seen.some((one) => one.typeOnly && GUARDED.test(one.specifier))).toBe(true);
    expect(broken).toEqual([]);
  });
});
