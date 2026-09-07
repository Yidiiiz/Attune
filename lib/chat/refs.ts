// Owns: PROJECT.md §16.9 — pulling the task ids and `data/` paths a message mentions out of its
// markdown, so the rest of the app can treat a conversation as a node with edges rather than as
// opaque prose. They are computed once at finalize and stored on the message (§4.7) precisely so
// the link index, the graph and a task's backlinks never have to re-parse every message body.
//
// Two kinds of reference, one list. A task id is recognizable on its own anywhere in the text; a
// file reference has to be a markdown link, because a bare `knowledge/notes/x.md` in a sentence is
// as likely to be prose about the file as a reference to it, and a wrong edge in the graph is worse
// than a missing one.
//
// Failure behavior: pure string work that cannot throw. Anything it is unsure about it drops — a
// link with a scheme, an absolute path, anything climbing out of the tree with `..`. Dropping a
// real reference costs one graph edge; keeping a bad one puts a path this app must never resolve
// into a file under `data/` and into the link index that reads them back.

/** §16.9's shape exactly: `t_YYYYMMDD_4hex`. */
const TASK_ID_RE = /\bt_\d{8}_[0-9a-f]{4}\b/g;

/** `[label](target)`, with the target taken up to whitespace or the closing paren. */
const MARKDOWN_LINK_RE = /\[[^\]]*\]\(\s*<?([^)>\s]+)>?[^)]*\)/g;

/**
 * Whether a link target names a file under `data/`. Deliberately conservative and deliberately
 * free of `node:path`, so this module stays importable in a browser: a scheme, a protocol-relative
 * or absolute path, a fragment, a query, or any `..` segment disqualifies it.
 */
export function isDataPath(target: string): boolean {
  if (target.length === 0) return false;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(target)) return false; // http:, mailto:, data:, C:
  if (target.startsWith("/") || target.startsWith("\\") || target.startsWith("#") || target.startsWith("?")) {
    return false;
  }
  return !target.split(/[\/]/).includes("..");
}

/**
 * Every task id and `data/`-relative link target in `text`, in the order they appear, deduplicated.
 * One list rather than two because that is what §4.7's `refs` field is and what the graph consumes.
 */
export function extractRefs(text: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();

  const keep = (value: string): void => {
    if (seen.has(value)) return;
    seen.add(value);
    found.push(value);
  };

  const hits: Array<{ at: number; value: string }> = [];
  for (const match of text.matchAll(TASK_ID_RE)) {
    hits.push({ at: match.index, value: match[0] });
  }
  for (const match of text.matchAll(MARKDOWN_LINK_RE)) {
    const target = match[1];
    if (isDataPath(target)) hits.push({ at: match.index, value: target });
  }

  hits.sort((a, b) => a.at - b.at);
  for (const hit of hits) keep(hit.value);
  return found;
}
