// Owns: `npm run init` — copying the shipped blank slate into your private tree.
// It touches no git configuration: the hook path is installed by postinstall (Decision 39),
// because init refuses to run on a clone whose tree is already populated, which is every
// clone of the private repo.
//
// Failure behavior: refuses rather than merges. A non-empty target exits 1 naming the directory,
// so an existing tree is never silently overwritten or half-merged.

import { cp, mkdir, readdir } from "node:fs/promises";
import { DATA_DIR, SEED_DIR } from "../lib/store/paths.ts";

async function entriesOf(dir) {
  try {
    return await readdir(dir);
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}

const seed = await entriesOf(SEED_DIR);
if (seed === null || seed.length === 0) {
  console.error(`init: nothing to copy — ${SEED_DIR} is missing or empty`);
  process.exit(1);
}

const existing = await entriesOf(DATA_DIR);
if (existing !== null && existing.length > 0) {
  console.error(`init: refusing to run — ${DATA_DIR} already exists and is not empty`);
  console.error("init: move or remove it first if you really want a fresh start");
  process.exit(1);
}

await mkdir(DATA_DIR, { recursive: true });
await cp(SEED_DIR, DATA_DIR, { recursive: true });
console.log(`init: copied ${seed.length} top-level entries into ${DATA_DIR}`);
