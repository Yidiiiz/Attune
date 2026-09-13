// Owns: `npm run kb:check` (PROJECT.md §6.5) — reading the knowledge base, the link index and the
// task list through the store, handing them to the rules in lib/knowledge/check.ts, and exiting with
// the tier the report lands in: 0 clean, 1 violations, 2 could not evaluate everything. Notices never
// change the code. Honours ATTUNE_REPO_DIR like every script here (Decision 45).
//
// Failure behavior: an error reading the tree itself — not one bad file, which is a finding — exits 2
// with the message, because a check that could not run has evaluated nothing.

import { buildLinkIndex } from "../lib/knowledge/index.ts";
import { checkKnowledge, exitCode, formatReport } from "../lib/knowledge/check.ts";
import { listKnowledge } from "../lib/store/knowledge.ts";
import { readText } from "../lib/store/files.ts";
import { splitFrontmatter } from "../lib/store/frontmatter.ts";
import { listTasks } from "../lib/store/tasks.ts";

try {
  const knowledge = [];
  for (const path of await listKnowledge()) {
    const text = await readText(path);
    try {
      const { data, body } = splitFrontmatter(text);
      knowledge.push({ path, data, body });
    } catch {
      knowledge.push({ path, data: null, body: text });
    }
  }

  const index = await buildLinkIndex();
  const tasks = await listTasks();
  const report = checkKnowledge({
    knowledge,
    index,
    taskIds: new Set(tasks.map((task) => task.id)),
    taskErrors: listTasks.errors,
  });

  console.log(formatReport(report));
  process.exitCode = exitCode(report);
} catch (err) {
  console.error(`kb:check: could not read the data directory (${err.message})`);
  process.exitCode = 2;
}
