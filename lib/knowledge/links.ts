// Owns: turning one file's text into the list of things it points at — `data/`-relative paths and
// task ids — which is every edge the link index, `kb:check`, backlinks and the graph are built from
// (PROJECT.md §6.5, §10.2). Pure, synchronous, and free of `node:path`, so the browser can use it.
//
// **How a link in a body is resolved, in this order, and without looking at the disk:**
//
//   1. Refused outright: empty, a scheme (`http:`, `mailto:`, `C:`), absolute, a bare `#fragment`
//      or `?query`. These are not edges into `data/`.
//   2. A `#fragment` or `?query` is cut off; `movies.md#dune` points at `movies.md`.
//   3. Starting with `./` or `../` — relative **to the file the link is in**. A `..` that climbs out
//      of `data/` is refused.
//   4. Starting with a top-level `data/` directory (`tasks/`, `knowledge/`, `files/`, `chats/`,
//      `settings/`, `history/`) — relative **to `data/`**. This is the form the app writes and the
//      form the agent's tools take (§4 Conventions: paths in data files are relative to `data/`).
//   5. Anything else — relative to the file. That is what a hand-written `profile/habits.md` in
//      `knowledge/index.md` means, and what the seed's index said before it was regenerated.
//
// Rule 4 before rule 5 has a cost, and it is taken deliberately: a folder under `knowledge/notes/`
// named `files` cannot be reached as `files/x.md` from beside it, because that spells a top-level
// path. Write `./files/x.md`. The alternative is asking the disk which one exists, and then the same
// text means different things on different machines — an extractor that can change its answer
// without its input changing is not one a check can trust.
//
// **Frontmatter is different: a path in a field is always `data/`-relative** — `links`, `attachments`,
// `collection`, `refs`, `context.file`. That is the Conventions rule for every data file, and a
// field has no reader who could have meant the file-relative reading. Rules 1 and 2 still apply.
//
// Failure behavior: none. Anything it cannot resolve it drops, the same trade `lib/chat/refs.ts`
// makes: a dropped edge costs one line in a report, a wrong one sends a check after a file that was
// never meant.

/** §16.9's shape exactly: `t_YYYYMMDD_4hex`, bare or as `[[t_…]]`. */
const TASK_ID_RE = /\bt_\d{8}_[0-9a-f]{4}\b/g;

/** `[label](target)`, with the target taken up to whitespace or the closing paren. */
const MARKDOWN_LINK_RE = /\[[^\]]*\]\(\s*<?([^)>\s]+)>?[^)]*\)/g;

/** The directories directly under `data/` (§4). A first segment in this set is `data/`-relative. */
export const TOP_LEVEL = new Set(["tasks", "knowledge", "files", "chats", "settings", "history"]);

/** Whether an edge names a task rather than a file. */
export const isTaskId = (edge: string): boolean => /^t_\d{8}_[0-9a-f]{4}$/.test(edge);

/** Collapse `.` and `..` segments. Null when `..` would climb above the start. */
function normalize(segments: string[]): string | null {
  const out: string[] = [];
  for (const segment of segments) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (out.length === 0) return null;
      out.pop();
    } else {
      out.push(segment);
    }
  }
  return out.length === 0 ? null : out.join("/");
}

/** The directory part of a `data/`-relative path, as segments. */
const dirOf = (fromPath: string): string[] => fromPath.split("/").slice(0, -1);

/** Rules 1 and 2: the target's path segments, or null when it is not a path into `data/` at all. */
function segmentsOf(target: string): string[] | null {
  const raw = target.trim().split("\\").join("/");
  if (raw.length === 0 || raw.startsWith("#") || raw.startsWith("?") || raw.startsWith("/")) return null;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw)) return null;

  const cut = raw.search(/[#?]/);
  const bare = cut < 0 ? raw : raw.slice(0, cut);
  if (bare.length === 0) return null;

  try {
    return decodeURI(bare).split("/");
  } catch {
    return bare.split("/"); // a malformed escape is taken literally rather than dropped
  }
}

/**
 * Resolve one link in the body of the file at `fromPath` (itself `data/`-relative) to a
 * `data/`-relative path, or null when it is not an edge into `data/`. The precedence is the one in
 * the header, and the whole of it is here.
 */
export function resolveLink(target: string, fromPath: string): string | null {
  const segments = segmentsOf(target);
  if (segments === null) return null;
  if (segments[0] === "." || segments[0] === "..") return normalize([...dirOf(fromPath), ...segments]);
  if (TOP_LEVEL.has(segments[0])) return normalize(segments);
  return normalize([...dirOf(fromPath), ...segments]);
}

/** A path from a frontmatter field: `data/`-relative whatever it starts with. */
export function resolveDataPath(target: string): string | null {
  const segments = segmentsOf(target);
  return segments === null ? null : normalize(segments);
}

/** Every task id mentioned anywhere in `text`, in order, deduplicated. */
export function taskIdsIn(text: string): string[] {
  return [...new Set(text.match(TASK_ID_RE) ?? [])];
}

/** Every markdown link in `text` that resolves into `data/`, in order, deduplicated. */
export function markdownLinks(text: string, fromPath: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(MARKDOWN_LINK_RE)) {
    const resolved = resolveLink(match[1], fromPath);
    if (resolved !== null && !found.includes(resolved)) found.push(resolved);
  }
  return found;
}

const asStrings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((one): one is string => typeof one === "string") : [];

/**
 * Every edge out of one file: its markdown links, the paths in its frontmatter `links`, a task's
 * `collection` backlink, a collection's `tasks`, a message's `attachments` and `refs`, a
 * conversation's open file, and every task id in the body. `data` is the parsed frontmatter — the
 * caller has already split it, and this module does not own YAML.
 */
export function extractLinks(fromPath: string, data: Record<string, unknown>, body: string): string[] {
  const edges: string[] = [];
  const add = (value: string | null): void => {
    if (value !== null && value !== fromPath && !edges.includes(value)) edges.push(value);
  };

  for (const target of [...asStrings(data.links), ...asStrings(data.attachments)]) add(resolveDataPath(target));
  if (typeof data.collection === "string") add(resolveDataPath(data.collection));
  const context = data.context as { file?: unknown } | null | undefined;
  if (context && typeof context === "object" && typeof context.file === "string") add(resolveDataPath(context.file));
  for (const ref of asStrings(data.refs)) add(isTaskId(ref) ? ref : resolveDataPath(ref));
  for (const id of asStrings(data.tasks)) if (isTaskId(id)) add(id);

  for (const link of markdownLinks(body, fromPath)) add(link);
  for (const id of taskIdsIn(body)) add(id);
  return edges;
}
