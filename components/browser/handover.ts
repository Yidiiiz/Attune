// Owns: how a message typed in the document view reaches the conversation that sends it
// (PROJECT.md §10.2, the Phase 8 approval's open call 3) — one `sessionStorage` entry, per
// conversation, taken exactly once.
//
// **The text is never in the URL**, which is the approval's condition and the reason this exists at
// all: an address is copied, logged by the browser's history, and shown in a tab title, and none of
// those is a place for something someone typed. `sessionStorage` is per tab and dies with it, which
// is the right lifetime for a message on its way to being sent.
//
// **Taking is a read and a remove together**, so the send happens once even under React's
// development double-run of effects; the caller holds what it took in state, which is what makes
// the text visible rather than lost if the send is then refused.
//
// The address still carries a marker (`&ask=1`) so the receiver can tell "nothing was handed over"
// from "something was handed over and is gone". The first is an ordinary navigation; the second is
// the case the approval asked never to be silent, and it becomes a message above the composer.
//
// Failure behavior: every access is wrapped. A browser with storage disabled answers false to
// `stash`, and the document view then refuses the send and keeps the text, rather than navigating
// away from it — a refusal is recoverable and a lost message is not.

"use client";

export interface Handover {
  text: string;
  /** `data/`-relative paths, already uploaded (§9.2). */
  attachments: string[];
}

const KEY = "attune.handover";

/** The one store this uses, injectable so a node test can hold it without a browser. */
export interface Store {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function session(): Store | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

const keyFor = (conversation: string): string => `${KEY}:${conversation}`;

/** Put a message where the conversation will find it. False means nothing was stored. */
export function stashHandover(conversation: string, handover: Handover, store: Store | null = session()): boolean {
  if (store === null) return false;
  try {
    store.setItem(keyFor(conversation), JSON.stringify(handover));
    return true;
  } catch {
    return false;
  }
}

/** Take the message left for this conversation, removing it, or null if there is none. */
export function takeHandover(conversation: string, store: Store | null = session()): Handover | null {
  if (store === null) return null;
  const key = keyFor(conversation);
  let raw: string | null = null;
  try {
    raw = store.getItem(key);
    if (raw !== null) store.removeItem(key);
  } catch {
    return null;
  }
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const { text, attachments } = parsed as { text?: unknown; attachments?: unknown };
    if (typeof text !== "string") return null;
    return {
      text,
      attachments: Array.isArray(attachments) ? attachments.filter((one): one is string => typeof one === "string") : [],
    };
  } catch {
    return null;
  }
}
