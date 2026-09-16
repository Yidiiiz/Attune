// Owns: the document view (PROJECT.md §10.2) — one file in the main pane, in place of a conversation.
// Phase 8 B1 builds it read-only: the strip with the path and "← Back to chat", the frontmatter as a
// table, the body rendered with its links opening in place, images, checkboxes a click saves, and
// "Linked from". Edit, Save and the docked composer are B2's.
//
// What each file is shown as follows the read route's `kind`: markdown is rendered; other text is shown
// as written; an image the raw route shows inline is shown; anything else is a download link
// (Decisions 88 and 93). A markdown file whose frontmatter will not parse is shown raw with the
// parser's reason, because rendering it would hide the very line to fix.
//
// Failure behavior: a file that cannot be opened says why in the pane. A click that is refused says
// why above the body — a checkbox is an on-screen origin, so its refusal is inline, not a toast (§13.5)
// — and the file is re-read either way, so the page shows what is on disk.

"use client";

import { useState } from "react";
import Link from "next/link";
import { send } from "@/components/tasks/writes";
import type { TaskLine } from "@/components/markdown/checkboxes";
import Backlinks from "./Backlinks.tsx";
import DocumentBody from "./DocumentBody.tsx";
import FrontmatterTable from "./FrontmatterTable.tsx";
import { rawHref } from "./href.ts";
import type { Where } from "./href.ts";
import { useDocument } from "./useDocument.ts";
import styles from "./Browser.module.css";

export interface DocumentViewProps {
  path: string;
  where: Where;
  /** The conversation this was opened from, which "← Back to chat" returns to. */
  conversation: string | null;
}

const size = (bytes: number): string =>
  bytes < 1024 ? `${bytes} bytes` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export default function DocumentView({ path, where, conversation }: DocumentViewProps) {
  const { doc, error, reload } = useDocument(path, where);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);

  async function tick(line: TaskLine): Promise<void> {
    setBusy(true);
    setRefused(null);
    const answer = await send("/api/files/write", {
      method: "PUT",
      body: JSON.stringify({ path, checkbox: { line: line.line, expected: line.text } }),
    });
    if (answer.error !== null) setRefused(`That box was not changed — ${answer.error}`);
    await reload();
    setBusy(false);
  }

  const back = conversation ? `/chat?c=${encodeURIComponent(conversation)}` : "/chat";
  const readOnly = doc?.policy.save ?? null;

  return (
    <section className={styles.document} data-ui="document" aria-label={path}>
      <header className={styles.strip} data-ui="document-strip">
        <Link href={back} className={styles.back} data-ui="back-to-chat">
          ← Back to chat
        </Link>
        <span className={styles.stripPath} data-ui="document-path" title={path}>
          {where === "repo" ? <span className={styles.stripWhere}>Whole repo · </span> : null}
          {path}
        </span>
      </header>

      <div className={styles.docScroll}>
        {doc !== null && readOnly !== null ? (
          <p className={styles.readOnly} role="note" data-ui="read-only">
            Read-only: {readOnly}
          </p>
        ) : null}
        {error !== null ? (
          <p className={styles.panelError} role="alert" data-ui="document-error">
            {doc === null ? "This file could not be opened" : "This file could not be re-read"} — {error}
          </p>
        ) : null}
        {refused !== null ? (
          <p className={styles.panelError} role="alert" data-ui="checkbox-refused">
            {refused}
          </p>
        ) : null}

        {doc === null ? (
          error === null ? <p className={styles.muted}>Opening…</p> : null
        ) : doc.kind === "markdown" && doc.body !== undefined ? (
          <>
            <FrontmatterTable fields={doc.fields ?? {}} />
            <DocumentBody
              path={path}
              where={where}
              body={doc.body}
              conversation={conversation}
              readOnly={readOnly}
              busy={busy}
              onTick={(line) => void tick(line)}
            />
          </>
        ) : doc.kind === "markdown" || doc.kind === "text" ? (
          <>
            {doc.frontmatterError !== undefined ? (
              <p className={styles.panelError} role="alert" data-ui="frontmatter-error">
                The frontmatter could not be read, so the file is shown exactly as it is on disk — {doc.frontmatterError}
              </p>
            ) : null}
            <pre className={styles.plain} data-ui="document-text">
              {doc.text}
            </pre>
          </>
        ) : doc.kind === "image" ? (
          <img className={styles.image} src={rawHref(path, where)} alt={path} data-ui="document-image" />
        ) : (
          <p className={styles.muted} data-ui="document-binary">
            Not a text file ({size(doc.size)}). <a href={rawHref(path, where)}>Download it</a>.
          </p>
        )}

        {where === "data" && doc !== null ? <Backlinks path={path} conversation={conversation} /> : null}
      </div>
    </section>
  );
}
