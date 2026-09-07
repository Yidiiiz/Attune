// Owns: matching a piece of text against another piece of text when the two do not agree about
// whitespace or markdown syntax — the "dense projection" ported verbatim from `HANDOFF-CHAT.md`
// Part E, which PROJECT.md §16.4 says to take as-is.
//
// The asymmetry it exists for is this app's normal state, not an edge case: what is stored is
// markdown and what someone selects with a pointer is rendered text. `**due Friday**` on disk is
// `due Friday` on screen, and a selection spanning a list item carries newlines the rendered DOM
// does not have. Comparing those two directly fails, and a failed anchor is a note that silently
// moves to the top of a message.
//
// Two modes, both needed. Whitespace-only compares rendered text against a selection. Whitespace
// plus markdown compares rendered text against the raw markdown source, which is what a quote reply
// does when it looks for its quotation inside an earlier message's body (§16.6).
//
// Failure behavior: every function answers "not found" rather than throwing — an empty needle, a
// projection that maps to nothing, an unterminated match. `findDense` also caps at 200 hits, which
// is the guard against a one-character quote inside a long message turning a render into a scan.

/** Whitespace, plus (markdown mode) the syntax characters rendering removes. */
const WHITESPACE_RE = /\s/g;
const MARKDOWN_RE = /[\s*_~`#>|+-]/g;

export interface DenseIndex {
  /** The source text this projection was built from. */
  source: string;
  /** The projection: source minus every ignored character. */
  dense: string;
  /** dense offset → offset of that character in `source`. */
  map: number[];
}

export interface DenseMatch {
  /** Offsets in the source text. */
  start: number;
  end: number;
  /** Offsets in the dense projection, for prefix/suffix comparison. */
  denseStart: number;
  denseEnd: number;
}

/** The dense projection of `text` (see the module header). */
export function densify(text: string, markdown = false): string {
  return text.replace(markdown ? MARKDOWN_RE : WHITESPACE_RE, "");
}

export function denseIndex(text: string, markdown = false): DenseIndex {
  const ignored = markdown ? MARKDOWN_RE : WHITESPACE_RE;
  let dense = "";
  const map: number[] = [];

  for (let i = 0; i < text.length; i += 1) {
    const ch = text.charAt(i);
    ignored.lastIndex = 0;
    if (ignored.test(ch)) continue;
    dense += ch;
    map.push(i);
  }

  return { source: text, dense, map };
}

/** Every occurrence of `needle`, densely matched, reported in source coordinates. */
export function findDense(index: DenseIndex, needle: string, markdown = false, limit = 200): DenseMatch[] {
  const dense = densify(needle, markdown);
  if (dense.length === 0) return [];

  const matches: DenseMatch[] = [];
  for (let pos = index.dense.indexOf(dense); pos >= 0; pos = index.dense.indexOf(dense, pos + 1)) {
    const start = index.map[pos];
    const end = index.map[pos + dense.length - 1];
    if (start === undefined || end === undefined) break;
    matches.push({ start, end: end + 1, denseStart: pos, denseEnd: pos + dense.length });
    if (matches.length >= limit) break; // pathological repetition guard
  }

  return matches;
}

/** The first occurrence only. */
export function findDenseFirst(index: DenseIndex, needle: string, markdown = false): DenseMatch | null {
  return findDense(index, needle, markdown, 1)[0] ?? null;
}
