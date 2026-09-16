// Owns: PROJECT.md Decision 31's pipeline as three pure-ish functions, with no React and no CSS,
// so the half that can be tested without a browser is. `Markdown.tsx` is the component around it.
//
// **The math is stashed behind NUL placeholders before `marked` runs**, and that order is the whole
// trick — it cannot be retrofitted. `$P^{-1}AP$` contains `_`, `^` and `{}`, which a markdown parser
// is entitled to read as emphasis, and once it has the TeX is gone. So the math comes out first,
// `marked` sees placeholders it cannot mangle, and KaTeX renders into the gaps afterwards. Code
// spans are respected for the same reason: `$` inside a fence is a dollar sign, not an equation.
//
// **Sanitizing is not optional.** The text arrives from a model, which can be steered by a file it
// was asked to read, and from files on disk that anything may have written. `marked` passes raw
// HTML through by default, so without `DOMPurify` a note containing a `<script>` tag would be one.
// That step needs a DOM, which is why `renderMarkdown` runs only in the browser and why the node
// tests here stop at `renderUnsafe`; the sanitizing itself is checked in `e2e/chat.spec.ts`.
//
// Failure behavior: an equation KaTeX rejects renders as its own source in red rather than throwing
// (`throwOnError: false`), and a placeholder with no equation behind it is left as it is instead of
// becoming an empty span. Everything else is the caller's to catch.

import DOMPurify from "dompurify";
import katex from "katex";
import { Marked, marked } from "marked";

/** NUL cannot appear in a markdown source we wrote, which is what makes it a safe placeholder.
 * Exported so a test can build the expected intermediate text without a raw NUL in its own source. */
export const MARK = "\u0000";

export interface Stashed {
  text: string;
  /** `raw` is the whole span as it was in the source, delimiters included: a display block over
   * several lines becomes a one-line placeholder, and `checkboxes.ts` needs to count the lines back. */
  math: Array<{ tex: string; display: boolean; raw: string }>;
}

/** Ranges `marked` must see verbatim: fenced blocks and inline code. */
const CODE_RE = /```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`/g;

/**
 * Display math first, then inline. Inline requires non-space just inside both delimiters, which is
 * what keeps "$5 and $10 for lunch" from becoming an equation.
 */
const DISPLAY_RE = /\$\$([\s\S]+?)\$\$/g;
const INLINE_RE = /\$(?!\s)((?:[^$\n\\]|\\.)+?)(?<!\s)\$/g;

/** Take the math out of `source`, leaving placeholders `marked` will carry through untouched. */
export function stashMath(source: string): Stashed {
  const math: Stashed["math"] = [];

  // Where code lives in *this* pass, so math inside it is left alone. Recomputed per pass rather
  // than once, because replacing the display spans moves every offset after them.
  const take = (re: RegExp, display: boolean, text: string): string => {
    const code: Array<[number, number]> = [];
    for (const match of text.matchAll(CODE_RE)) code.push([match.index, match.index + match[0].length]);
    const inCode = (at: number): boolean => code.some(([from, to]) => at >= from && at < to);

    return text.replace(re, (whole, tex: string, at: number) => {
      if (inCode(at)) return whole;
      math.push({ tex: tex.trim(), display, raw: whole });
      return `${MARK}${math.length - 1}${MARK}`;
    });
  };

  // Display first: `$$…$$` would otherwise be read as two empty inline spans.
  return { text: take(INLINE_RE, false, take(DISPLAY_RE, true, source)), math };
}

/** Put the rendered equations back into the HTML `marked` produced. */
export function restoreMath(html: string, math: Stashed["math"]): string {
  return html.replace(new RegExp(`${MARK}(\\d+)${MARK}`, "g"), (whole, index: string) => {
    const entry = math[Number(index)];
    if (entry === undefined) return whole;
    return katex.renderToString(entry.tex, {
      displayMode: entry.display,
      throwOnError: false, // a broken equation shows its own source rather than taking the page
      output: "html",
    });
  });
}

/**
 * Where a document's links and images go (PROJECT.md §10.2). A chat message has none of this: its
 * links are left as written, which is why chat renders through the shared `marked` and a document
 * through an instance of its own.
 */
export interface LinkRules {
  /** The address a link should have, or null to leave it as written. */
  href: (target: string) => string | null;
  /** An image either shows inline from `src`, or becomes a download link to `download`. */
  image: (target: string) => { src: string } | { download: string } | null;
}

const escapeAttr = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/**
 * A `marked` whose links and images follow `rules`. Returning `false` hands a token back to marked's
 * own renderer, which does the escaping; only the download link, which marked has no form for, is
 * written here.
 */
function documentMarked(rules: LinkRules): Marked {
  return new Marked({
    gfm: true,
    breaks: false,
    renderer: {
      link(token) {
        const to = rules.href(token.href);
        if (to !== null) token.href = to;
        return false;
      },
      image(token) {
        const where = rules.image(token.href);
        if (where === null) return false;
        if ("src" in where) {
          token.href = where.src;
          return false;
        }
        const name = token.text || token.href.split("/").pop() || "file";
        return `<a href="${escapeAttr(where.download)}">${escapeAttr(name)} (download)</a>`;
      },
    },
  });
}

/** Markdown and math, rendered but NOT sanitized. Never put this in a page; see `renderMarkdown`. */
export function renderUnsafe(source: string, rules?: LinkRules): string {
  const { text, math } = stashMath(source);
  const html = rules
    ? (documentMarked(rules).parse(text, { async: false }) as string)
    : (marked.parse(text, { async: false, gfm: true, breaks: false }) as string);
  return restoreMath(html, math);
}

/** `renderUnsafe`, sanitized. Requires a DOM; call it in the browser only. */
export function renderMarkdown(source: string, rules?: LinkRules): string {
  return DOMPurify.sanitize(renderUnsafe(source, rules), {
    // KaTeX emits MathML alongside its HTML; these two are the tags DOMPurify's MathML profile
    // does not carry by default.
    ADD_TAGS: ["semantics", "annotation"],
  });
}
