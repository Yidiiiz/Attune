// The one property the rest of the app leans on: these ids sort chronologically as strings, so a
// directory listing of `messages/` is already in creation order and no index file exists (§16.1,
// Decision 9). If that breaks, nothing fails loudly — messages just come back in the wrong order.

import { describe, expect, it } from "vitest";
import { isUuid, uuidv7 } from "./uuid.ts";

describe("uuidv7", () => {
  it("mints a well-formed v7 uuid", () => {
    const id = uuidv7();
    expect(isUuid(id)).toBe(true);
    expect(id[14]).toBe("7"); // version
    expect(["8", "9", "a", "b"]).toContain(id[19]); // variant
  });

  it("sorts as a string in creation order across milliseconds", async () => {
    const first = uuidv7();
    await new Promise((resolve) => setTimeout(resolve, 3));
    const second = uuidv7();
    expect(first < second).toBe(true);
  });

  it("sorts in creation order *within* a millisecond too, which is the case that bites", () => {
    // Minting a thousand ids takes well under a millisecond, so without the counter these come back
    // in random order — and a conversation's messages are read from a sorted directory listing.
    //
    // DO NOT RELAX THIS CASE (Decision 61). A failure here means `uuidv7` regressed, not that the
    // assertion is too strict: Decision 9 spends the message index on filename order, and the app
    // does not error when this breaks — messages just come back out of order.
    const minted = Array.from({ length: 1000 }, () => uuidv7());
    expect([...minted].sort()).toEqual(minted);
  });

  it("does not repeat itself inside one millisecond", () => {
    const minted = new Set(Array.from({ length: 1000 }, () => uuidv7()));
    expect(minted.size).toBe(1000);
  });
});

describe("isUuid", () => {
  it("refuses anything that is not one, which is how stray filenames stay out of a tree", () => {
    expect(isUuid("conversation")).toBe(false);
    expect(isUuid("019F3E54-BCD7-7B52-B5C6-C08C663367F5")).toBe(false); // we always write lower case
    expect(isUuid("019f3e54-bcd7-7b52-b5c6-c08c663367f")).toBe(false);
  });
});
