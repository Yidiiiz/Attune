// Where the browser sends a reader: a document's address, a backlink's, and a document's own links
// and images (PROJECT.md §10.2). A `data/` document resolves links by the link index's rule, so what
// the page opens is what backlinks counted.

import { describe, expect, it } from "vitest";
import { documentHref, documentRules, linkerHref, rawHref, resolveRepoLink } from "./href.ts";

describe("addresses", () => {
  it("opens a document with its conversation carried, so Back has somewhere to go", () => {
    expect(documentHref("knowledge/notes/a b.md", "data", "c_20260915_abcd")).toBe("/chat?open=knowledge%2Fnotes%2Fa+b.md&c=c_20260915_abcd");
    expect(documentHref("README.md", "repo", null)).toBe("/chat?open=README.md&repo=1");
  });

  it("opens a conversation that links here as the conversation, and anything else as a document", () => {
    expect(linkerHref("chats/c_20260915_abcd/conversation.md", null)).toBe("/chat?c=c_20260915_abcd");
    expect(linkerHref("knowledge/maps/courses.md", "c_1")).toBe("/chat?open=knowledge%2Fmaps%2Fcourses.md&c=c_1");
  });

  it("asks the raw route for bytes, naming the tree", () => {
    expect(rawHref("files/images/a.png", "data")).toBe("/api/files/raw?path=files%2Fimages%2Fa.png");
    expect(rawHref("docs/logo.png", "repo")).toBe("/api/files/raw?path=docs%2Flogo.png&repo=1");
  });
});

describe("a data/ document's links and images", () => {
  const rules = documentRules("knowledge/maps/courses.md", "data", null);

  it("resolves a link the way the link index does: data/-relative by its first segment, else beside the file", () => {
    expect(rules.href("knowledge/notes/change-of-basis.md")).toBe("/chat?open=knowledge%2Fnotes%2Fchange-of-basis.md");
    expect(rules.href("../notes/change-of-basis.md#part")).toBe("/chat?open=knowledge%2Fnotes%2Fchange-of-basis.md");
    expect(rules.href("people.md")).toBe("/chat?open=knowledge%2Fmaps%2Fpeople.md");
  });

  it("leaves a web address and a fragment as written", () => {
    expect(rules.href("https://example.com/x.md")).toBeNull();
    expect(rules.href("#section")).toBeNull();
  });

  it("shows a raster image inline and makes an SVG or a PDF a download (Decisions 88, 93)", () => {
    expect(rules.image("files/images/2026-09/ab-photo.JPG")).toEqual({ src: "/api/files/raw?path=files%2Fimages%2F2026-09%2Fab-photo.JPG" });
    expect(rules.image("files/images/d.svg")).toEqual({ download: "/api/files/raw?path=files%2Fimages%2Fd.svg" });
    expect(rules.image("files/docs/paper.pdf")).toEqual({ download: "/api/files/raw?path=files%2Fdocs%2Fpaper.pdf" });
  });
});

describe("a Whole repo document's links", () => {
  it("resolves beside the file, and not above the checkout", () => {
    expect(resolveRepoLink("../lib/store/files.ts", "docs/CHECKLIST.md")).toBe("lib/store/files.ts");
    expect(resolveRepoLink("../../../etc/passwd", "docs/a.md")).toBe("etc/passwd");
    expect(resolveRepoLink("mailto:someone@example.invalid", "README.md")).toBeNull();
  });

  it("opens a link into data/ from the data tree", () => {
    const rules = documentRules("README.md", "repo", null);
    expect(rules.href("data/knowledge/index.md")).toBe("/chat?open=knowledge%2Findex.md");
    expect(rules.href("PROJECT.md")).toBe("/chat?open=PROJECT.md&repo=1");
  });
});
