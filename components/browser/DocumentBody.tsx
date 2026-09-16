// Owns: a document's rendered body (PROJECT.md §10.2) — Decision 31's pipeline with the document's own
// link and image rules (`href.ts`), links into `data/` that open in place, and checkboxes a click
// saves (Decision 86).
//
// **A checkbox is clickable only when the page and the file agree on which line it is**
// (`components/markdown/checkboxes.ts`). When they might not, every box stays disabled, **and says
// why**: the reason is above the body, and on each box as its title, so a box that does nothing never
// looks like one that is broken (the Phase 8 approval's checkbox condition). A read-only file's boxes
// are disabled with the file's own reason, and every box is disabled while a click is being saved.
// A click never changes the box itself: the page shows what the file says once it has been re-read.
//
// The HTML is set once per render of the text, so the boxes are the DOM's; this component finds them
// by position in document order, which is what the lines are matched against, never by an attribute.
//
// Failure behavior: as `Markdown.tsx` — a parse that throws falls back to the plain text, with every
// box off, and nothing unsanitized is ever set.

"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { renderMarkdown } from "@/components/markdown/pipeline";
import { checkboxPlan } from "@/components/markdown/checkboxes";
import type { CheckboxPlan, TaskLine } from "@/components/markdown/checkboxes";
import type { Where } from "./href.ts";
import { documentRules } from "./href.ts";
import "katex/dist/katex.min.css";
import markdown from "@/components/markdown/Markdown.module.css";
import styles from "./Browser.module.css";

export interface DocumentBodyProps {
  path: string;
  where: Where;
  body: string;
  conversation: string | null;
  /** Why no box in this file can be ticked here, whatever the page draws; null when they can be. */
  readOnly: string | null;
  /** True while a click is being saved. */
  busy: boolean;
  onTick: (line: TaskLine) => void;
}

export default function DocumentBody({ path, where, body, conversation, readOnly, busy, onTick }: DocumentBodyProps) {
  const router = useRouter();
  const root = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const html = useMemo(() => {
    if (!mounted) return null;
    try {
      return renderMarkdown(body, documentRules(path, where, conversation));
    } catch {
      return null;
    }
  }, [mounted, body, path, where, conversation]);
  // One object per HTML string. React 19 sets `innerHTML` again whenever this prop is a different
  // object, whatever string it holds (react-dom 19.2's `updateProperties` compares the prop, not
  // `__html`), and that would put marked's `disabled` back on every box at the next render.
  const inner = useMemo(() => (html === null ? null : { __html: html }), [html]);

  const [plan, setPlan] = useState<CheckboxPlan | null>(null);
  const boxes = (): HTMLInputElement[] => [...(root.current?.querySelectorAll<HTMLInputElement>('input[type="checkbox"]') ?? [])];

  // After the HTML is in: decide once per text whether its boxes can be clicked.
  useLayoutEffect(() => {
    const drawn = boxes();
    setPlan(drawn.length === 0 ? null : checkboxPlan(body, drawn.map((box) => box.checked)));
  }, [html, body]);

  // And keep the boxes' own state in step with it, the file's read-only reason, and a click in flight.
  const reason = plan === null ? null : readOnly !== null ? `These checkboxes can't be ticked here: ${readOnly}` : plan.clickable ? null : plan.reason;
  useLayoutEffect(() => {
    for (const box of boxes()) {
      box.disabled = reason !== null || busy;
      box.title = reason ?? "";
    }
  }, [html, reason, busy]);

  const onClick = (event: React.MouseEvent<HTMLDivElement>): void => {
    const target = event.target as HTMLElement;
    if (target instanceof HTMLInputElement && target.type === "checkbox") {
      event.preventDefault(); // the file decides what the box shows, once the click is saved
      if (plan === null || !plan.clickable || reason !== null || busy) return;
      const index = boxes().indexOf(target);
      if (index >= 0) onTick(plan.lines[index]);
      return;
    }
    const anchor = target.closest("a");
    const href = anchor?.getAttribute("href") ?? "";
    if (href.startsWith("/chat?") && !event.metaKey && !event.ctrlKey && !event.shiftKey) {
      event.preventDefault(); // a link into data/ opens in place (§10.2)
      router.push(href);
    }
  };

  const classes = `${markdown.markdown} ${styles.body}`;
  return (
    <>
      {reason !== null ? (
        <p className={styles.boxNotice} role="note" data-ui="checkbox-notice">
          {reason}
        </p>
      ) : null}
      {inner === null ? (
        <div className={classes} data-ui="document-body">
          {body}
        </div>
      ) : (
        <div className={classes} ref={root} data-ui="document-body" onClick={onClick} dangerouslySetInnerHTML={inner} />
      )}
    </>
  );
}
