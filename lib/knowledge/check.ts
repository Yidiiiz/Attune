// Owns: `npm run kb:check`'s rules (PROJECT.md §6.5) as a pure function over what was read — the
// knowledge files, the link index, the task ids — so each rule is testable without a checkout and the
// script is only the reading and the printing.
//
// **Three tiers, three exit codes.** A *violation* is one of §6.5's five findings: exit 1. A rule
// whose input did not read cleanly is *could not evaluate*: exit 2, and it outranks 1, because a run
// that could not look at everything cannot say "only these" (Decision 73). A *notice* is reported and
// never counted. CI can then tell a real problem from a check that needs a person to look.
//
// **This is the Conventions rule about lenient readers, applied.** The orphan rule decides that
// nothing links to a note, from a scan; a map it could not parse might be the one that does. So an
// unreadable map suspends the orphan rule rather than letting it guess, and an unreadable task file
// (`listTasks.errors`) suspends the collection rule for the same reason. The fewer files parse, the
// less this concludes — never the more.
//
// Links inside chat messages are not checked: a message is immutable, so a broken link in one is a
// report nobody can act on. Their edges still count as incoming links, which is what keeps an upload
// a message attached from being called unreferenced.
//
// Failure behavior: none; it cannot throw on any input shape the readers produce.

import { NOTE_WORD_CAP, PROFILE_CAP, kindOf } from "../store/knowledge.ts";
import { isTaskId, markdownLinks, taskIdsIn } from "./links.ts";
import type { LinkIndex } from "./index.ts";

export interface KnowledgeFile {
  path: string;
  /** Null when the frontmatter did not parse. */
  data: Record<string, unknown> | null;
  body: string;
}

export interface CheckInput {
  knowledge: KnowledgeFile[];
  index: Pick<LinkIndex, "files" | "outgoing" | "incoming" | "errors">;
  taskIds: Set<string>;
  /** `listTasks.errors`: task files that did not parse. */
  taskErrors: string[];
}

export interface Finding {
  rule: string;
  path: string;
  detail: string;
}

export interface Report {
  violations: Finding[];
  unevaluable: Finding[];
  notices: Finding[];
}

const words = (text: string): number => text.split(/\s+/).filter(Boolean).length;
const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((one): one is string => typeof one === "string") : [];

export function checkKnowledge(input: CheckInput): Report {
  const report: Report = { violations: [], unevaluable: [], notices: [] };
  const violation = (rule: string, path: string, detail: string): void => void report.violations.push({ rule, path, detail });
  const cannot = (rule: string, path: string, detail: string): void => void report.unevaluable.push({ rule, path, detail });

  for (const file of input.knowledge) {
    if (file.data === null) cannot("unreadable", file.path, "frontmatter does not parse, so nothing about this file was checked");
  }
  const readable = input.knowledge.filter((file) => file.data !== null);
  const ofKind = (kind: string) => readable.filter((file) => kindOf(file.path) === kind);

  // 1. Orphans: notes no map links to. Suspended whole if any map could not be read.
  const brokenMaps = input.knowledge.filter((file) => file.data === null && kindOf(file.path) === "map");
  if (brokenMaps.length > 0) {
    for (const map of brokenMaps) cannot("orphans", map.path, "this map did not parse and may be the one linking a note, so no note is called an orphan");
  } else {
    const mapped = new Set(ofKind("map").flatMap((map) => markdownLinks(map.body, map.path)));
    for (const note of ofKind("note")) {
      if (!mapped.has(note.path)) violation("orphan", note.path, "no map links to this note");
    }
  }

  // 2. Links to files that do not exist — from the knowledge base and from tasks, never from chats.
  for (const [from, edges] of input.index.outgoing) {
    if (!from.startsWith("knowledge/") && !from.startsWith("tasks/")) continue;
    for (const edge of edges) {
      if (!isTaskId(edge) && !input.index.files.has(edge)) violation("broken-link", from, `links to ${edge}, which does not exist`);
    }
  }

  // 3 and 4. Size caps, reported and never enforced on write.
  for (const note of ofKind("note")) {
    const count = words(note.body);
    if (count > NOTE_WORD_CAP) violation("note-length", note.path, `${count} words, over the ${NOTE_WORD_CAP}-word cap`);
  }
  for (const profile of ofKind("profile")) {
    const count = profile.body.split("\n").length;
    if (count > PROFILE_CAP) violation("profile-length", profile.path, `${count} lines, over the ${PROFILE_CAP}-line cap`);
  }

  // 5. Collections pointing at tasks that do not exist. Suspended if any task file could not be read.
  if (input.taskErrors.length > 0) {
    cannot(
      "collection-tasks",
      "tasks/",
      `${input.taskErrors.length} task file(s) did not parse (${input.taskErrors.join(", ")}); one may be a task a collection names`,
    );
  } else {
    for (const collection of ofKind("collection")) {
      const named = new Set([...strings(collection.data?.tasks), ...taskIdsIn(collection.body)]);
      for (const id of named) if (!input.taskIds.has(id)) violation("collection-tasks", collection.path, `names ${id}, which is not a task`);
    }
  }

  // Notice: uploads nothing points at (Decision 65). Reported, never counted — and said to be
  // uncertain when a file that could have attached one did not parse.
  const unread = input.index.errors.filter((rel) => !rel.startsWith("knowledge/"));
  if (unread.length > 0) {
    report.notices.push({ rule: "notice-uncertain", path: unread.join(", "), detail: "did not parse, so an upload listed below may be referenced after all" });
  }
  for (const rel of input.index.files) {
    if (!rel.startsWith("files/") || rel === "files/index.md") continue;
    if ((input.index.incoming.get(rel)?.size ?? 0) === 0) {
      report.notices.push({ rule: "unreferenced-upload", path: rel, detail: "nothing links to or attaches this file" });
    }
  }

  return report;
}

/** 2 outranks 1: a run that could not evaluate everything cannot claim its violations are all. */
export function exitCode(report: Report): 0 | 1 | 2 {
  if (report.unevaluable.length > 0) return 2;
  return report.violations.length > 0 ? 1 : 0;
}

export function formatReport(report: Report): string {
  const section = (title: string, findings: Finding[]): string[] =>
    findings.length === 0
      ? []
      : [`${title} (${findings.length})`, ...findings.map((f) => `  ${f.rule.padEnd(18)} ${f.path} — ${f.detail}`), ""];
  const code = exitCode(report);
  return [
    ...section("Violations", report.violations),
    ...section("Could not evaluate", report.unevaluable),
    ...section("Notices", report.notices),
    code === 0
      ? `kb:check: clean${report.notices.length > 0 ? `, with ${report.notices.length} notice(s)` : ""}`
      : code === 2
        ? "kb:check: could not evaluate everything — exit 2; fix what could not be read, then run it again"
        : `kb:check: ${report.violations.length} violation(s) — exit 1`,
  ].join("\n");
}
