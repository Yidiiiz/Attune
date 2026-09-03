// Owns: `npm run history` — listing, undoing, and redoing batches from the terminal (PROJECT.md
// §7.4). This is where undo is proved before any UI depends on it, and it is the first script to
// import several lib/ modules at once, so it is also where a type-stripping mistake would surface
// (Decision 44); `npm test` now catches that earlier, through scripts/check-lib-imports.mjs.
//
// Failure behavior: exits 1 with a one-line reason and writes nothing when a batch is unknown,
// already undone, or in conflict with a later change. A conflict prints the batches that touched
// the same files and the --force flag, rather than choosing for you.

import { groupBatches, readActions } from "../lib/history/log.ts";
import { undoState } from "../lib/history/undo.ts";
import { redoBatch, undoBatch } from "../lib/history/undo.ts";
import { splitLocalIso } from "../lib/schedule/dates.ts";
import { drain } from "../lib/history/queue.ts";

const [command = "list", ...rest] = process.argv.slice(2);

function flag(name, fallback) {
  const at = rest.indexOf(`--${name}`);
  return at >= 0 && rest[at + 1] !== undefined ? rest[at + 1] : fallback;
}

function fail(message) {
  console.error(`history: ${message}`);
  process.exit(1);
}

async function list() {
  const limit = Number(flag("n", "20"));
  const batches = groupBatches(await readActions());
  if (batches.length === 0) {
    console.log("history: nothing recorded yet");
    return;
  }

  for (const batch of batches.slice(-Math.max(1, limit)).reverse()) {
    const { date, time } = splitLocalIso(batch.ts);
    const state = undoState(batches, batch.batch);
    const available = state.undoable ? "undo" : state.redoable ? "redo" : "-";
    const commit = batch.commit ?? "uncommitted";
    console.log(
      `${batch.batch}  ${date} ${time}  ${batch.type.padEnd(14)} ${commit.padEnd(11)} [${available}] ${batch.summary}`,
    );
    if (batch.entries.length > 1 || batch.entries[0].targets.length > 1) {
      for (const entry of batch.entries) {
        for (const target of entry.targets) console.log(`    ${entry.type} ${target}`);
      }
    }
  }
}

async function reverse(direction) {
  const id = rest.find((arg) => !arg.startsWith("--"));
  if (!id) fail(`${direction} needs a batch id — run 'npm run history -- list' to find one`);

  const result =
    direction === "undo" ? await undoBatch(id, { force: rest.includes("--force") }) : await redoBatch(id);

  if (!result.ok && result.conflict) {
    console.error(`history: ${id} conflicts with later changes to the same files:`);
    for (const other of result.conflict) console.error(`  ${other}`);
    fail("pass --force to undo anyway");
  }
  if (!result.ok) fail(result.reason ?? `${direction} failed`);

  console.log(`history: ${direction} ${id} -> batch ${result.batch} commit ${result.commit ?? "none"}`);
}

switch (command) {
  case "list":
    await list();
    break;
  case "undo":
  case "redo":
    await reverse(command);
    break;
  default:
    fail(`unknown command '${command}'. Use: list [--n 20] | undo <batch> [--force] | redo <batch>`);
}

await drain();
