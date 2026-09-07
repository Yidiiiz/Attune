// Owns: turning stored markdown into rendered HTML — PROJECT.md Decision 31's pipeline, whole:
// `marked` for the markdown, a KaTeX pre-pass for the math, `dompurify` before any of it reaches
// the page. Chat messages render through here once they are `complete` (§16.3); Phase 8's document
// view renders the same way, which is why the component is `components/markdown/` and not
// `components/chat/`.
//
// **The math is stashed behind NUL placeholders before `marked` runs.** That order is the whole
// trick and it cannot be retrofitted: `$P^{-1}AP$` contains `_`, `^` and `{}`, which a markdown
// parser is entitled to read as emphasis, and once it has done so the TeX is gone. So the math
// spans come out first, `marked` sees placeholders it cannot mangle, and KaTeX renders into the
// gaps afterwards. Code spans are stashed the same way and for the same reason — `$` inside a code
// fence is a dollar sign, not the start of an equation.
//
// **Sanitizing is not optional here.** The text arrives from a model, which can be steered by a
// file it was asked to read, and from files on disk that anything may have written. `marked` passes
// raw HTML through by default, so without this step a note containing a `<script>` tag would be one.
//
// Rendering happens after mount rather than during the server pass. DOMPurify needs a DOM, and the
// alternative — a second sanitizer for the server, or a jsdom dependency — buys a first paint of
// rendered markdown at a real cost. The gap is not visible in practice, and it is the same shape as
// §16.3's own rule: plain text first, markdown once it is settled.
//
// Failure behavior: never blank, and never unsanitized. A markdown parse that throws falls back to
// the plain text, an equation KaTeX rejects renders as its own source in red (`throwOnError: false`),
// and if the sanitizer is somehow unavailable the component stays on the plain-text branch rather
// than injecting anything.

"use client";

import { useEffect, useMemo, useState } from "react";
import { renderMarkdown } from "./pipeline.ts";
import "katex/dist/katex.min.css";
import styles from "./Markdown.module.css";

export interface MarkdownProps {
  text: string;
  /** Extra class for the wrapper, so a caller can size and space it. */
  className?: string;
}

export default function Markdown({ text, className }: MarkdownProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const html = useMemo(() => {
    if (!mounted) return null;
    try {
      return renderMarkdown(text);
    } catch {
      return null; // a parse failure falls back to the text, which is still readable
    }
  }, [mounted, text]);

  const classes = [styles.markdown, className].filter(Boolean).join(" ");

  if (html === null) return <div className={classes}>{text}</div>;
  return <div className={classes} dangerouslySetInnerHTML={{ __html: html }} />;
}
