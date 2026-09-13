// Owns: one conversation on screen — the active path, the composer under it, and everything a
// message row can be asked to do: retry, discard, delete, edit, regenerate, branch, and switch.
//
// What it renders is `activePath(buildTree(messages), activeLeafId)` and nothing else (§16.2),
// with §16.5's sidebar beside it and §10.2's header above it. It holds the three elements the
// sidebar has to measure — the pane, the message scroller and the sidebar's own list — as state
// rather than as refs, because the hook that measures them has to re-run when each one arrives and
// a mutated ref re-renders nothing.
//
// **The three sibling-creating actions are one call with three parents** (§16.2), and that is the
// whole of branching:
//
//   - **Edit** hangs a new prompt from the edited one's *parent*, so the two versions are siblings
//     and the original is untouched — a message that was said is a fact, and a fact is not edited.
//   - **Regenerate** (which is what Retry is) hangs a new reply from the original reply's parent.
//   - **Branch from here** hangs a new prompt from *this* message, forking the tail rather than
//     replacing the head.
//
// The reasoning for reading the third as a distinct operation, and for offering Edit on prompts
// and Branch on replies, is PROJECT.md Decision 68 — where an argument about what the spec means
// belongs, rather than in a component header.
//
// Failure behavior: every write here goes through an API route and then re-reads, so nothing on
// screen is a local guess. §13.5's split is applied in `useConversation` — a key error toasts, a
// refusal lands inline above the composer with the text still in the box. A delete refused for
// having replies under it (§16.2) toasts, because a row menu has no on-screen origin of its own.

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { activePath, buildPairs, buildTree, siblingsOf } from "@/lib/chat/tree";
import { groupAnnotations } from "@/lib/chat/annotations";
import { paneLayout } from "@/lib/chat/pane-layout";
import { parseQuoteReply } from "@/lib/chat/quotes";
import { reportFailure, send as post } from "@/components/tasks/writes";
import { announceApplied } from "@/components/composer/autoApplied";
import ProposalPanel from "@/components/composer/ProposalPanel";
import { useProposals } from "@/components/composer/useProposals";
import AppliedMarker from "./AppliedMarker";
import MessageRow from "./MessageRow";
import ChatComposer from "./ChatComposer";
import ConversationHeader from "./ConversationHeader";
import ContextView from "./ContextView";
import FeatureBoundary from "./FeatureBoundary";
import Sidebar from "./Sidebar";
import AnnotationPane from "./AnnotationPane";
import QuoteReply from "./QuoteReply";
import { useAnnotationDraft } from "./useAnnotationDraft";
import { scrollMessageIntoView, useSidebar } from "./useSidebar";
import { useConversation } from "./useConversation";
import { useDistill } from "./useDistill";
import type { ModelChoice } from "./ConversationHeader";
import type { ConversationState } from "./useConversation";
import type { Message } from "@/lib/chat/types";
import styles from "./Chat.module.css";

export interface ChatViewProps {
  initial: ConversationState;
  /** The registry's models, read on the server — see `ConversationHeader` for why not imported. */
  models: ModelChoice[];
  /** True while `ATTUNE_FAKE_PROVIDER` is answering, so the page says so rather than looking odd. */
  scripted: boolean;
  /** From settings, for the category select on a proposed task's card. */
  categories: string[];
  /** Opened by the Chats menu's "Distill to knowledge" (`?distill=1`). */
  distill: boolean;
}

