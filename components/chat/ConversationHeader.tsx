// Owns: the strip above a conversation (PROJECT.md §10.2) — its title, the model it runs on, the
// Context toggle, and the counts §16.4 requires when an annotation exists somewhere the reader
// cannot see it.
//
// **The model selector writes `conversation.model`, not a setting.** §10.2 says the choice belongs
// to the conversation, and §11's default belongs to `settings.json`; changing the model here changes
// what this conversation uses next turn and nothing else. A model this app cannot talk to is not
// offerable — the route refuses one anyway, and being refused a screen away from where it was
// chosen is what §11.4 is about.
//
// **The list arrives as a prop, and that is not a style choice.** `MODELS` lives in
// `lib/agent/registry.ts`, which imports the provider, which imports `node:fs`; a client component
// importing it puts a filesystem module in the browser bundle and the page stops building at all.
// So `app/chat/page.tsx` — a server file — reads the registry and passes down the two fields a
// select needs. That is Decision 30's boundary showing up as a build error rather than as a rule
// someone remembered.
//
// The two counts are §16.4's "silent is not acceptable" in its two forms: annotations on branches
// that are not the open one, and annotations that exist but have no gutter to be drawn in
// (Decision 66). Both are optional props and both render nothing at zero, so the header is the same
// element before Stage C's annotations exist as after.
//
// Failure behavior: a model change that the route refuses toasts and the select snaps back, because
// the value shown is the conversation's and the conversation did not change. §13.5 routes it to a
// toast rather than inline: the header has no error line of its own, and inventing one for a
// control that is right there would be a second failure surface for the same class of problem.

"use client";

import styles from "./Chat.module.css";

/** Just enough of a `ModelEntry` to draw an option — see the header on why it is not the type. */
export interface ModelChoice {
  id: string;
  label: string;
}

export interface ConversationHeaderProps {
  models: ModelChoice[];
  title: string;
  model: string;
  /** True while `ATTUNE_FAKE_PROVIDER` is answering, so the page says so rather than looking odd. */
  scripted: boolean;
  contextOpen: boolean;
  onToggleContext: () => void;
  onModelChange: (model: string) => void;
  /** §16.4: annotations on messages that are not on the active path. */
  offPath?: number;
  /** Decision 66: annotations that exist but whose gutter has no room. */
  hidden?: number;
  /** Opens the list of off-path annotations; absent until Stage C builds one. */
  onShowOffPath?: () => void;
}

export default function ConversationHeader({
  models,
  title,
  model,
  scripted,
  contextOpen,
  onToggleContext,
  onModelChange,
  offPath = 0,
  hidden = 0,
  onShowOffPath,
}: ConversationHeaderProps) {
  return (
    <header className={styles.viewHeader} data-ui="conversation-header">
      <h1 className={styles.viewTitle}>{title || "New conversation"}</h1>

      <select
        className={styles.modelSelect}
        data-ui="model-select"
        value={model}
        aria-label="Model for this conversation"
        onChange={(event) => onModelChange(event.target.value)}
      >
        {/* A conversation whose model has left the registry still shows what it says, rather than
            silently displaying a different one because the select had no matching option. */}
        {models.some((entry) => entry.id === model) ? null : <option value={model}>{model}</option>}
        {models.map((entry) => (
          <option key={entry.id} value={entry.id}>
            {entry.label}
          </option>
        ))}
      </select>

      {offPath > 0 ? (
        <button
          type="button"
          className={styles.headerCount}
          data-ui="off-path-count"
          onClick={onShowOffPath}
        >
          {offPath} {offPath === 1 ? "note" : "notes"} on other branches
        </button>
      ) : null}

      {hidden > 0 ? (
        <span
          className={styles.headerCount}
          data-ui="hidden-count"
          title="Widen the window, or collapse the left panel, to see them."
        >
          {hidden} {hidden === 1 ? "note" : "notes"} hidden
        </span>
      ) : null}

      <button
        type="button"
        className={styles.contextToggle}
        data-ui="context-toggle"
        aria-pressed={contextOpen}
        onClick={onToggleContext}
      >
        Context
      </button>

      {scripted ? (
        <span
          className={styles.scriptedBadge}
          title="ATTUNE_FAKE_PROVIDER is set: replies come from a script in lib/agent/scripted.ts, not from a model."
        >
          scripted replies
        </span>
      ) : null}
    </header>
  );
}
