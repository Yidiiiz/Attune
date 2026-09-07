// §16.6. The recognizer has to be cheap and certain: it decides whether the quote-reply feature
// mounts at all, so a false positive costs an overlay on every ordinary blockquote.

import { describe, expect, it } from "vitest";
import { findQuoteSource, parseQuoteReply } from "./quotes.ts";
import type { Message } from "./types.ts";

let minted = 0;

function message(id: string, text: string, role: Message["role"] = "assistant"): Message {
  minted += 1;
  return {
    schema: 1,
    id,
    parentId: null,
    role,
    status: "complete",
    createdAt: `2026-09-07T10:${String(minted).padStart(2, "0")}:00-04:00`,
    model: null,
    attachments: [],
    refs: [],
    deleted: false,
    error: null,
    text,
  };
}

describe("parseQuoteReply", () => {
  it("takes the leading blockquote and strips its markers", () => {
    expect(parseQuoteReply("> the change of basis matrix\n\nwhy is it transposed?")).toBe(
      "the change of basis matrix",
    );
  });

  it("takes several quoted lines as one quotation", () => {
    expect(parseQuoteReply("> one\n> two\n\nwhy?")).toBe("one\ntwo");
  });

  it("answers null for a message that does not open with one", () => {
    expect(parseQuoteReply("why is it transposed?\n\n> not a reply quote")).toBeNull();
    expect(parseQuoteReply("")).toBeNull();
    expect(parseQuoteReply(">   \n\nempty quote")).toBeNull();
  });
});

describe("findQuoteSource", () => {
  const path = [
    message("a1", "The **change of basis** matrix is P."),
    message("u2", "> change of basis matrix\n\nwhy transposed?", "user"),
    message("a2", "Because the columns are coordinates. The change of basis matrix is P."),
    message("u3", "> change of basis matrix\n\nand again?", "user"),
  ];

  it("finds the quoted message, matching across markdown syntax", () => {
    const source = findQuoteSource(path, 1, "change of basis matrix");
    expect(source?.id).toBe("a1");
  });

  it("takes the nearest earlier occurrence, not the first", () => {
    const source = findQuoteSource(path, 3, "change of basis matrix");
    expect(source?.id).toBe("a2");
  });

  it("never looks forward from the quoting message", () => {
    expect(findQuoteSource(path, 0, "change of basis matrix")).toBeNull();
  });

  it("answers null for a quotation from outside the conversation", () => {
    expect(findQuoteSource(path, 3, "something nobody said")).toBeNull();
    expect(findQuoteSource(path, 3, "")).toBeNull();
  });
});
