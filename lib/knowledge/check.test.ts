// §6.5's rules and the three tiers, over hand-built input — no checkout, because the rules are pure.
// The cases that matter most are the suspensions: a broken map or an unreadable task file must stop
// the rule it could mislead, and must be exit 2 even when there are violations beside it.

import { describe, expect, it } from "vitest";
import { checkKnowledge, exitCode, formatReport } from "./check.ts";
import { extractLinks } from "./links.ts";
import type { CheckInput, KnowledgeFile } from "./check.ts";

const MAP = "knowledge/maps/courses.md";
const NOTE = "knowledge/notes/office-hours.md";

const file = (path: string, data: Record<string, unknown> | null, body: string): KnowledgeFile => ({ path, data, body });

/** Build the index the way the real one is built, from the same files, plus any others named. */
function input(files: KnowledgeFile[], extra: { other?: KnowledgeFile[]; tasks?: string[]; taskErrors?: string[] } = {}): CheckInput {
  const all = [...files, ...(extra.other ?? [])];
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, Set<string>>();
  for (const one of all) {
    if (one.data === null) continue;
    const edges = extractLinks(one.path, one.data, one.body);
    outgoing.set(one.path, edges);
    for (const edge of edges) incoming.set(edge, new Set([...(incoming.get(edge) ?? []), one.path]));
  }
  return {
    knowledge: files,
    index: { files: new Set(all.map((one) => one.path)), outgoing, incoming, errors: all.filter((one) => one.data === null).map((one) => one.path) },
    taskIds: new Set(extra.tasks ?? []),
    taskErrors: extra.taskErrors ?? [],
  };
}

const map = (body = `- [Office hours](${NOTE}) — weekly\n`) => file(MAP, { id: "m_1", title: "Courses" }, body);
const note = (path = NOTE, body = "Thursdays.\n") => file(path, { id: "n_1", title: "Office hours", links: [MAP] }, body);

describe("the five rules", () => {
  it("is clean, exit 0, when every note is on a map and every link resolves", () => {
    const report = checkKnowledge(input([map(), note()]));
    expect(report).toEqual({ violations: [], unevaluable: [], notices: [] });
    expect(exitCode(report)).toBe(0);
  });

  it("names an orphan and exits 1", () => {
    const report = checkKnowledge(input([map(""), note()]));
    expect(report.violations).toEqual([{ rule: "orphan", path: NOTE, detail: "no map links to this note" }]);
    expect(exitCode(report)).toBe(1);
  });

  it("names a link to a file that does not exist", () => {
    const report = checkKnowledge(input([map(), note(NOTE, "See [gone](knowledge/notes/gone.md).\n")]));
    expect(report.violations.map((f) => f.detail)).toEqual(["links to knowledge/notes/gone.md, which does not exist"]);
  });

  it("names a note over 200 words and a profile file over 150 lines", () => {
    const long = note(NOTE, `${"word ".repeat(201)}\n`);
    const profile = file("knowledge/profile/habits.md", {}, Array(151).fill("- x").join("\n"));
    expect(checkKnowledge(input([map(), long, profile])).violations.map((f) => f.rule)).toEqual(["note-length", "profile-length"]);
  });

  it("names a collection pointing at a task that does not exist", () => {
    const collection = file("knowledge/collections/movies.md", { id: "k_1", title: "Movies", tasks: ["t_20260903_aaaa"] }, "- [ ] Dune → [[t_20260903_bbbb]]\n");
    const report = checkKnowledge(input([collection], { tasks: ["t_20260903_aaaa"] }));
    expect(report.violations).toEqual([{ rule: "collection-tasks", path: "knowledge/collections/movies.md", detail: "names t_20260903_bbbb, which is not a task" }]);
  });
});

describe("could not evaluate — exit 2, and it outranks 1", () => {
  it("suspends the orphan rule when a map does not parse, rather than calling its notes orphans", () => {
    const broken = file(MAP, null, "---\n: : :\n---\n");
    const report = checkKnowledge(input([broken, note(), note("knowledge/notes/other.md")]));
    expect(report.violations.filter((f) => f.rule === "orphan")).toEqual([]);
    expect(report.unevaluable.map((f) => f.rule)).toEqual(["unreadable", "orphans"]);
    expect(exitCode(report)).toBe(2);
  });

  it("suspends the collection rule while any task file is unreadable", () => {
    const collection = file("knowledge/collections/movies.md", { id: "k_1", title: "Movies", tasks: ["t_20260903_aaaa"] }, "");
    const report = checkKnowledge(input([collection], { taskErrors: ["tasks/broken.md"] }));
    expect(report.violations).toEqual([]);
    expect(report.unevaluable[0].detail).toContain("tasks/broken.md");
    expect(exitCode(report)).toBe(2);
  });

  it("is exit 2, not 1, when there are violations as well", () => {
    const report = checkKnowledge(input([map(), note(NOTE, "[gone](knowledge/notes/gone.md)"), file("knowledge/maps/people.md", null, "")]));
    expect(report.violations.length).toBeGreaterThan(0);
    expect(exitCode(report)).toBe(2);
    expect(formatReport(report)).toContain("exit 2");
  });
});

describe("notices, and what is not checked", () => {
  it("lists an upload nothing points at, without changing the exit code", () => {
    const upload = file("files/docs/2026-09/ab12cd34-pset.pdf", {}, "");
    const report = checkKnowledge(input([map(), note()], { other: [upload] }));
    expect(report.notices.map((f) => f.path)).toEqual(["files/docs/2026-09/ab12cd34-pset.pdf"]);
    expect(exitCode(report)).toBe(0);
  });

  it("counts a message's attachment as a reference, and never reports a message's broken link", () => {
    const upload = file("files/docs/2026-09/ab12cd34-pset.pdf", {}, "");
    const message = file("chats/c_x/messages/01a0.md", { attachments: [upload.path] }, "[gone](knowledge/notes/gone.md)");
    const report = checkKnowledge(input([map(), note()], { other: [upload, message] }));
    expect(report).toEqual({ violations: [], unevaluable: [], notices: [] });
  });
});
