// Owns: the document view (PROJECT.md §10.2) — one file in the main pane, in place of a conversation.
// The strip with the path, "← Back to chat", the Edit/Preview toggle and Save; the frontmatter as a
// table whose values are editable; the body rendered with its links opening in place, images and
// checkboxes a click saves; and "Linked from".
//
// **The toggle shows the draft, so it warns about nothing** (§10.2). Preview renders what has been
// typed, not what is on disk, which makes Edit and Preview two views of one draft rather than two
// documents: switching between them cannot lose a character, so there is nothing to ask about. Only
// leaving loses work, so only leaving warns — `beforeunload` for the tab, and an in-app confirm on
// "← Back to chat".
//
// **What is inert while a draft is unsaved is everything that writes the file by another route** — a
// checkbox, a task's Complete and `⋯` menu, and "Make this a task". Each writes immediately and
// against the file, so it would land on bytes the draft no longer matches and turn the next Save
// into a conflict nobody caused. One reason, `draftOpen`, is given to all of them, in the same place
// every other refusal appears.
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

import { useEffect, useState } from "react";
import Link from "next/link";
import { send } from "@/components/tasks/writes";
import type { TaskLine } from "@/components/markdown/checkboxes";
import Backlinks from "./Backlinks.tsx";
import CollectionItems from "./CollectionItems.tsx";
import DocumentBody from "./DocumentBody.tsx";
import DocumentComposer from "./DocumentComposer.tsx";
import DocumentEditor from "./DocumentEditor.tsx";
import FrontmatterTable from "./FrontmatterTable.tsx";
import TaskDocument from "./TaskDocument.tsx";
import { rawHref } from "./href.ts";
import type { Where } from "./href.ts";
import { useDocument } from "./useDocument.ts";
import { useDocumentDraft } from "./useDocumentDraft.ts";
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
  const draft = useDocumentDraft(path, doc, reload);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const [asking, setAsking] = useState<string | null>(null);

  // The tab's own guard. The in-app ones are the toggle and Back; this is the only one the browser
  // will honour for a close or a reload.
  useEffect(() => {
    if (!draft.dirty) return;
    const warn = (event: BeforeUnloadEvent): void => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [draft.dirty]);

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
  const editable = doc !== null && readOnly === null && (doc.body !== undefined || doc.text !== undefined);
  const name = path.split("/").pop() ?? path;

  /** Leaving is the one way a draft is lost, so it is the one thing that asks. */
  const mayLose = (): boolean => !draft.dirty || window.confirm(`Discard the unsaved changes to ${name}?`);

  /** Why a write through another route is refused while a draft is open, or null. */
  const draftOpen = draft.dirty ? "there are unsaved changes in this file" : null;
  const boxesBlocked = draftOpen ?? readOnly;
  /** What is on screen is the draft where there is one, in both Edit and Preview. */
  const shownBody = draft.draft?.body ?? doc?.body;
  const shownText = draft.draft?.text ?? doc?.text;

  return (
    <section className={styles.document} data-ui="document" aria-label={path}>
      <header className={styles.strip} data-ui="document-strip">
        <Link
          href={back}
          className={styles.back}
          data-ui="back-to-chat"
          onClick={(event) => {
            if (!mayLose()) event.preventDefault();
          }}
        >
          ← Back to chat
        </Link>
        <span className={styles.stripPath} data-ui="document-path" title={path}>
          {where === "repo" ? <span className={styles.stripWhere}>Whole repo · </span> : null}
          {path}
          {draft.dirty ? (
            <span className={styles.unsaved} data-ui="unsaved">
              {" "}
              · unsaved
            </span>
          ) : null}
        </span>
        {editable ? (
          <>
            <button
              type="button"
              className={styles.stripButton}
              data-ui="edit-toggle"
              aria-pressed={draft.editing}
              onClick={() => draft.setEditing(!draft.editing)}
            >
              {draft.editing ? "Preview" : "Edit"}
            </button>
            <button
              type="button"
              className={styles.stripButton}
              data-ui="save"
              disabled={!draft.dirty || draft.saving}
              onClick={() => void draft.save()}
            >
              {draft.saving ? "Saving…" : "Save"}
            </button>
          </>
        ) : null}
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
        {draft.error !== null ? (
          <p className={styles.panelError} role="alert" data-ui="save-refused">
            {draft.conflict
              ? "This file changed on disk after you opened it, so nothing was saved. What you typed is still here — copy what you need, then reload the page to see the other version."
              : `This file was not saved — ${draft.error}`}
          </p>
        ) : null}

        {doc === null ? (
          error === null ? <p className={styles.muted}>Opening…</p> : null
        ) : doc.kind === "markdown" && doc.body !== undefined ? (
          <>
            {doc.policy.kind === "task" && typeof doc.fields?.id === "string" ? (
              <TaskDocument id={doc.fields.id} blocked={draftOpen} onChanged={() => void reload()} />
            ) : null}
            <FrontmatterTable
              fields={doc.fields ?? {}}
              values={draft.draft?.fields ?? undefined}
              readOnly={readOnly ?? (doc.policy.fields ? null : "this file's frontmatter is not editable here")}
              onChange={draft.setField}
            />
            {draft.editing ? (
              <DocumentEditor
                value={shownBody ?? doc.body}
                onChange={draft.setBody}
                onSave={() => void draft.save()}
                busy={draft.saving}
              />
            ) : (
              <DocumentBody
                path={path}
                where={where}
                body={shownBody ?? doc.body}
                conversation={conversation}
                readOnly={boxesBlocked}
                busy={busy}
                onTick={(line) => void tick(line)}
              />
            )}
            {doc.policy.kind === "collection" && !draft.editing ? (
              <CollectionItems path={path} body={shownBody ?? doc.body} blocked={draftOpen} onChanged={() => void reload()} />
            ) : null}
          </>
        ) : doc.kind === "markdown" || doc.kind === "text" ? (
          <>
            {doc.frontmatterError !== undefined ? (
              <p className={styles.panelError} role="alert" data-ui="frontmatter-error">
                The frontmatter could not be read, so the file is shown exactly as it is on disk — {doc.frontmatterError}
              </p>
            ) : null}
            {draft.editing ? (
              <DocumentEditor
                value={shownText ?? ""}
                onChange={draft.setBody}
                onSave={() => void draft.save()}
                busy={draft.saving}
              />
            ) : (
              <pre className={styles.plain} data-ui="document-text">
                {shownText}
              </pre>
            )}
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

      {/* §10.2: the composer stays docked in document view, and what it says is about this file. */}
      <DocumentComposer path={path} conversation={conversation} error={asking} onError={setAsking} />
    </section>
  );
}