export default function ChatView({ initial, models, scripted, categories, distill }: ChatViewProps) {
  const router = useRouter();
  const id = initial.conversation.id;
  // §9.5's tray and §6.3's toast: where a turn's proposals and its auto-applied write go. The toast's
  // Undo re-reads, and the marker leaves with the batch because the log says it is undone.
  const tray = useProposals({ source: `chat:${id}` });
  const { state, streamingId, error, setError, send, stop, reload, switchTo, setModel } =
    useConversation(initial, {
      onProposal: tray.receive,
      onApplied: announceApplied,
    });
  const distilling = useDistill(id, distill, tray);
  const bottom = useRef<HTMLDivElement | null>(null);

  // Callback refs rather than `useRef`: the sidebar hook needs to *re-run* when an element arrives,
  // and a ref object mutating does not re-render anything.
  const [pane, setPane] = useState<HTMLElement | null>(null);
  const [scroller, setScroller] = useState<HTMLElement | null>(null);
  const [list, setList] = useState<HTMLElement | null>(null);
  const [contextOpen, setContextOpen] = useState(false);

  const tree = useMemo(() => buildTree(state.messages), [state.messages]);
  const path = useMemo(
    () => activePath(tree, state.conversation.activeLeafId),
    [tree, state.conversation.activeLeafId],
  );
  const pairs = useMemo(() => buildPairs(path), [path]);

  const groups = useMemo(
    () => groupAnnotations(state.annotations, tree, path.map((message) => message.id)),
    [state.annotations, tree, path],
  );

  // §16.6: the feature costs nothing when unused, so it is not mounted at all unless some message
  // on the path opens with a blockquote. The scan below is one regex per message; `findQuoteSource`,
  // which builds a dense index per candidate, runs only for the rows that get a bar.
  const hasQuoteReplies = useMemo(
    () => path.some((message) => parseQuoteReply(message.text) !== null),
    [path],
  );

  // A gutter is asked for only when there is something to put in it — otherwise it would take width
  // from the message column to draw nothing, and §16.4's hidden count would be counting zero. The
  // trays count as something: removing the last card must not unmount the tray that holds it, or
  // §16.4's soft delete becomes a delete with extra steps.
  const hasNotes =
    groups.onPath.length > 0 || groups.removed.length > 0 || groups.unanchored.length > 0;

  // The hook measures; the cascade is run once, here, with the only `wantGutter` there is — so the
  // sidebar and the gutter can never disagree about how the width was divided. `roomForGutter` asks
  // the counterfactual, because the composer needs somewhere to open before the first note exists.
  const { current, available } = useSidebar({ scroller, pane, list, pairs });
  const roomForGutter = paneLayout({ available, wantGutter: true, collapsed: false }).gutter > 0;
  const { draft, clear: clearDraft, annotate } = useAnnotationDraft(scroller, roomForGutter);
  const layout = paneLayout({
    available,
    wantGutter: hasNotes || draft !== null,
    collapsed: false,
  });

  // §16.0 rule 6: no virtualization, `scrollIntoView` for navigation. The newest message is what
  // someone wants to see, and it moves while a reply streams.
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [path.length, streamingId, state.messages]);

  /** Retry = regenerate: a new assistant sibling under the failed one's own parent (§16.2). */
  const retry = (message: Message): void => {
    void send("", { parentId: message.parentId, withoutPrompt: true });
  };

  /** Edit and resend: a user sibling of the edited prompt, then a reply under it. */
  const edit = (message: Message, text: string): Promise<string | null> =>
    send(text, { parentId: message.parentId });

  /** Branch from here: a new prompt parented at this message, forking everything after it. */
  const branch = (message: Message, text: string): Promise<string | null> =>
    send(text, { parentId: message.id });

  const remove = async (message: Message): Promise<void> => {
    const answer = await post(`/api/chats/${state.conversation.id}/messages/${message.id}`, {
      method: "DELETE",
    });
    if (answer.error !== null) {
      // A refusal here has no on-screen origin of its own — it came from a row control — so §13.5
      // sends it to a toast naming what did not happen.
      reportFailure("The message was not deleted", answer.error);
      return;
    }
    await reload(state.conversation.id);
    router.refresh(); // the panel's list shows the conversation's own timestamp
  };

  // Decision 66: an annotation that exists and is not drawn must still say so. When the cascade
  // leaves no room for a gutter, the notes that would have been in it are counted in the header —
  // with a remedy the reader controls, which is why the title says to widen or collapse.
  const hiddenCount = layout.gutter === 0 ? groups.onPath.length : 0;

  return (
    <div className={styles.pane} ref={setPane}>
      <section
        className={styles.view}
        data-ui="conversation"
        data-conversation={state.conversation.id}
      >
        <ConversationHeader
          models={models}
          title={state.conversation.title}
          model={state.conversation.model}
          scripted={scripted}
          contextOpen={contextOpen}
          onToggleContext={() => setContextOpen((open) => !open)}
          onModelChange={(model) => void setModel(model)}
          offPath={groups.offPath.length}
          hidden={hiddenCount}
          onShowOffPath={() => {
            const first = groups.offPath[0];
            if (first !== undefined) void switchTo(first.targetMessageId);
          }}
        />

        {contextOpen ? (
          <FeatureBoundary feature="The context view">
            <ContextView
              openFile={state.conversation.context.file ?? null}
              taskIds={state.conversation.context.taskIds}
            />
          </FeatureBoundary>
        ) : null}

        <div className={styles.messages} data-ui="messages" ref={setScroller}>
          {path.length === 0 ? (
            <p className={styles.empty}>Nothing said yet. What are you working on?</p>
          ) : (
            path.map((message, index) => (
              <MessageRow
                key={message.id}
                message={message}
                {...(hasQuoteReplies
                  ? {
                      quoteBar: (
                        <QuoteReply
                          message={message}
                          path={path}
                          index={index}
                          onGoTo={(id) => scrollMessageIntoView(scroller, id)}
                        />
                      ),
                    }
                  : {})}
                {...(message.status === "complete" ? { onAnnotate: annotate } : {})}
                streaming={message.id === streamingId}
                siblings={siblingsOf(tree, message.id)}
                onSwitch={(id) => void switchTo(id)}
                onDelete={(m: Message) => void remove(m)}
                {...(message.role === "user" ? { onEdit: edit } : { onRetry: retry })}
                {...(message.role === "assistant" && message.status === "complete"
                  ? { onBranch: branch }
                  : {})}
                applied={state.applied
                  .filter((one) => one.message === message.id)
                  .map((one) => (
                    <AppliedMarker key={one.batch} applied={one} onUndone={() => void reload(id)} />
                  ))}
              />
            ))
          )}
          <div ref={bottom} />
        </div>

        <ChatComposer
          onSend={(text, attachments) => send(text, { attachments })}
          onStop={stop}
          streaming={streamingId !== null}
          error={error}
          onDismissError={() => setError(null)}
          onError={setError}
          tray={<ProposalPanel tray={tray} categories={categories} status={distilling} />}
        />
      </section>

      {/* §16.4, in its own boundary for the same reason the sidebar has one: annotation placement
          reads geometry, and geometry is where a throw comes from. */}
      {layout.gutter > 0 ? (
        <FeatureBoundary feature="Annotations">
          <AnnotationPane
            conversationId={state.conversation.id}
            groups={groups}
            scroller={scroller}
            width={layout.gutter}
            // The two things that move a rectangle: the conversation re-rendered, or the column
            // changed width. Deltas live in `messages`, so a streaming reply re-places the cards
            // below it as it grows.
            revision={state.messages.length + layout.gutter}
            draft={draft}
            onDraftDone={clearDraft}
            reload={reload}
          />
        </FeatureBoundary>
      ) : null}

      {/* §16.7: its own boundary, so a sidebar that throws costs the sidebar and hands its width
          back to the message column rather than taking the conversation down with it. */}
      <FeatureBoundary feature="The sidebar">
        <nav
          className={layout.strip ? styles.sideStrip : styles.side}
          style={{ width: layout.sidebar }}
          data-ui="sidebar"
          data-mode={layout.strip ? "strip" : "full"}
          aria-label="Conversation outline"
          ref={setList}
        >
          <Sidebar
            pairs={pairs}
            tree={tree}
            current={current}
            strip={layout.strip}
            onGoTo={(id) => scrollMessageIntoView(scroller, id)}
            onSwitch={(id) => void switchTo(id)}
          />
        </nav>
      </FeatureBoundary>
    </div>
  );
}
