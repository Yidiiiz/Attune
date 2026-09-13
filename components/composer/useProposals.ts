// Owns: the proposal tray — what a turn proposed and nobody has acted on yet (PROJECT.md §9.5, §9.6,
// §6.3). The chat tab keeps one above its composer and the sheet keeps one in Ask mode; both are this
// hook, so a card behaves the same wherever it is drawn.
//
// **In memory only** (Phase 7 approval, open call 3): a reload clears it, as it clears the sheet's
// preview. Losing a task draft costs a retype and losing a distill costs a model call; distill is the
// first thing to get persistence if that proves slow or expensive. The same asymmetry is why a
// distill card's Discard asks first and every other card's does not (the Phase 7 close, decision 3).
//
// **One card per knowledge write**, each with its own Add, because each write is its own decision: a
// turn that proposes a note and a profile change has not asked for both or neither. A task proposal
// stays one card with a selection, which is how the preview panel already treats a list of drafts.
//
// Failure behavior: an Add that is refused keeps its card exactly as it was, edits included, with the
// message on the card (§13.5, Decision 50) — the §6.3 map refusal and the §11.5 credential refusal
// are both fixed by changing the card and pressing Add again. Nothing is removed until it has landed.

"use client";

import { useCallback, useRef, useState } from "react";
import { reportNotice, send } from "@/components/tasks/writes";
import type { ModelTaskDraft, Proposal } from "@/lib/agent/tools";
import type { ProposedWrite } from "@/lib/agent/memory";

interface CardState {
  key: string;
  busy: boolean;
  error: string | null;
  /** Made by Distill, so throwing it away costs a model call to get back: its Discard confirms. */
  distilled?: boolean;
}

export type TrayItem = CardState &
  (
    | { kind: "knowledge"; write: ProposedWrite }
    | { kind: "tasks"; drafts: ModelTaskDraft[]; selected: boolean[] }
    | { kind: "collection"; collection: string; items: string[] }
  );

export interface Tray {
  items: TrayItem[];
  /** A problem with the tray rather than with one card — a distill that did not come back. */
  error: string | null;
  setError: (message: string | null) => void;
  /** `from: "distill"` marks the cards as a distill's, whose Discard asks first. */
  receive: (proposal: Proposal, from?: "distill") => void;
  /** Replace a card's content — an edit to a write, a draft, or a selection. */
  update: (key: string, next: TrayItem) => void;
  add: (key: string) => Promise<void>;
  discard: (key: string) => void;
}

/** What `/api/agent/apply` is sent for a card: what the card holds now, never what first arrived. */
function proposalOf(item: TrayItem): Record<string, unknown> {
  if (item.kind === "knowledge") {
    // `rewritten` explains the write and is not part of it; the route would drop it anyway.
    const { path, op, content, reason, mapLink } = item.write;
    return { kind: "knowledge", writes: [{ path, op, content, reason, mapLink }] };
  }
  if (item.kind === "tasks") {
    return { kind: "tasks", items: item.drafts.filter((_, index) => item.selected[index] ?? true) };
  }
  return { kind: "collection", collection: item.collection, items: item.items };
}

/** What landed, for the notice that replaces the card. */
function landed(item: TrayItem): string {
  if (item.kind === "knowledge") return `Saved to ${item.write.path}`;
  if (item.kind === "tasks") return "Tasks added";
  return item.collection.startsWith("new:") ? `Started the collection ${item.collection.slice(4)}` : `Added to ${item.collection}`;
}

export interface TrayOptions {
  /** §4.2's `source` for what lands — `chat:<id>` — or null before the conversation exists. */
  source: string | null;
  /** After a card lands, for a surface that shows what it wrote (the sheet refreshes Today). */
  onAdded?: () => void;
}

export function useProposals(opts: TrayOptions): Tray {
  const [items, setItems] = useState<TrayItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  // Read at press time: `add` is async, and the card it acts on is the one on screen now.
  const current = useRef(items);
  current.current = items;
  const options = useRef(opts);
  options.current = opts;

  const key = (): string => {
    seq.current += 1;
    return `p${seq.current}`;
  };

  const receive = useCallback((proposal: Proposal, from?: "distill") => {
    const fresh = { busy: false, error: null, ...(from === "distill" ? { distilled: true } : {}) };
    const next: TrayItem[] =
      proposal.kind === "knowledge"
        ? proposal.writes.map((write) => ({ ...fresh, key: key(), kind: "knowledge" as const, write }))
        : proposal.kind === "tasks"
          ? [{ ...fresh, key: key(), kind: "tasks" as const, drafts: proposal.items, selected: proposal.items.map(() => true) }]
          : [{ ...fresh, key: key(), kind: "collection" as const, collection: proposal.collection, items: proposal.items }];
    if (next.length > 0) setItems((all) => [...all, ...next]);
  }, []);

  const patch = (at: string, change: Partial<CardState>): void =>
    setItems((all) => all.map((item) => (item.key === at ? { ...item, ...change } : item)));

  const add = useCallback(async (at: string) => {
    const item = current.current.find((one) => one.key === at);
    if (item === undefined || item.busy) return;
    patch(at, { busy: true, error: null });
    const answer = await send("/api/agent/apply", {
      method: "POST",
      body: JSON.stringify({
        proposal: proposalOf(item),
        actor: "agent",
        ...(options.current.source === null ? {} : { source: options.current.source }),
      }),
    });
    if (answer.error !== null) {
      patch(at, { busy: false, error: answer.error });
      return;
    }
    setItems((all) => all.filter((one) => one.key !== at));
    reportNotice(landed(item));
    options.current.onAdded?.();
  }, []);

  const discard = useCallback((at: string) => {
    const item = current.current.find((one) => one.key === at);
    if (item?.distilled === true && !window.confirm("Discard this summary? Making it again is another model call.")) return;
    setItems((all) => all.filter((one) => one.key !== at));
  }, []);

  return {
    items,
    error,
    setError,
    receive,
    update: useCallback((at: string, next: TrayItem) => {
      setItems((all) => all.map((item) => (item.key === at ? next : item)));
    }, []),
    add,
    discard,
  };
}
