// Owns: proving that every module under lib/ can be loaded by plain Node, which is the constraint
// Decision 44 records and the one `tsc --noEmit` and `next build` both accept happily. Node strips
// types rather than compiling them, so an `enum`, a `namespace`, a `const enum`, or a parameter
// property compiles fine and then fails the first time a CLI script imports the file. This turns
// that into a test failure instead of a surprise at the prompt.
//
// Failure behavior: reports every module that will not load, not just the first, then exits 1.
// A file that imports a missing dependency fails here too, which is the same class of problem.

import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const LIB_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "lib");

async function collect(dir) {
  const found = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await collect(abs)));
    // Test files import vitest's globals and would run their suites on import; they are exercised
    // by vitest itself, which runs immediately after this script.
    else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) found.push(abs);
  }
  return found;
}

const modules = (await collect(LIB_DIR)).sort();
if (modules.length === 0) {
  console.error(`check-lib-imports: no modules found under ${LIB_DIR}`);
  process.exit(1);
}

const failures = [];
for (const abs of modules) {
  try {
    await import(pathToFileURL(abs).href);
  } catch (err) {
    failures.push({ rel: path.relative(path.dirname(LIB_DIR), abs), message: err.message });
  }
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`${failure.rel.split(path.sep).join("/")}: ${failure.message.split("\n")[0]}`);
  }
  console.error(
    `\ncheck-lib-imports: ${failures.length} of ${modules.length} modules will not load in plain Node.`,
  );
  console.error("check-lib-imports: lib/ is imported by scripts/*.mjs through type stripping, which");
  console.error("emits no runtime code — no enum, const enum, namespace, or parameter properties,");
  console.error("and a .ts extension on every lib/ to lib/ import (PROJECT.md Decision 44).");
  process.exit(1);
}

console.log(`check-lib-imports: ${modules.length} modules load in plain Node`);
