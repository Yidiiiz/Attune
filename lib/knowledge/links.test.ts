// The resolution precedence in `links.ts`, case by case. Every case is a string in and a string
// out: the extractor never looks at the disk, so none of these needs a checkout.

import { describe, expect, it } from "vitest";
import { extractLinks, markdownLinks, resolveDataPath, resolveLink, taskIdsIn } from "./links.ts";

const INDEX = "knowledge/index.md";
const NOTE = "knowledge/notes/basis.md";

describe("resolveLink — the body precedence", () => {
  it("reads a path starting with a top-level directory as data-relative (rule 4)", () => {
    expect(resolveLink("knowledge/profile/habits.md", INDEX)).toBe("knowledge/profile/habits.md");
    expect(resolveLink("tasks/2026-09-10-pset-4.md", NOTE)).toBe("tasks/2026-09-10-pset-4.md");
  });

  it("reads anything else as file-relative (rule 5), which is what the old seed index said", () => {
    expect(resolveLink("profile/habits.md", INDEX)).toBe("knowledge/profile/habits.md");
    expect(resolveLink("maps/courses.md", INDEX)).toBe("knowledge/maps/courses.md");
  });

  it("reads ./ and ../ as file-relative (rule 3)", () => {
    expect(resolveLink("./other.md", NOTE)).toBe("knowledge/notes/other.md");
    expect(resolveLink("../maps/courses.md", NOTE)).toBe("knowledge/maps/courses.md");
  });

  it("puts rule 4 before rule 5, so a notes folder named like a top-level directory needs ./", () => {
    // knowledge/notes/files/ exists or not — the answer is the same, because the disk is not asked.
    expect(resolveLink("files/scan.md", NOTE)).toBe("files/scan.md");
    expect(resolveLink("./files/scan.md", NOTE)).toBe("knowledge/notes/files/scan.md");
    expect(resolveLink("tasks/x.md", "knowledge/notes/tasks/y.md")).toBe("tasks/x.md");
  });

  it("cuts a fragment or query off, and keeps the file", () => {
    expect(resolveLink("knowledge/collections/movies.md#dune", NOTE)).toBe("knowledge/collections/movies.md");
    expect(resolveLink("other.md?x=1", NOTE)).toBe("knowledge/notes/other.md");
  });

  it("refuses what is not an edge into data/", () => {
    for (const target of ["", "#top", "?q", "/etc/passwd", "https://example.com", "mailto:a@b.c", "C:/x.md"]) {
      expect(resolveLink(target, NOTE)).toBeNull();
    }
    expect(resolveLink("../../../outside.md", NOTE)).toBeNull();
  });

  it("decodes a percent-escaped space", () => {
    expect(resolveLink("knowledge/notes/office%20hours.md", INDEX)).toBe("knowledge/notes/office hours.md");
  });
});

describe("resolveDataPath — frontmatter fields", () => {
  it("is data-relative whatever the path starts with", () => {
    expect(resolveDataPath("knowledge/maps/courses.md")).toBe("knowledge/maps/courses.md");
    expect(resolveDataPath("maps/courses.md")).toBe("maps/courses.md");
  });

  it("still refuses schemes and climbing out", () => {
    expect(resolveDataPath("https://example.com")).toBeNull();
    expect(resolveDataPath("../x.md")).toBeNull();
  });
});

describe("extractLinks", () => {
  it("collects frontmatter links, body links and task ids, once each, in order", () => {
    const edges = extractLinks(
      NOTE,
      { links: ["knowledge/maps/courses.md"], tags: ["math221"] },
      "See [the map](../maps/courses.md) and [pset](tasks/2026-09-10-pset-4.md), for t_20260910_ab12.\n",
    );
    expect(edges).toEqual(["knowledge/maps/courses.md", "tasks/2026-09-10-pset-4.md", "t_20260910_ab12"]);
  });

  it("reads a collection's tasks and a task's collection backlink", () => {
    expect(extractLinks("knowledge/collections/movies.md", { tasks: ["t_20260903_aaaa", "junk"] }, "- [ ] Dune → [[t_20260903_aaaa]]\n"))
      .toEqual(["t_20260903_aaaa"]);
    expect(extractLinks("tasks/2026-09-03-dune.md", { collection: "knowledge/collections/movies.md#dune" }, ""))
      .toEqual(["knowledge/collections/movies.md"]);
  });

  it("reads a message's attachments and refs, and a conversation's open file", () => {
    const message = "chats/c_20260907_9f1c/messages/01a0-x.md";
    expect(extractLinks(message, { attachments: ["files/docs/2026-09/ab12cd34-pset.pdf"], refs: ["t_20260910_ab12", "knowledge/notes/a.md"] }, ""))
      .toEqual(["files/docs/2026-09/ab12cd34-pset.pdf", "t_20260910_ab12", "knowledge/notes/a.md"]);
    expect(extractLinks("chats/c_x/conversation.md", { context: { file: "files/docs/a.pdf", taskIds: [] } }, ""))
      .toEqual(["files/docs/a.pdf"]);
  });

  it("never lists a file as linking to itself", () => {
    expect(extractLinks(NOTE, {}, "[me](basis.md) [also me](knowledge/notes/basis.md)")).toEqual([]);
  });
});

describe("helpers", () => {
  it("finds task ids bare and in double brackets", () => {
    expect(taskIdsIn("t_20260903_aaaa and [[t_20260903_bbbb]], t_20260903_aaaa again")).toEqual([
      "t_20260903_aaaa",
      "t_20260903_bbbb",
    ]);
  });

  it("ignores a link-shaped thing that is not a markdown link", () => {
    expect(markdownLinks("knowledge/notes/a.md in prose", NOTE)).toEqual([]);
  });
});
