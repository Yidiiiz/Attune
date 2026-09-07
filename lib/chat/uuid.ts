// Owns: the one id every message and annotation in this app is named by. Ported from
// `HANDOFF-CHAT.md` Part B, which is the only reason it is hand-rolled rather than a dependency:
// UUIDv7 is 20 lines, and PROJECT.md Decision 28 spends its dependency budget elsewhere.
//
// Version 7 matters for a specific, load-bearing reason (§16.1): the first 48 bits are a
// millisecond timestamp, so these ids sort chronologically as strings — and since one message is
// one file named by its id, `ls data/chats/<id>/messages/` is a conversation in creation order for
// free, with no index file to keep in step (Decision 9).
//
// Ids are minted on the client and sent with the request (§16.2), so this module has to run
// unchanged in a browser and in Node. It uses `crypto.getRandomValues`, which is a global in both.
//
// **Within one millisecond the timestamp cannot order anything**, and the handoff's version left
// those ids in random order — which quietly breaks the claim above, since several messages can
// easily be written inside the same millisecond. So the 12 bits after the version hold a counter
// that increments while the clock stands still (the "monotonic random" method the UUIDv7 spec
// allows), and a clock that jumps backwards is ignored in favour of the last millisecond issued.
// Ordering is then exact for every id this process mints. Found by a test asserting the property
// the rest of the app was already relying on.
//
// Failure behavior: nothing here can fail — no I/O and no parsing, so a caller that gets a string
// back has a well-formed id. The counter is the one piece of state, and it is per process: two
// browser tabs minting inside the same millisecond can still tie, and the tie then breaks on the
// random half. That costs the display order of two sibling branches and nothing else, because
// `tree.ts` orders by `(createdAt, id)` and structure comes from `parentId`, never from the name.

let lastMs = 0;
let counter = 0;

/** A UUIDv7: 48-bit big-endian millisecond timestamp, a monotonic counter, then random bits. */
export function uuidv7(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  // Never go backwards: a clock correction must not issue an id that sorts before one already out.
  let ts = Math.max(Date.now(), lastMs);
  if (ts === lastMs) {
    counter = (counter + 1) & 0xfff;
    if (counter === 0) ts = lastMs + 1; // the counter wrapped; borrow the next millisecond
  } else {
    counter = 0;
  }
  lastMs = ts;

  bytes[0] = (ts / 2 ** 40) & 0xff;
  bytes[1] = (ts / 2 ** 32) & 0xff;
  bytes[2] = (ts / 2 ** 24) & 0xff;
  bytes[3] = (ts / 2 ** 16) & 0xff;
  bytes[4] = (ts / 2 ** 8) & 0xff;
  bytes[5] = ts & 0xff;
  bytes[6] = 0x70 | ((counter >> 8) & 0x0f); // version 7, then the counter's high nibble
  bytes[7] = counter & 0xff;
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10xx

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Whether a string is shaped like one of ours. Used to keep stray filenames out of the tree. */
export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
}
