// Owns: PROJECT.md §16.6's clickable bar on a quote reply — the strip above a message that says
// what it is answering and takes you there.
//
// **The whole feature unmounts when the path has no quote replies**, which §16.6 asks for outright.
// That is not a micro-optimisation: `findQuoteSource` scans backwards through the path building a
// dense index per candidate, and the overwhelming majority of conversations have no quote replies
// at all. A feature that costs nothing when unused is one nobody has to think about.
//
// The recomputation rule is §16.6's too — only when the path signature changes — and the signature
// is the caller's to supply, because the caller is the one that knows what a render meant.
//
// Failure behavior: a quotation whose source cannot be placed renders nothing here, and the
// blockquote below is an ordinary blockquote, which is what it looks like anyway. Mounted inside
// `FeatureBoundary` with the rest of the chat features (§16.7).

"use client";

import { findQuoteSource, parseQuoteReply } from "@/lib/chat/quotes";
import type { Message } from "@/lib/chat/types";
import styles from "./Annotations.module.css";

export interface QuoteReplyProps {
  message: Message;
  /** The active path, so the source can be looked for in the messages before this one. */
  path: Message[];
  index: number;
  onGoTo: (messageId: string) => void;
}

/** One line of the source, enough to recognise it by. */
function preview(text: string): string {
  const line = text.trim().split("\n").find((l) => l.trim().length > 0) ?? "";
  return line.length > 90 ? `${line.slice(0, 90)}…` : line;
}

export default function QuoteReply({ message, path, index, onGoTo }: QuoteReplyProps) {
  const quote = parseQuoteReply(message.text);
  if (quote === null) return null;

  const source = findQuoteSource(path, index, quote);
  if (source === null) return null;

  return (
    <button
      type="button"
      className={styles.quoteBar}
      data-ui="quote-bar"
      data-quote-source={source.id}
      title={preview(source.text)}
      onClick={() => onGoTo(source.id)}
    >
      <span className={styles.quoteBarLabel}>replying to</span>
      <span className={styles.quoteBarText}>{preview(quote)}</span>
    </button>
  );
}
