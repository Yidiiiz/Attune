// Owns: the composer's conversation with the server — the send, the follow-up, the add, and the
// preview that sits between them (PROJECT.md §9.4, §9.5). Split from `ComposerSheet.tsx` because
// that file crossed the ~300-line cap (AGENTS.md hard rule 5), and this is the seam worth cutting
// on: everything here is a decision, everything left there is markup and keystrokes.
//
// It also owns §13.5's routing, once. An authentication or configuration failure raises a toast,
// because its remedy is the Settings screen and the typed text did not cause it. Everything else is
// returned to the caller to render inline, next to the text that caused it and the button that
// would retry it. Having that in one function is the point: two call sites deciding separately is
// how a surface drifts into showing a key error inline and a typo in a toast.
//
// Failure behavior: no failure clears anything. The prompt, the cards, the selection and the chips
// are left exactly as they were on every error path, which is what makes a refusal recoverable by
// changing one word (Decision 50) — including the credential refusal, which is the case that turns
// that from a nicety into a rule (amendment `j`).

"use client";

import { useState } from "react";
import { reportFailure, send } from "@/components/tasks/writes";
import type { Sent } from "@/components/tasks/writes";
import type { ExtractResult } from "@/lib/agent/chat";
import type { ModelTaskDraft } from "@/lib/agent/tools";
import { mergeDraft, mergeSelection } from "./draft";

export interface TurnInput {
  viewDate?: string;
  askingAbout?: { id: string; title: string };
  /** Attachment paths, appended to every draft's `links` when they are added (§9.2). */
  links: string[];
  /** Called after a successful add, once the preview has been cleared. */
  onAdded: () => void;
}

export interface Turn {
  result: ExtractResult | null;
  drafts: ModelTaskDraft[];
  selected: boolean[];
  busy: "idle" | "sending" | "adding";
  error: string | null;
  setError: (message: string | null) => void;
  /** Send a prompt, or a follow-up when a preview is already open. True when it landed. */
  send: (text: string) => Promise<boolean>;
  add: () => Promise<void>;
  discard: () => void;
  editDraft: (index: number, next: ModelTaskDraft) => void;
  pick: (index: number, selected: boolean) => void;
}

export function useComposerTurn({ viewDate, askingAbout, links, onAdded }: TurnInput): Turn {
  const [result, setResult] = useState<ExtractResult | null>(null);
  const [drafts, setDrafts] = useState<ModelTaskDraft[]>([]);
  const [selected, setSelected] = useState<boolean[]>([]);
  const [busy, setBusy] = useState<"idle" | "sending" | "adding">("idle");
  const [error, setError] = useState<string | null>(null);
  /** The prompt that opened this preview, replayed on every follow-up so it revises (§9.5 step 4). */
  const [asked, setAsked] = useState("");

  /** §13.5: configuration and authentication toast; everything else is returned to be shown inline. */
  function route(answer: Sent, what: string): void {
    const code = typeof answer.data.code === "string" ? answer.data.code : "";
    if (code === "auth" || code === "provider") reportFailure(what, answer.error ?? "");
    else setError(answer.error);
  }

  function clear(): void {
    setResult(null);
    setDrafts([]);
    setSelected([]);
    setAsked("");
  }

  async function sendPrompt(text: string): Promise<boolean> {
    if (text === "" || busy !== "idle") return false;
    setError(null);
    setBusy("sending");

    const following = result !== null;
    const before = drafts;
    const answer = await send("/api/agent/extract", {
      method: "POST",
      body: JSON.stringify({
        prompt: following ? asked : text,
        ...(following ? { followUp: text } : {}),
        ...(result?.kind === "tasks" ? { draft: drafts } : {}),
        ...(viewDate === undefined ? {} : { viewDate }),
        ...(askingAbout === undefined ? {} : { taskIds: [askingAbout.id] }),
      }),
    });
    setBusy("idle");

    if (answer.error !== null) {
      route(answer, "Could not read that");
      return false;
    }

    const next = answer.data.result as ExtractResult;
    setResult(next);
    if (!following) setAsked(text);

    if (next.kind === "tasks") {
      // In place, keeping the edits the model did not touch (§9.5 step 4). The updater form is not
      // a style choice: `current` is the list as it stands *now*, and the whole point of the merge
      // is that a card can have been edited while the request was in flight. Reading `drafts` from
      // this closure would give the value at send time and quietly discard those edits.
      setDrafts((current) => (following ? mergeDraft(before, current, next.items) : next.items));
      setSelected((current) => mergeSelection(following ? current : [], next.items.length));
    } else {
      setDrafts([]);
      setSelected([]);
    }
    return true;
  }

  async function add(): Promise<void> {
    const items = drafts.filter((_, index) => selected[index] ?? true);
    if (items.length === 0 || busy !== "idle") return;
    setError(null);
    setBusy("adding");

    const answer = await send("/api/tasks", {
      method: "POST",
      body: JSON.stringify({
        items: items.map((item) =>
          links.length === 0 ? item : { ...item, links: [...item.links, ...links] },
        ),
        prompt: asked,
        actor: "agent",
      }),
    });
    setBusy("idle");

    if (answer.error !== null) {
      route(answer, "Could not add those tasks");
      return;
    }

    clear();
    onAdded();
  }

  function discard(): void {
    // §9.5 step 5: nothing reached disk, so there is nothing to undo and nothing is logged. A log
    // type that exists for one button is clutter; this is the deliberate deviation recorded there.
    if (!window.confirm("Discard this preview? Nothing has been written yet.")) return;
    clear();
    setError(null);
  }

  return {
    result,
    drafts,
    selected,
    busy,
    error,
    setError,
    send: sendPrompt,
    add,
    discard,
    editDraft: (index, next) =>
      setDrafts((current) => current.map((item, at) => (at === index ? next : item))),
    pick: (index, next) =>
      setSelected((current) => {
        const copy = mergeSelection(current, drafts.length);
        copy[index] = next;
        return copy;
      }),
  };
}
