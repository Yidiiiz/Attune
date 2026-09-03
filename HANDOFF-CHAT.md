# HANDOFF-CHAT.md

Extraction of the reusable ideas in the **Prompty** browser extension (a claude.ai
augmentation layer) for reuse in an unrelated, local-first Next.js + TypeScript task
manager whose state is markdown files in a git repo, and whose chat tab owns its own
message pipeline end to end.

Written for a reader with **no** knowledge of this codebase. Every factual claim cites
`file:line`. Components are tagged:

- **`PORTABLE`** — transfers essentially as-is.
- **`ADAPT`** — the idea transfers, the implementation does not.
- **`DISCARD`** — solves a problem the new app does not have, or was a mistake.

Verbatim code appears **only** for `PORTABLE` items.

**Redaction note:** the repo contains no API keys, tokens, or cookies (a grep for
`chrome.*` returns only `chrome.storage`, and `src/page/api.ts:5-8` documents that auth is
same-origin cookies the code never touches). Sample message UUIDs in
`claude-extension-build-prompt.md:225-350` come from throwaway test chats whose entire
content is the word "hi"; no conversation text is reproduced here.

---

## TL;DR — the 15 things worth not re-deriving

1. **The conversation is a tree of messages with `parentUuid` links, and the "current
   conversation" is a *derived* root-to-leaf path** computed by walking parents up from a
   single stored `activeLeafUuid` (`src/shared/tree.ts:143-156`). One pointer is the entire
   branch state. This is the most valuable idea in the repo.
2. **Storing `activeLeafUuid` instead of a branch list is what makes branching cheap.**
   Nothing is copied on branch creation; a branch is just a second child of an existing
   node (`src/shared/tree.ts:204-243`, `src/content/features/branch-compose.ts:132-154`).
3. **Creation order (`index`) is not path order.** Sibling ordering and "latest leaf" picks
   use `index`; the path never does (`src/shared/tree.ts:29`, `:117-120`, `:179-196`).
4. **Edit, branch, and regenerate are all one operation:** create a new child of an
   existing parent, then move the leaf pointer. There is no separate "edit" or "branch"
   verb anywhere in this codebase (`docs/recon-report.md:45-50`).
5. **Anchoring notes by exact `indexOf` of a selection quote never works.** A DOM
   selection's `toString()` inserts newlines at every block boundary that the underlying
   text nodes do not contain. The fix — a *dense projection* (drop whitespace, optionally
   markdown syntax) plus a `map[]` back to source offsets — is ~50 lines and is the second
   most valuable thing here (`src/shared/text-match.ts:1-80`).
6. **Anchors are quote + 20-char prefix + 20-char suffix + charOffset, scored, not
   matched.** Prefix and suffix each add 2 points; charOffset distance is a fractional
   tiebreaker (`src/content/features/anchoring.ts:101-127`). Never a bare index.
7. **Annotation durability was solved only partially, and the gaps are visible in the UI:**
   quote not found → card pins to message top flagged "anchor moved"; anchor message absent
   from the tree → an "Unanchored notes" drawer; anchor message present but off the active
   branch → the card **silently disappears** with no indication
   (`src/content/features/note-cards.ts:711-744`).
8. **A failed send leaves phantom nodes in the model.** `send-observed` is emitted *before*
   the request is forwarded, and the optimistic nodes are never rolled back on failure
   (`src/page/fetch-patch.ts:207-221`, `src/content/index.ts:119-138`, `:156-158`).
9. **Streaming finality is inconsistent between two code paths.** The main chat path posts
   `stream-done` even when the SSE parser reports `ok: false` (interrupted stream), storing
   a partial reply as if complete (`src/page/fetch-patch.ts:225-240`); the note path checks
   `ok` and reports failure (`src/page/api.ts:191-200`). Pick one contract.
10. **There is no schema version and no migration path anywhere.** Zero occurrences of
    `version` or `migrat` in `src/shared/storage.ts`. Shape changes were handled by hand.
11. **Notes are stored split-brain:** anchoring metadata in extension storage, note
    *content* inside the host's conversation data (`docs/architecture.md:121-126`). Forced
    by the platform, and exactly the design you should not copy.
12. **The panel never virtualizes.** It rebuilds `innerHTML` wholesale, guarded by a JSON
    render signature plus a summary memo (`src/content/features/tree-panel.ts:582-602`,
    `:530-539`). No measurement of where that breaks exists in the repo.
13. **Scroll-to-message went through three full rewrites** (absolute rect target → layout
    `offsetTop` chain → per-frame *relative* delta) before it worked
    (`CHANGELOG.md:264-283`, `:222-240`; final form
    `src/content/features/tree-panel.ts:865-972`). Relative-delta stepping is the answer if
    your list virtualizes.
14. **Soft delete beat hard delete in daily use.** Deleting an annotation sets
    `deleted: true`; it reappears in a quiet bottom tray, restorable in one click
    (`src/content/features/note-cards.ts:557-579`, `src/shared/storage.ts:32-33`).
15. **There is not one `TODO`, `FIXME`, `HACK`, or `XXX` in the entire repo.** All the
    hard-won knowledge lives in module header comments and the CHANGELOG instead — which is
    why Part H is reconstructed from those and from git history, not from code markers.

---

## Part A — Project map

### What it does (from the code)

Prompty is a Chrome MV3 extension that runs on `https://claude.ai/*` and rebuilds a model
of the current conversation **entirely from the site's own network traffic**, never from
the DOM (`src/shared/tree.ts:1-20`, `docs/architecture.md:95-98`). A `MAIN`-world script
patches `window.fetch` at `document_start` to observe conversation-tree loads, outgoing
completion sends, retries, branch switches, and SSE response streams
(`src/page/fetch-patch.ts:1-23`). An `ISOLATED`-world content script consumes those events
over a `postMessage` bridge, maintains a `ConversationTree` per conversation, maps rendered
DOM rows back to message UUIDs, and renders six features on top: composing a branch from
the main composer, a left-margin conversation history panel with branch navigation,
highlight-anchored margin notes, position-anchored margin comments, quote-reply
back-references, and draft autosave. Every feature is individually toggleable from a popup
(`src/popup/popup.html:11-27`) and degrades independently with a one-time toast rather than
breaking the host page (`src/content/index.ts:260-268`).

### Stack and build

| Thing | Value | Cite |
|---|---|---|
| Language | TypeScript 5.5, `strict`, `noUncheckedIndexedAccess` | `tsconfig.json:8-9`, `package.json:15` |
| Bundler | esbuild 0.21, IIFE, target `chrome111`, no sourcemaps | `build.mjs:22-28`, `package.json:14` |
| Runtime deps | **none** — zero production dependencies | `package.json:12-16` |
| Manifest | MV3, `minimum_chrome_version: 111` | `src/manifest.json:2-6` |
| Entry bundles | 3: `page.js`, `content.js`, `popup/popup.js` | `build.mjs:30-46` |
| Icons | generated at build time by a hand-rolled PNG encoder; no binaries in the repo | `build.mjs:48-90` |

**Permissions:** exactly one — `"storage"` (`src/manifest.json:7`), genuinely used
(`src/shared/storage.ts:85-109`). There are **no** `host_permissions`, no `activeTab`, no
`scripting`, no background service worker, and no `commands` block. Nothing requested is
unused. Site access comes from the two `content_scripts` match patterns
(`src/manifest.json:8-21`).

### Directory tree

```
src/
├─ manifest.json           MV3; two content scripts (MAIN + ISOLATED), popup action
├─ page/                   MAIN world, document_start — network truth
│  ├─ index.ts             entry: install patches, handle content-script commands
│  ├─ fetch-patch.ts       window.fetch interception; parent_message_uuid rewrite;
│  │                       SSE teeing; org/model/send-template capture
│  ├─ sse.ts               SSE parser (text_delta / stop_reason / message_stop)
│  ├─ api.ts               extension-originated requests via the SAVED original fetch
│  ├─ history-patch.ts     pushState/replaceState/popstate → url-changed
│  └─ bridge.ts            postMessage sender/receiver (page side)
├─ content/                ISOLATED world, document_idle — model + UI
│  ├─ index.ts             ConversationTree registry, navigation, feature lifecycle
│  ├─ bridge.ts            postMessage sender/receiver (content side)
│  ├─ ctx.ts               typed EventBus contract + Feature interface
│  ├─ observer.ts          THE single rAF-batched MutationObserver
│  ├─ dom-map.ts           DOM rows ⇄ active-path UUIDs (the hardest ADAPT in the repo)
│  ├─ branch-switch.ts     BranchSwitchAdapter: native-arrow stepping; leaf-PUT fallback
│  ├─ composer.ts          host composer read/write/dock/file-reattach helpers
│  ├─ styles.ts            pt-* classes applied to host DOM (ghost/hide/pulse/highlight)
│  ├─ toast.ts             one-per-id degradation toasts (shadow DOM)
│  └─ features/
│     ├─ branch-compose.ts    F1: hover button, ghost/hide, header bar, override arm
│     ├─ tree-panel.ts        F2: the history sidebar (986 lines, ~240 of them CSS)
│     ├─ note-cards.ts        F3+F4 shared: gutter, cards, composer, submit, modal
│     ├─ notes.ts             F3 entry: selection → ✎ button → quote anchor
│     ├─ comments.ts          F4 entry: hover → + button → caret/ratio anchor
│     ├─ replies.ts           F6: quote-reply refs (bar, popover, jump-to-source)
│     ├─ anchoring.ts         text indexing + quote/prefix/suffix/offset resolution
│     └─ drafts.ts            F5: capture, restore banner, mode re-entry, lazy expiry
├─ shared/                 world-agnostic building blocks
│  ├─ tree.ts              ConversationTree — THE data model
│  ├─ text-match.ts        dense whitespace/markdown-insensitive matching
│  ├─ messages.ts          bridge protocol types + envelope + root sentinel
│  ├─ storage.ts           chrome.storage records + IndexedDB draft attachments
│  ├─ note-protocol.ts     the !@#%NOTE!@ wire format (build/parse/recognize)
│  ├─ markdown.ts          small safe renderer (incl. a LaTeX→Unicode approximation)
│  ├─ selectors.ts         THE selector registry + validateSelectors()
│  ├─ tokens.ts            host design-token CSS var helpers + z-index policy
│  ├─ summary.ts           swappable Summarizer (v1: markdown-strip + truncate)
│  ├─ util.ts              debounce, rafThrottle, waitUntil, EventBus, escapeHtml, clamp
│  └─ uuid.ts              UUIDv7 generator
└─ popup/                  settings popup (per-feature toggles, live via storage.onChanged)
```

### Entry points and flow

There is **no background page and no service worker.** Three tiers only:

1. **`page.js`** (MAIN world, `document_start`) — `src/page/index.ts:19-49` installs the
   fetch patch and history patch before the host app boots, then listens for commands.
2. **`content.js`** (ISOLATED world, `document_idle`) — `src/content/index.ts:41-67` builds
   the shared `Ctx`; `:109-187` consumes page events into the tree registry.
3. **`popup.js`** — reads/writes `chrome.storage.local` only (`src/popup/popup.ts:11-26`);
   the content script picks changes up live via `chrome.storage.onChanged`
   (`src/shared/storage.ts:121-130`).

Numbered sequence for one user send:

1. Host app calls `fetch(POST …/completion)`.
2. The patched wrapper classifies the URL (`src/page/fetch-patch.ts:302-336`).
3. `handleCompletion` reads the JSON body without disturbing the request (`:113-123`),
   optionally rewrites `parent_message_uuid` (`:180-201`), caches the payload as a send
   template (`:204`), and **posts `send-observed` to the content script before forwarding**
   (`:207-216`).
4. The request is forwarded, the response `clone()`d, and its SSE body teed into
   `parseSseStream`, which emits `stream-delta` per token and `stream-done` at the end
   (`:225-241`).
5. The content script applies the send to the in-memory tree optimistically
   (`src/content/index.ts:119-138`), accumulates stream text (`:139-146`), finalizes on
   `stream-done` (`:147-155`), and emits `tree-updated` on the typed bus (`:71-76`).
6. Features re-render off the bus; the single rAF-batched `MutationObserver` tick rebuilds
   the DOM↔UUID map and re-lays out anything geometric (`src/content/observer.ts:45-61`,
   `src/content/index.ts:212-238`).

### Size

Total `src/` = **7,577 lines** (7,413 TS + 164 lines of HTML/CSS/JSON), plus `build.mjs`
(168) and ~1,500 lines of documentation.

| Subsystem | LOC | Note |
|---|---|---|
| `content/features/` | 3,906 | 52% of the codebase; `note-cards.ts` (1,239) and `tree-panel.ts` (986) alone are 29% |
| `content/` (non-feature) | 1,296 | `index.ts` 315, `dom-map.ts` 265 dominate |
| `shared/` | 1,439 | the portable half: `tree.ts` 256, `storage.ts` 242, `markdown.ts` 237 |
| `page/` (interception) | 744 | `fetch-patch.ts` 337, `api.ts` 201 |
| `popup/` | 28 (+129 html/css) | |

**Where the weight actually sits:** roughly 545 lines of the two biggest feature files are
CSS-in-TS template literals (`src/content/features/note-cards.ts:993-1239` ≈ 247 lines;
`src/content/features/tree-panel.ts:61-302` ≈ 242 lines;
`src/content/features/replies.ts:440-496` ≈ 57 lines). About 7% of the entire codebase is
stylesheet text whose only purpose is looking native inside someone else's page. All
`DISCARD` for you.

### Current state

**Works** (per `CHANGELOG.md:5-63` for 0.12.2 and the module headers): all six features,
branch switching without reload, in-thread notes with follow-up threads, soft delete and
restore, quote-reply references, draft autosave including branch/note/comment modes and
≤5 MB attachments.

**Half-built / knowingly limited:**
- Retry (assistant regeneration) does not stream into the panel; it resyncs by refetching
  the whole tree after the stream ends, because retry payloads carry no pre-generated
  UUIDs (`src/page/fetch-patch.ts:244-257`, `README.md:141-143`).
- Notes created before v0.5.0 are real branches and still show in the host's native version
  counters; there is no migration (`README.md:135-140`, `CHANGELOG.md:425-428`).
- Draft attachment capture is additive-only: files removed from the composer after being
  seen are still offered on restore (`src/content/features/drafts.ts:25-28`).

**Stubbed:** `Summarizer` is a deliberate seam with only a local implementation — the
interface exists so an LLM summarizer could be swapped in, and never was
(`src/shared/summary.ts:10-13`, `:46-51`).

---

## Part B — Prompt interception

Almost all `ADAPT`/`DISCARD` for you, as expected. Two things in here are `PORTABLE` and
worth real attention: the **record shape** and the **normalization/ID/ordering rules**.

### Where interception happens and what triggers it — `DISCARD`

Purely the **network layer**: `window.fetch` is monkey-patched in the page's MAIN world at
`document_start` so the patch is installed before the host app boots
(`src/page/fetch-patch.ts:302-336`, `src/manifest.json:8-14`). Five URL regexes classify
requests: org capture, tree GET, completion POST, retry POST, leaf PUT
(`src/page/fetch-patch.ts:31-38`). `XMLHttpRequest` is deliberately not patched because
reconnaissance confirmed all relevant traffic uses `fetch` (`:16-18`). SPA navigation is
detected by patching `history.pushState`/`replaceState` plus `popstate`
(`src/page/history-patch.ts:14-37`). The DOM is used only as a render target and for
geometry, never as a data source (`docs/architecture.md:95-98`).

`DISCARD` in full: in the new app you *are* the pipeline.

### What is captured, exactly — `PORTABLE` (as a record-shape reference)

**Outgoing send payload** as observed on the wire
(`claude-extension-build-prompt.md:281-300`, summarized in `docs/recon-report.md:43-72`):

| Field | Type | Purpose |
|---|---|---|
| `prompt` | `string` | the user's message text |
| `parent_message_uuid` | `string` | top-level; the *only* field branch-compose rewrites |
| `turn_message_uuids` | `{ human_message_uuid: string; assistant_message_uuid: string }` | **client-generated UUIDv7s the server adopts verbatim** |
| `model` | `string` | model id |
| `timezone`, `locale` | `string` | client context |
| `effort`, `thinking_mode` | `string` | sampling controls |
| `tools[]` | array | tool/widget definitions, passed through untouched |
| `attachments[]` | array | *text* files inline: `{ file_name, file_type, file_size, extracted_content, origin, kind }` |
| `files[]` | `string[]` | binary upload ids returned by a separate upload endpoint |
| `sync_sources[]` | array | passed through |
| `rendering_mode` | `"messages"` | passed through |
| `create_conversation_params` | object | **present only on the first send of a new chat** — there is no separate "create conversation" call (`claude-extension-build-prompt.md:308-330`) |

**The single most important field-level lesson:** `turn_message_uuids` are generated by the
*client* and adopted by the server (`docs/recon-report.md:51-56`). That is what lets the
extension write anchoring metadata the instant a note is sent, before any response arrives
(`src/page/api.ts:158-165`). **Do the same in your app: mint the message id client-side (or
at the top of the server action) and return it before the model call resolves.** Everything
downstream — optimistic UI, annotation anchoring, draft correlation — depends on knowing
the id early.

**Persisted message shape** as returned by the tree endpoint
(`claude-extension-build-prompt.md:232-252`, `docs/recon-report.md:24-41`):

```
{ uuid, text: "", content: [{ type: "text", text: "…", citations: [] }],
  sender: "human" | "assistant", index: number, created_at, stop_reason?,
  attachments: [], files: [], parent_message_uuid }
```

Two traps encoded in the code: the **top-level `text` is empty** — real text lives in
`content[]` blocks of `type === "text"` (`src/shared/tree.ts:36-39`, `:50-62`) — and
`index` is **global creation order across all branches, not position within a branch**
(`src/shared/tree.ts:29`, `docs/recon-report.md:31-35`).

**Response capture shape** (`src/shared/messages.ts:44-52`):

```ts
| { type: "stream-delta"; conversationUuid: string; assistantUuid: string | null; text: string }
| { type: "stream-done"; conversationUuid: string; assistantUuid: string | null;
    text: string; stopReason: string | null }
```

### What was done with the capture — `PORTABLE`, in detail

This is the part you asked to have in full, because it is what turns a raw stream into a
stable record.

**Normalization.** Text is the concatenation of `type === "text"` content blocks, with a
fallback to the legacy top-level field. Verbatim:

```ts
interface RawMessage {
  uuid?: unknown;
  parent_message_uuid?: unknown;
  sender?: unknown;
  index?: unknown;
  created_at?: unknown;
  text?: unknown;
  content?: unknown;
}

/** Concatenate the text blocks of a raw message's content array. */
export function extractText(raw: RawMessage): string {
  if (Array.isArray(raw.content)) {
    const parts: string[] = [];
    for (const block of raw.content) {
      if (block && typeof block === "object" && (block as { type?: unknown }).type === "text") {
        const t = (block as { text?: unknown }).text;
        if (typeof t === "string") parts.push(t);
      }
    }
    if (parts.length) return parts.join("\n");
  }
  return typeof raw.text === "string" ? raw.text : "";
}
```
(`src/shared/tree.ts:39-62`.) Note the defensive typing: every field is `unknown` and
narrowed. A malformed payload yields an empty tree and a console warning, never wrong data
(`src/shared/tree.ts:83-86`, `:18-19`).

**ID assignment.** Client-minted UUIDv7 so ids are time-sortable and the same shape as the
server's (`src/shared/uuid.ts:1-27`). This matters for you specifically: **time-ordered ids
sort correctly as filenames**, so `019f3e54-….md` in a directory listing is in creation
order for free. Verbatim:

```ts
export function uuidv7(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const ts = Date.now();
  // 48-bit big-endian millisecond timestamp
  bytes[0] = (ts / 2 ** 40) & 0xff;
  bytes[1] = (ts / 2 ** 32) & 0xff;
  bytes[2] = (ts / 2 ** 24) & 0xff;
  bytes[3] = (ts / 2 ** 16) & 0xff;
  bytes[4] = (ts / 2 ** 8) & 0xff;
  bytes[5] = ts & 0xff;
  bytes[6] = (bytes[6]! & 0x0f) | 0x70; // version 7
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // variant 10xx
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
```

**Ordering.** Two different orders, never confused:
- *Structural* order = walk `parentUuid` links (`src/shared/tree.ts:143-156`).
- *Sibling display* order = ascending `index` (creation order)
  (`src/shared/tree.ts:117-120`, `:139-140`).

**Dedupe.** By uuid, idempotently: `applySend` only inserts a node when
`!this.nodes.has(uuid)` (`src/shared/tree.ts:215`, `:228`), so replaying the same observed
send is a no-op. `nodes` is a `Map<string, TreeNode>`, so a full tree reload naturally
collapses duplicates (`src/shared/tree.ts:89-103`).

**Association with a conversation.** Trees are keyed by conversation uuid in a registry
(`src/content/index.ts:44`), and the current conversation is parsed out of the URL
(`src/content/index.ts:34-39`). Every inbound event carries `conversationUuid` and is
routed to the matching tree; events for other conversations update the model but skip the
re-render (`src/content/index.ts:116`, `:136`, `:144`).

### Streaming: when does a message become final — `ADAPT`

The SSE parser accumulates `content_block_delta` events whose `delta.type === "text_delta"`,
records `stop_reason` from `message_delta`, and notes `message_stop`
(`src/page/sse.ts:38-63`). Its result contract is `PORTABLE` reasoning even though the
transport is not:

```ts
export interface SseResult {
  text: string;
  stopReason: string | null;
  /** false when the stream errored/aborted before message_stop */
  ok: boolean;
}
```
(`src/page/sse.ts:18-23`.) Finality is `ok: sawStop || text.length > 0`
(`src/page/sse.ts:78`) — i.e. "we saw the terminator, or we at least got something". On a
thrown read error it returns whatever accumulated with `ok: false` (`:79-82`).

**A partial message is stored as if complete on the main path.** `handleCompletion` calls
`postToContent({ type: "stream-done", … })` from the `.then()` without ever inspecting
`result.ok` (`src/page/fetch-patch.ts:229-237`), and the content script's handler sets
`pending = false` unconditionally (`src/content/index.ts:147-155`,
`src/shared/tree.ts:245-251`). So an interrupted stream leaves a truncated assistant
message marked finished, with `stopReason: null` as the only hint. The note path does the
opposite and reports a failure (`src/page/api.ts:191-200`). **This inconsistency is a bug,
and the note path is the correct one.** Decide your finality contract once and enforce it in
one place.

The `pending` flag itself is `PORTABLE`: `TreeNode.pending` marks "assistant reply still
streaming for a locally-applied send" (`src/shared/tree.ts:35-36`) and is cleared by
`applyAssistantText(uuid, text, done)` (`src/shared/tree.ts:245-251`).

### Failure modes and how they were handled

| Failure | Handling | Cite |
|---|---|---|
| Unreadable request body | observe nothing, forward untouched | `src/page/fetch-patch.ts:178` |
| Any interception error | log, pass request through unmodified | `src/page/fetch-patch.ts:331-334` |
| Non-JSON "tree" response | swallow; it was not a tree after all | `src/page/fetch-patch.ts:157-159` |
| Malformed conversation JSON | empty tree + warning; render nothing rather than wrong data | `src/shared/tree.ts:83-86` |
| Duplicate observed send | uuid-keyed insert guard | `src/shared/tree.ts:215`, `:228` |
| Retry with unknown uuids | refetch the whole tree when the stream ends | `src/page/fetch-patch.ts:251-256`, `src/page/index.ts:23-27` |
| Out-of-order stream deltas | not handled — deltas are appended to a per-uuid buffer in arrival order | `src/content/index.ts:139-146` |
| **Send rejected after optimistic apply** | **not handled — phantom nodes persist** | `src/page/fetch-patch.ts:219-222`, `src/content/index.ts:156-158` |
| Tree refetch landing mid-stream | `conversation-loaded` constructs a *fresh* tree, discarding local streaming text and `pending` | `src/content/index.ts:111-118`, `src/shared/tree.ts:75-108` |

The last two are real races. The second one is `unclear why` it was tolerated — possibly it
never bit in practice because refetches are only triggered after streams complete
(`src/page/api.ts:186-189`), but nothing in the code enforces that ordering.

Detection was by console warnings with a `[prompt-tree]` prefix throughout, plus one-time
user-facing toasts (`src/content/toast.ts:95-115`, `README.md:107-110`). There are **no
automated tests in the repo** — the entire verification strategy is a 254-line manual
checklist (`docs/test-checklist.md`).

---

## Part C — Chat history sidebar

### Data model behind the list — `PORTABLE`

The list is not a message list. It is a list of **pairs**, derived on every render from the
active path:

```ts
/** A prompt and (when already answered) its response. */
interface Pair {
  prompt: TreeNode;
  response: TreeNode | null;
}

/** Pairs each prompt with its immediate response. */
private buildPairs(path: TreeNode[]): Pair[] {
  const pairs: Pair[] = [];
  for (let i = 0; i < path.length; i++) {
    const node = path[i]!;
    if (node.sender === "human" && path[i + 1]?.sender === "assistant") {
      pairs.push({ prompt: node, response: path[i + 1]! });
      i++;
    } else {
      pairs.push({ prompt: node, response: null });
    }
  }
  return pairs;
}
```
(`src/content/features/tree-panel.ts:55-59`, `:541-554`.) The input is
`tree.visiblePath()` (`:569`), i.e. the active root-to-leaf path with annotation-carrier
messages filtered out (`src/shared/tree.ts:158-161`). Nothing about the list is stored; it
is recomputed from the tree every render.

A pair whose prompt has more than one sibling is promoted to a **section header** with its
branch options nested beneath (`src/content/features/tree-panel.ts:689-723`). That is the
whole layout algorithm: flat list, except at branch points.

### Rendering approach and virtualization — `ADAPT`

No virtualization at all. `doRender` builds one HTML string and assigns `panel.innerHTML`
in one shot (`src/content/features/tree-panel.ts:608-652`). Three mitigations stand in for
virtualization:

1. **A JSON render signature.** Mode, fit, current message, branch target, drawer contents,
   expanded sets, and for every path node its uuid/sender/summary/siblings are serialized
   and compared; identical signature → return without touching the DOM
   (`src/content/features/tree-panel.ts:582-602`).
2. **A summary memo** keyed by `uuid:maxWords:textLength`, so the regex-heavy summarizer
   never runs per node per tick, and streaming (which changes `text.length`) invalidates
   only the streaming node. Cleared past 4,000 entries
   (`src/content/features/tree-panel.ts:530-539`).
3. **rAF throttling** of the render itself (`src/content/features/tree-panel.ts:340`).

**At what message count did it start to matter? Unknown — I cannot tell from the code.** No
benchmark, comment, or changelog entry names a threshold. The presence of the memo (with an
explicit "must not run per node per tick" comment at `:332-334`) proves the summarizer cost
was felt; the signature check's existence proves full re-renders were felt. Both were
apparently enough, since virtualization was never added.

### Search / filter / grouping

**None.** There is no search box, no filter, and no free-text matching over the list
anywhere in `tree-panel.ts`. The only grouping is the branch-point sectioning described
above. If you want search in the new app you are starting from zero — but you will have it
easy, because your messages are already plain text on disk.

### Navigation — `PORTABLE` rules, `ADAPT` implementation

**Click-to-scroll** is a cancellable per-frame glide, and its *rules* are the valuable part
(`src/content/features/tree-panel.ts:849-972`):

- Never compute an absolute scroll target. Each frame, re-measure the *remaining* on-screen
  gap between the target row and the container top, and move by a fraction of it (`:914-956`).
- Ease at 18% of remaining, floor 40px so the tail does not crawl, cap at half a viewport
  per frame so virtualized regions actually pass through and get a chance to mount (`:950-954`).
- If the target is not mounted, head toward whichever end of the list it lies on, decided by
  comparing its path index against the first mounted row's (`:892-896`, `:932-936`).
- Give up after 30 frames of no `scrollHeight` change while parked at an end (`:938-944`).
- Once the target has been within 64px for 10 consecutive frames, snap and stop — otherwise
  you chase virtualizer-induced layout shifts forever (`:924-931`).
- Force `scrollBehavior: auto` for the glide's duration or the platform's own smooth-scroll
  fights your stepping and produces jitter (`:903-905`, restored in `finally` at `:966`).
- **Cancel on any genuine user input:** wheel, touchstart, mousedown (catches grabbing the
  scrollbar), or a scroll key pressed outside an input (`:875-887`, `SCROLL_KEYS` at `:43-51`).
- A monotonically increasing `glideId` cancels an older glide when a newer one starts or on
  navigation (`:329-330`, `:353`, `:873`).

Arrival pulses the message box via a CSS animation, removed on `animationend`
(`src/content/features/tree-panel.ts:974-985`, `src/content/styles.ts:33-42`).

**Active-message highlighting** — the rules are `PORTABLE`, the rect math is `ADAPT`
(`src/content/features/tree-panel.ts:434-500`):

- Default: the current message is the **last row whose top is at or above the viewport top
  plus an 80px reading margin** — monotonic in scroll, so it does not flicker between
  neighbours (`:469-484`).
- Exception 1: parked at the very bottom (`scrollTop + clientHeight >= scrollHeight - 8`)
  *and* the true last path message is on screen → that message is current (`:455`, `:458-462`).
  Mere visibility of the last message is explicitly not enough; that mistake pinned the
  highlight permanently in short chats (`:437-443`).
- Exception 2: parked at the very top with the true first message mounted → the first
  message, unconditionally, because the 80px margin otherwise let message 2 win at scroll 0
  (`:464-468`).
- Zero-height rows never win (virtualizer placeholders measure 0×0 at the viewport origin)
  (`:477-478`).
- An assistant message normalizes to its parent prompt, since panel rows key on prompts
  (`:486-493`).

**Scroll-position restoration / sync:** the panel auto-centers on the current entry, but
pauses the moment the user scrolls the panel themselves; it resumes when the chat's current
message changes (`:660-684`, `:494-499`). A `panelScrollGuard` flag suppresses the
programmatic scroll from being mistaken for user scrolling, cleared on the next animation
frame (`:670`, `:683`). When paused, the previous `scrollTop` is restored after the
`innerHTML` rebuild (`:651`, `:679-682`).

### Layout — `ADAPT`

Three modes computed each tick **purely from available space, never from conversation
length** (`src/content/features/tree-panel.ts:402-413`):
`full` (280px, requires a ≥304px gap and a ≥1100px viewport) → `strip` (36px icon rail) →
`hidden`. The user's collapse preference is persisted and forces `strip`
(`:409-413`, `:816-821`, `src/shared/storage.ts:134-140`).

The "never from conversation length" rule is a scar: an earlier build collapsed the panel
whenever the active path had fewer than four messages, which meant branching off the first
message hid the tree exactly when you needed it (`CHANGELOG.md:477-482`).

`ADAPT`: positioning against the host page's scroll container
(`src/content/features/tree-panel.ts:415-420`), shadow-DOM isolation (`:514-528`), inset
shadows to read as "recessed beneath" someone else's chat (`:67-85`). `PORTABLE`: the
space-driven mode ladder, the persisted collapse preference, and the interaction rules above.

### Keyboard shortcuts

**The panel has none.** See the table in Part G for the (short) full list.

---

## Part D — Branching

The most important section. Assume you are rebuilding from this description.

### The data model — `PORTABLE`

```ts
export interface TreeNode {
  uuid: string;
  parentUuid: string;
  sender: "human" | "assistant";
  text: string;
  /** Global creation order from the API; used only for sibling ordering/latest-leaf picks. */
  index: number;
  createdAt: string | null;
  children: string[];
  /** True if this node is inside a note/comment side branch. */
  isNote: boolean;
  /** True while the assistant reply is still streaming (locally-applied sends). */
  pending: boolean;
}
```
(`src/shared/tree.ts:24-37`.)

```ts
export class ConversationTree {
  readonly conversationUuid: string;
  /** Model id from the conversation object (used for side-branch sends). */
  model: string | null = null;
  nodes = new Map<string, TreeNode>();
  activeLeafUuid: string | null = null;

  constructor(conversationUuid: string) {
    this.conversationUuid = conversationUuid;
  }
  // …
}
```
(`src/shared/tree.ts:64-73`.)

**What shape is it?** A **tree**, not a DAG and not a list of linear threads. Every node has
exactly one `parentUuid`; `children` is a derived index, rebuilt from the parent links, never
authored (`src/shared/tree.ts:110-120`). There are no edges beyond parenthood — no
cross-links, no merges. The root is **virtual**: nodes whose parent is a sentinel uuid
(`"00000000-0000-4000-8000-000000000000"`, `src/shared/messages.ts:17-18`) are the roots,
and the sentinel itself is never materialized (`src/shared/tree.ts:136-141`).

**Why that choice?** It was not a choice — it mirrors the host's own representation, which
returns a **flat array of every message across all branches** and expects the client to
rebuild structure from parent links (`docs/recon-report.md:26-35`,
`claude-extension-build-prompt.md:260-262`). But it is the right choice anyway: a tree with
one derived path is the minimum structure that supports "alternative continuations from any
point" without duplicating content, and the flat-array-plus-parent-pointer serialization is
exactly what you want for one-file-per-message storage (see Part F).

**Construction from the wire format** (verbatim, `src/shared/tree.ts:75-108`):

```ts
static fromConversation(json: unknown): ConversationTree | null {
  if (typeof json !== "object" || json === null) return null;
  const conv = json as {
    uuid?: unknown;
    model?: unknown;
    current_leaf_message_uuid?: unknown;
    chat_messages?: unknown;
  };
  if (typeof conv.uuid !== "string" || !Array.isArray(conv.chat_messages)) {
    console.warn("[prompt-tree] unexpected conversation shape; ignoring");
    return null;
  }
  const tree = new ConversationTree(conv.uuid);
  tree.model = typeof conv.model === "string" ? conv.model : null;
  for (const raw of conv.chat_messages as RawMessage[]) {
    if (typeof raw?.uuid !== "string") continue;
    tree.nodes.set(raw.uuid, {
      uuid: raw.uuid,
      parentUuid:
        typeof raw.parent_message_uuid === "string" ? raw.parent_message_uuid : ROOT_SENTINEL_UUID,
      sender: raw.sender === "assistant" ? "assistant" : "human",
      text: extractText(raw),
      index: typeof raw.index === "number" ? raw.index : 0,
      createdAt: typeof raw.created_at === "string" ? raw.created_at : null,
      children: [],
      isNote: false,
      pending: false,
    });
  }
  tree.rebuildLinks();
  tree.activeLeafUuid =
    typeof conv.current_leaf_message_uuid === "string" ? conv.current_leaf_message_uuid : null;
  return tree;
}
```

**The derived child index** (verbatim, `src/shared/tree.ts:110-134`) — note the annotation
marking pass, which you will replace with a real field:

```ts
/** Recompute children arrays and note flags from parent links. */
rebuildLinks(): void {
  for (const node of this.nodes.values()) node.children = [];
  for (const node of this.nodes.values()) {
    const parent = this.nodes.get(node.parentUuid);
    if (parent) parent.children.push(node.uuid);
  }
  // stable child ordering by creation index
  for (const node of this.nodes.values()) {
    node.children.sort((a, b) => (this.nodes.get(a)?.index ?? 0) - (this.nodes.get(b)?.index ?? 0));
  }
  // A note is exactly one hidden PAIR on the thread: the marker-prefixed
  // human message and its direct assistant reply. Descendants beyond the
  // reply are normal messages (the conversation continues under a note),
  // so there is NO subtree propagation.
  for (const node of this.nodes.values()) {
    node.isNote = node.sender === "human" && isNoteText(node.text);
  }
  for (const node of this.nodes.values()) {
    if (node.sender === "assistant") {
      const parent = this.nodes.get(node.parentUuid);
      node.isNote = !!parent?.isNote;
    }
  }
}
```

### Branch creation — `PORTABLE` concept, `ADAPT` mechanism

**Nothing is copied. Nothing is even referenced.** A branch from message *N* is created by
sending a new message whose parent is **N's parent** — producing a sibling of N. Prior
messages are *shared by structure*: both branches walk up through the identical ancestor
nodes, because the path is derived, not stored (`docs/recon-report.md:45-50`).

The user-facing flow (`src/content/features/branch-compose.ts`):

1. `activate(targetUuid)` looks up the node, records
   `{ conversationUuid, targetUuid, parentUuid: node.parentUuid, awaitingOutcome: false }`,
   and arms an override (`:132-154`). Branching the *first* message works because
   `node.parentUuid` is then the root sentinel (`:144`).
2. The next outgoing send has its `parent_message_uuid` replaced with the recorded parent,
   exactly once — the override is consumed on use (`src/page/fetch-patch.ts:180-187`).
3. On observing the rewritten send, the UI clears immediately but keeps state so a failure
   can re-arm (`src/content/features/branch-compose.ts:50-62`).
4. `stream-done` → mode fully exits (`:63-67`). `send-failed` → stay in branch mode and
   re-arm the override, because the page already consumed it (`:68-79`).

**Identity of the new branch:** none. There is no branch entity, no branch id, no branch
name. "A branch" is just a node with siblings. Everything the UI shows about branches —
counts, numbering, options — is computed from `siblingsOf` at render time
(`src/content/features/tree-panel.ts:556-558`, `:768-790`). **This is the design decision I
would most strongly recommend you copy.**

`ADAPT`: the mechanism (arming a rewrite of somebody else's outgoing request) exists only
because the extension does not own the send. In your app, "branch from message N" is
literally `parentId = messages[N].parentId` on your own create call.

### The active path — `PORTABLE`, and the heart of the feature

**Derived, never stored.** The only persisted branch state is one leaf pointer.

```ts
/** Root-level messages (children of the virtual sentinel root). */
rootMessages(): TreeNode[] {
  return [...this.nodes.values()]
    .filter((n) => n.parentUuid === ROOT_SENTINEL_UUID)
    .sort((a, b) => a.index - b.index);
}

/** Active root-to-leaf path derived by walking parents up from the leaf. */
activePath(): TreeNode[] {
  const path: TreeNode[] = [];
  let uuid = this.activeLeafUuid;
  const seen = new Set<string>();
  while (uuid && uuid !== ROOT_SENTINEL_UUID && !seen.has(uuid)) {
    seen.add(uuid);
    const node = this.nodes.get(uuid);
    if (!node) break;
    path.push(node);
    uuid = node.parentUuid;
  }
  return path.reverse();
}

/** Active path with note side-branch messages filtered out (for UI). */
visiblePath(): TreeNode[] {
  return this.activePath().filter((n) => !n.isNote);
}
```
(`src/shared/tree.ts:136-161`.) The `seen` set is a cycle guard — corrupt data cannot hang
the UI, it just truncates the path.

The two companion queries, also `PORTABLE`:

```ts
/**
 * Siblings of a message (children of its parent, creation order), excluding
 * note branches. Returns [uuid] itself if it has no parent record.
 */
siblingsOf(uuid: string): TreeNode[] {
  const node = this.nodes.get(uuid);
  if (!node) return [];
  const siblingUuids =
    node.parentUuid === ROOT_SENTINEL_UUID
      ? this.rootMessages().map((n) => n.uuid)
      : this.nodes.get(node.parentUuid)?.children ?? [uuid];
  return siblingUuids
    .map((u) => this.nodes.get(u))
    .filter((n): n is TreeNode => !!n && !n.isNote);
}

/**
 * Deepest descendant of `uuid` following the latest-created child at each
 * step, skipping note branches — the leaf to activate when jumping to a
 * sibling branch.
 */
latestLeafUnder(uuid: string): string {
  let current = uuid;
  for (;;) {
    const node = this.nodes.get(current);
    if (!node) return current;
    const children = node.children
      .map((u) => this.nodes.get(u))
      .filter((n): n is TreeNode => !!n && !n.isNote);
    if (!children.length) return current;
    children.sort((a, b) => b.index - a.index);
    current = children[0]!.uuid;
  }
}
```
(`src/shared/tree.ts:163-196`.)

`latestLeafUnder` answers the question every branching UI must answer: *"the user picked
sibling 3 — which of the many leaves under sibling 3 should we show?"* The answer here is
**most recently created, following the newest child at each step**. That is a policy choice,
not a law; "the leaf that was last active under this subtree" is the other defensible one
and would require storing per-subtree leaf memory. This code does not do that, and I found
no note explaining the choice — `unclear why`, though "most recent" is the cheapest correct
answer.

**Optimistic local application** (verbatim, `src/shared/tree.ts:198-251`) — how a send
becomes tree state before the server confirms anything:

```ts
private nextIndex(): number {
  let max = -1;
  for (const n of this.nodes.values()) if (n.index > max) max = n.index;
  return max + 1;
}

/**
 * Apply an observed outgoing send locally (human + pending assistant nodes)
 * so the model stays fresh without refetching the tree.
 */
applySend(args: {
  humanUuid: string;
  assistantUuid: string;
  parentUuid: string;
  prompt: string;
}): void {
  const base = this.nextIndex();
  if (!this.nodes.has(args.humanUuid)) {
    this.nodes.set(args.humanUuid, {
      uuid: args.humanUuid,
      parentUuid: args.parentUuid,
      sender: "human",
      text: args.prompt,
      index: base,
      createdAt: new Date().toISOString(),
      children: [],
      isNote: false,
      pending: false,
    });
  }
  if (!this.nodes.has(args.assistantUuid)) {
    this.nodes.set(args.assistantUuid, {
      uuid: args.assistantUuid,
      parentUuid: args.humanUuid,
      sender: "assistant",
      text: "",
      index: base + 1,
      createdAt: new Date().toISOString(),
      children: [],
      isNote: false,
      pending: true,
    });
  }
  this.rebuildLinks();
  this.activeLeafUuid = args.assistantUuid;
}

/** Update streaming assistant text for a locally-applied send. */
applyAssistantText(assistantUuid: string, text: string, done: boolean): void {
  const node = this.nodes.get(assistantUuid);
  if (!node) return;
  node.text = text;
  if (done) node.pending = false;
}

setLeaf(uuid: string): void {
  if (this.nodes.has(uuid)) this.activeLeafUuid = uuid;
}
```

Three details worth keeping: the assistant node is created **empty and pending** in the same
operation as the human node (so the UI has a slot to stream into); `activeLeafUuid` moves to
the assistant node immediately (so the new branch is instantly "current"); and `setLeaf`
refuses unknown uuids (`:253-255`).

### Navigation UI — `ADAPT`

Branches are surfaced in three places:

1. **The host's own `‹ k / n ›` arrows**, which the extension does not draw but does drive
   (below).
2. **Panel section headers**: a branch point gets a fork glyph `⑂`, its summary, and a chip
   showing *its own* branch number (`src/content/features/tree-panel.ts:729-739`).
3. **Numbered options beneath the header**: only the *other* branches, each labeled with its
   real 1-based sibling number, first two shown and the rest behind a `▾ N more` caret
   (`:766-790`, cap at `:40`).

The reasoning is recoverable and was a deliberate revision: v0.2.0 first shipped a `2/3`
badge plus an inline list where the current branch was repeated at full opacity
(`CHANGELOG.md:565-572`); v0.5.0 changed it so "a branched message's chip now shows just its
own branch number, and the list beneath shows only the OTHER branches, each labeled with its
real number" (`CHANGELOG.md:401-405`). That is the right call — the current branch is already
the row you are reading; repeating it wastes a line and creates a "which one am I on?"
ambiguity.

**Did it work?** Judged by the changelog, the *display* stabilized after v0.5.0 and was
never revisited; the *switching* underneath it broke silently in v0.12.2 and had to be fixed
(`CHANGELOG.md:7-16`). Assessment: the display model (headers + numbered alternatives +
collapse past two) is sound and worth copying. The strip mode's fork glyphs
(`src/content/features/tree-panel.ts:794-808`) are a nice touch — branch points stay visible
even at 36px.

**Switching mechanics** — `DISCARD` the implementation, but read the shape:
`BranchSwitchAdapter` is an interface with two implementations
(`src/content/branch-switch.ts:33-36`). The primary walks the host's own arrows one step at
a time, recomputing position from the model between steps and waiting on observed network
events rather than delays (`:61-123`); the fallback PUTs the leaf directly and reloads the
page (`:131-156`). All of this exists solely because the SPA offers no external hook to
re-render from a fetch it did not initiate (`docs/recon-report.md:89-102`). In your app,
switching is `setState({ activeLeafId })`. Keep only one idea: **switching targets a leaf,
not a branch** — pick the sibling, resolve it to a leaf via `latestLeafUnder`, set the
pointer (`src/content/branch-switch.ts:136`).

One subtlety that *is* portable: sibling *position* for the counter must be computed in the
same order the counter uses. Here that means including annotation nodes that the panel
otherwise hides (`src/content/branch-switch.ts:38-52` vs `src/shared/tree.ts:163-177`) —
two different sibling functions with two different filters. If you hide anything from your
message list, expect to need this distinction.

### Edit and regenerate — `PORTABLE` insight

**They are the same operation, and so is branching.** From the captures:

- A native **edit** is byte-for-byte an ordinary send whose `parent_message_uuid` is the
  edited message's parent (`docs/recon-report.md:45-50`,
  `claude-extension-build-prompt.md:305`). It creates a sibling. The original is not
  modified or deleted.
- **Branch-compose** is behaviourally identical to a native edit from the server's
  perspective — it rewrites exactly that one field
  (`src/content/features/branch-compose.ts:6-11`).
- A **regenerate/retry** is a different endpoint but the same idea: an empty prompt whose
  parent is the *human* message whose reply is being regenerated, producing a sibling
  **assistant** message (`docs/recon-report.md:74-80`).

So the model has exactly one mutation: *append a child to some node, then move the leaf.*
Editing branches on the human side; regenerating branches on the assistant side. This is
where these systems usually get confusing, and the reason it is not confusing here is that
there is no "edit" code path at all — the extension only observes.

**What the extension had to do differently for retry** is worth knowing: retry payloads
carry no client-generated uuids, so the new assistant message's id is unknown at send time;
the code refetches the whole tree when the retry stream ends
(`src/page/fetch-patch.ts:251-256`, `src/page/index.ts:23-27`). Consequence: retries do not
stream into the panel (`README.md:141-143`). **In your app, mint the id for regenerations
too** and this whole class of problem disappears.

### Deletion — nothing is implemented

**There is no node deletion in this codebase.** `ConversationTree` has no `delete`, `remove`,
or `prune` method (`src/shared/tree.ts` in full). The only "delete" is the annotation soft
delete (Part E), which does not touch the tree.

So: cascade, orphan, reparent, or refuse? **None — the question never arose**, because the
host owns the data and never exposed deletion. The one adjacent piece of evidence is
defensive: `activePath` breaks out if a parent uuid is missing from the map
(`src/shared/tree.ts:151`), and `rebuildLinks` silently drops children whose parent is
absent (`:113-115`) — so an orphaned subtree would simply become unreachable rather than
crash. **You will have to design this yourself.** My opinion is in Part I.

### Persistence — `DISCARD`

**The tree is never serialized locally.** The registry is an in-memory `Map` built fresh on
every page load (`src/content/index.ts:44`), populated only from observed tree loads
(`:111-118`), and re-requested on navigation (`:199`, `:278-280`). Branches "survive reloads"
because the *host server* stores them, not because this code does. There is no local cache,
no IndexedDB copy of the tree, and no schema for one.

The only branch-adjacent thing persisted locally is the branch-**draft** target
(`branchTargetUuid`/`branchParentUuid` in `DraftRecord`, `src/shared/storage.ts:43-45`), so
an unsent branch composition can be re-entered after a reload
(`src/content/features/drafts.ts:441-450`).

**For you this is the biggest gap in the extraction: there is no serialization design to
copy.** Part I proposes one.

### Scale

No numbers exist in the repo. What the code reveals about where the authors expected pain:

- `activePath()` is O(depth) and called *many* times per render — inside `siblingsOf`
  consumers, `trackCurrentMessage` (`src/content/features/tree-panel.ts:451`),
  `computeReplies` (`src/content/features/replies.ts:119`), and once per glide frame
  (`:344`). It is never memoized.
- `rebuildLinks()` is O(n log n) over *all* nodes and runs on every optimistic send
  (`src/shared/tree.ts:241`).
- `syncThreadTails` is O(n × depth) over all nodes and runs on every structural change
  (`src/content/index.ts:88-107`).
- The mitigations that *do* exist are all in the render path, not the model path
  (signature check, summary memo, rAF throttle) — which tells you rendering, not tree math,
  was the thing that hurt.

### Honest assessment

**What was over-built:**

- `isNote` on `TreeNode` plus the two-pass marking in `rebuildLinks`
  (`src/shared/tree.ts:121-133`) is a *content-sniffing* classification: a message is an
  annotation if its text starts with `"!@#%NOTE!@"` (`src/shared/note-protocol.ts:15`,
  `:40-42`). That is a property of the storage medium, not the data. It leaks into
  `visiblePath`, `siblingsOf`, `latestLeafUnder`, two different sibling orderings, the DOM
  hiding pass, and the thread-tail remapper. **In your app this is one boolean column and
  none of that machinery.**
- `syncThreadTails` (`src/content/index.ts:78-107`) plus its page-side map
  (`src/page/fetch-patch.ts:45-52`, `:188-201`, `:264-298`) is ~120 lines whose entire job is
  lying to the host app about where a thread ends. **100% `DISCARD`.**
- The dual sibling functions (`src/content/branch-switch.ts:38-52` vs
  `src/shared/tree.ts:163-177`) exist only because the host counts hidden nodes.

**What was wrong:**

- Optimistic apply with no rollback (Part B). The model can permanently disagree with the
  server until the next full reload.
- `stream-done` ignoring `ok` on the main path (Part B).
- `pending` is set on the assistant node but is barely consumed — I could find no UI that
  reads `node.pending` (grep across `src/` shows it written at `src/shared/tree.ts:238`,
  `:250` and declared at `:36`, but no reader). It is dead weight in its current form,
  though the *concept* is right.

**If I were designing it again with no legacy**, the model would be almost exactly this,
minus the annotation machinery:

```ts
type MessageId = string;                      // UUIDv7, sortable
interface Message {
  id: MessageId;
  parentId: MessageId | null;                 // null = root; no sentinel
  role: "user" | "assistant";
  text: string;
  createdAt: string;                          // ISO; replaces the numeric `index`
  status: "streaming" | "complete" | "failed";
  meta?: Record<string, unknown>;
}
interface Conversation {
  id: string;
  activeLeafId: MessageId | null;             // the ENTIRE branch state
  messages: Map<MessageId, Message>;          // children derived, never stored
}
```

Changes from the original, each for a stated reason: `parentId: null` instead of a sentinel
uuid (the sentinel exists only to make the wire format uniform, and it costs a special case
in four functions — `src/shared/tree.ts:139`, `:148`, `:171`, `src/content/branch-switch.ts:45`);
`createdAt` instead of a global integer `index` (an integer counter needs a coordinator, an
ISO timestamp or a UUIDv7 does not, and every use of `index` is really "which is newer" —
`src/shared/tree.ts:119`, `:140`, `:193`); an explicit three-state `status` instead of the
boolean `pending` (so "failed" is representable, which is precisely the gap behind the
phantom-node bug); no `isNote` (annotations get their own store).

---

## Part E — Notes and comments

### Note vs comment — same type, different anchor

The code makes a *narrow* distinction. Both are the same record type, the same storage, the
same card UI, and the same submit path; `kind: "note" | "comment"` is one discriminant field
(`src/shared/storage.ts:16-17`). What actually differs:

| | Note | Comment |
|---|---|---|
| Trigger | text selection in an assistant reply | hover with nothing selected |
| Entry affordance | ✎ in the right margin | + in the right margin |
| Anchor kind | quote + prefix/suffix + charOffset | anchorText snippet + offsetRatio |
| Card header | the quote in curly quotes | the literal word "Comment" |
| Context sent to the model | the quote itself | ~200 chars around the position |

Cites: `src/content/features/notes.ts:54-92`, `src/content/features/comments.ts:59-106`,
`src/shared/storage.ts:24-31`, `src/content/features/note-cards.ts:859-863`, `:420-432`,
`:539-553`. They share `NoteCardManager` entirely
(`src/content/features/note-cards.ts:106-121`) and are separately toggleable only because
each has its own `Feature` wrapper (`src/content/features/notes.ts:24-25`,
`src/content/features/comments.ts:20-21`).

**Verdict: two anchor strategies, one annotation type.** That is the right factoring and
worth copying — do not build two systems.

### The anchoring model — `PORTABLE`

```ts
export interface NoteRecord {
  noteId: string;
  kind: "note" | "comment";
  conversationUuid: string;
  anchorMessageUuid: string;
  /** Human message uuid of the note's first hidden pair in the tree. */
  noteBranchRootUuid: string;
  /** Human uuids of follow-up pairs ("Continue" thread), in order. */
  followUpRootUuids?: string[];
  /* --- note (highlight) anchoring --- */
  quote?: string;
  prefix?: string;
  suffix?: string;
  charOffset?: number;
  /* --- comment (position) anchoring --- */
  anchorText?: string;
  offsetRatio?: number;
  /** Soft-deleted: hidden from the gutter but restorable from the panel. */
  deleted?: boolean;
  createdAt: number;
}
```
(`src/shared/storage.ts:15-35`.) `noteBranchRootUuid` and `followUpRootUuids` are
`DISCARD` — they are pointers into the host's conversation tree where the annotation's
*content* lives. Everything else is `PORTABLE`.

So the anchor is: **message id + a text quote + local context + a positional hint.** Not a
DOM range, not a selector, not a character offset alone. The quote is capped at 300 chars
(`src/content/features/notes.ts:125`), prefix/suffix at 20 chars each (`:126-127`),
`anchorText` at 40 chars (`src/content/features/comments.ts:121`).

**How the anchor is captured** (`src/content/features/notes.ts:94-130`): the selection's
`toString()` is the quote, but the *span* is located densely rather than as
`start + quote.length`, because a multi-line selection's newlines make those two differ;
the selection's start offset is used only to break ties between repeated occurrences
(`:104-120`). This subtlety is easy to miss and will bite you the first time someone
annotates across a list.

**How the anchor is resolved** — the scoring function, verbatim
(`src/content/features/anchoring.ts:89-134`):

```ts
export interface QuoteMatch {
  start: number;
  end: number;
}

/**
 * Finds `quote` in the indexed text: prefix/suffix matches disambiguate
 * duplicate occurrences; charOffset proximity is the final tiebreaker. Matching
 * ignores whitespace differences (dense projection), so a quote spanning block
 * boundaries — where the selection carried newlines the DOM text lacks — is
 * still located instead of collapsing the card to the message top.
 */
export function findQuote(
  index: TextIndex,
  quote: string,
  prefix: string | undefined,
  suffix: string | undefined,
  charOffset: number | undefined
): QuoteMatch | null {
  if (!quote) return null;
  const di = denseIndex(index.text);
  const matches = findDense(di, quote);
  if (!matches.length) return null;
  const dPrefix = prefix ? densify(prefix) : "";
  const dSuffix = suffix ? densify(suffix) : "";
  let best = matches[0]!;
  let bestScore = -Infinity;
  for (const m of matches) {
    let score = 0;
    if (dPrefix && di.dense.slice(Math.max(0, m.denseStart - dPrefix.length), m.denseStart) === dPrefix) score += 2;
    if (dSuffix && di.dense.slice(m.denseEnd, m.denseEnd + dSuffix.length) === dSuffix) score += 2;
    if (charOffset !== undefined) score -= Math.abs(m.start - charOffset) / Math.max(index.text.length, 1);
    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
  }
  return { start: best.start, end: best.end };
}

/** Finds a comment's anchorText; returns its start offset or null. */
export function findAnchorText(index: TextIndex, anchorText: string): number | null {
  if (!anchorText) return null;
  const m = findDenseFirst(denseIndex(index.text), anchorText);
  return m ? m.start : null;
}
```

Note the scoring shape: prefix/suffix are worth **2 each** (integers) and the offset
penalty is a **fraction of 1** (normalized by text length), so positional proximity can only
ever break ties between context-equivalent candidates. That is deliberate and correct.

**The dense-projection layer this depends on** — the whole file, verbatim, because it is the
single highest-value 50 lines in the repo (`src/shared/text-match.ts:21-80`):

```ts
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
  /** Offsets in the dense projection (for prefix/suffix comparison). */
  denseStart: number;
  denseEnd: number;
}

/** The dense projection of `text` (see module header). */
export function densify(text: string, markdown = false): string {
  return text.replace(markdown ? MARKDOWN_RE : WHITESPACE_RE, "");
}

export function denseIndex(text: string, markdown = false): DenseIndex {
  const ignored = markdown ? MARKDOWN_RE : WHITESPACE_RE;
  let dense = "";
  const map: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    ignored.lastIndex = 0;
    if (ignored.test(ch)) continue;
    dense += ch;
    map.push(i);
  }
  return { source: text, dense, map };
}

/** Every occurrence of `needle`, densely matched, in source coordinates. */
export function findDense(index: DenseIndex, needle: string, markdown = false, limit = 200): DenseMatch[] {
  const dense = densify(needle, markdown);
  if (!dense) return [];
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
```

Two modes matter: whitespace-only (rendered text vs. selection text) and
whitespace+markdown (rendered text vs. **markdown source** — used by reply references to
find a quoted passage inside a message's raw markdown,
`src/content/features/replies.ts:142-157`). **You will need the markdown mode**, because in
your app the stored text is markdown and the displayed text is rendered — the exact
asymmetry this handles.

**Text indexing and range reconstruction** — `PORTABLE` (still browser DOM, just not
claude.ai's), verbatim (`src/content/features/anchoring.ts:22-87`, `:136-142`):

```ts
export interface TextIndex {
  text: string;
  /** Text nodes with their start offsets in `text`, in document order. */
  nodes: Array<{ node: Text; start: number }>;
}

/** Concatenates all visible text nodes of a row into one searchable string. */
export function indexText(root: HTMLElement): TextIndex {
  const nodes: TextIndex["nodes"] = [];
  let text = "";
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      // skip our own injected UI (namespaced) — anchors target native content
      if (parent.closest('[class^="pt-"], [id^="pt-"]')) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const textNode = n as Text;
    nodes.push({ node: textNode, start: text.length });
    text += textNode.data;
  }
  return { text, nodes };
}

/** Builds a DOM Range spanning [start, end) character offsets of the index. */
export function rangeFromOffsets(index: TextIndex, start: number, end: number): Range | null {
  const locate = (offset: number, preferEnd: boolean): { node: Text; local: number } | null => {
    for (let i = index.nodes.length - 1; i >= 0; i--) {
      const entry = index.nodes[i]!;
      const nodeEnd = entry.start + entry.node.data.length;
      if (offset > entry.start || (offset === entry.start && (!preferEnd || i === 0))) {
        if (offset <= nodeEnd) return { node: entry.node, local: offset - entry.start };
      }
    }
    const first = index.nodes[0];
    return first ? { node: first.node, local: 0 } : null;
  };
  const s = locate(start, false);
  const e = locate(end, true);
  if (!s || !e) return null;
  try {
    const range = document.createRange();
    range.setStart(s.node, Math.min(s.local, s.node.data.length));
    range.setEnd(e.node, Math.min(e.local, e.node.data.length));
    return range;
  } catch {
    return null;
  }
}

/** Character offset of a boundary point within the indexed text, or null. */
export function offsetOfPoint(index: TextIndex, node: Node, nodeOffset: number): number | null {
  // If the point is an element boundary, descend to the nearest text position.
  if (node.nodeType === Node.TEXT_NODE) {
    const entry = index.nodes.find((e) => e.node === node);
    return entry ? entry.start + nodeOffset : null;
  }
  const child = node.childNodes[nodeOffset] ?? node.childNodes[nodeOffset - 1] ?? node;
  for (const entry of index.nodes) {
    if (child.contains(entry.node) || entry.node === child) return entry.start;
  }
  return null;
}

/** Viewport rect of the first line of a character range (for gutter y). */
export function firstLineRect(index: TextIndex, start: number, end: number): DOMRect | null {
  const range = rangeFromOffsets(index, start, end);
  if (!range) return null;
  const rects = range.getClientRects();
  return rects.length ? rects[0]! : range.getBoundingClientRect();
}
```

`firstLineRect` is small but load-bearing: gutter cards align to the **first line** of a
multi-line quote via `getClientRects()[0]`, not to the bounding box, which would centre the
card against a paragraph instead of its opening line
(`src/content/features/note-cards.ts:729-731`).

The one thing to change when you port `indexText`: replace the `pt-` prefix filter with your
own UI namespace (`src/content/features/anchoring.ts:37`). The principle — *never index your
own injected UI text* — is what matters.

**Comment (positional) anchoring** — `ADAPT`. The pointer position is resolved to a text
node via `caretRangeFromPoint` with a `caretPositionFromPoint` fallback
(`src/content/features/comments.ts:135-151`); the first 40 chars of that text node become
`anchorText`, and an `offsetRatio` (0–1 within the message box) is the fallback
(`:108-124`). Resolution prefers the text match and falls back to
`rowTop + rowHeight * offsetRatio` (`src/content/features/note-cards.ts:736-742`).
Explicitly never raw pixels (`src/content/features/anchoring.ts:5-8`).

### Anchor durability — partially solved, and here is exactly where the holes are

Resolution runs on **every observer tick**, against the **rendered** text of the row, so
zoom, reflow, and markdown re-render do not break anchors
(`src/content/features/note-cards.ts:707-744`, `src/content/features/anchoring.ts:5-8`).
Beyond that:

| Situation | What happens | Cite |
|---|---|---|
| Anchored text changed so the quote no longer matches | card pins to the **top of the message**, `anchorState: "moved"`, a red-flag "anchor moved" label shows on the card | `note-cards.ts:727-735`, `:896-901`, `:843-844` |
| Quote appears multiple times | scored disambiguation (prefix/suffix/offset) | `anchoring.ts:112-125` |
| Anchor message deleted / absent from the tree | routed to an **"Unanchored notes"** drawer in the panel, click opens it in the fullscreen modal | `note-cards.ts:713-717`, `:976-988`; panel `tree-panel.ts:620-627`, `:840-842` |
| Anchor message exists but is **not on the active path** (branch diverged) | **the card silently disappears.** Explicit early `continue` with the comment "off-path or unrendered: no card, not unanchored" | `note-cards.ts:715` |
| Message edited (⇒ a new sibling exists, original untouched) | the annotation stays on the *original* message; it reappears whenever you switch back to that branch | consequence of `note-cards.ts:713-715` + tree immutability |
| Note's own content messages missing from the tree | pair renders as `"(note content unavailable)"` with status `missing` | `note-cards.ts:649`, `:925-927` |
| Composer open when its anchor scrolls/moves | the open composer tracks its anchor exactly like a card does | `note-cards.ts:793-818` |

**Orphan detection exists but is coarse**, and the third row above is the honest gap: an
annotation on an off-path message is indistinguishable, in the UI, from an annotation that
does not exist. Nothing tells the user "you have 3 notes on the other branch". There is no
"resolve/dismiss orphan" flow, no re-anchoring UI, and no fuzzy fallback beyond the dense
match — if the quote is genuinely gone, the card just sits at the top of the message
forever, flagged. **Say plainly: durable re-anchoring across edits was not solved. It was
made *visible* rather than *correct*, which is a defensible product answer, but you should
know it is the answer you are inheriting.**

### Branch interaction

**Yes — an annotation on a shared ancestor appears in every branch that includes it.** This
falls out of the model for free: cards are resolved by looking up
`domMap.rowByUuid(record.anchorMessageUuid)` (`src/content/features/note-cards.ts:713`), and
a shared ancestor is rendered on every path that passes through it. No special code, no
copying.

**Was that intended?** The design notes never state it, but every mechanism points that way,
and it is the behaviour you want: an observation about a message is about *that message*,
not about the path you happened to be on. **Is it right?** For notes on *content*, yes,
unambiguously. The one case it gets wrong is an annotation that is really about a *comparison*
between branches — there is nowhere to put that, and the model has no place for it. Worth
knowing before you design yours.

### Storage shape and where annotations live

`chrome.storage.local`, one key per conversation holding **an array of all its annotations**:
`pt.notes.{conversationUuid}` → `NoteRecord[]` (`src/shared/storage.ts:82`, `:144-159`).
Annotations live **beside** messages, not inside them — nothing about a message record
references its annotations; the join is `anchorMessageUuid`, resolved at render time.

The half you must not copy: annotation **content** is not in this record at all. Questions
and answers are read live out of the host's conversation tree by uuid
(`src/content/features/note-cards.ts:630-650`), which is why the record needs
`noteBranchRootUuid` and `followUpRootUuids` (`src/shared/storage.ts:20-23`), why there is a
whole wire protocol for smuggling metadata through a prompt
(`src/shared/note-protocol.ts:44-49`), and why deleting a note cannot delete anything
(`README.md:144-146`). All of that is `DISCARD`.

Save semantics are read-modify-write of the whole array with upsert-by-id
(`src/shared/storage.ts:148-154`) — **last write wins, and concurrent saves can clobber each
other**; there are at least two async callers that can overlap
(`src/content/features/note-cards.ts:136`, `:569`).

### The editing UI

- **Create:** the composer opens *in the margin gutter*, never in the main chat input
  (`src/content/features/note-cards.ts:320-397`). It is positioned at its anchor **before**
  insertion and focused with `preventScroll: true`, because focusing an unpositioned element
  yanks the page to the top (`:389-395`).
- **Submit:** Enter sends, Shift+Enter newlines, Escape cancels (`:358-365`). On submit the
  composer's exact `top` is handed to the pending card so the composer visibly *becomes* the
  card in the same frame rather than vanishing (`:369-373`, `:461-476`).
- **Ephemeral empty composer:** a pointer-down outside the gutter closes it **only if it
  holds no typed text** (`:377-388`). Small rule, disproportionately good.
- **Follow-ups:** "Continue" opens an ask box *inside* the existing card so the thread
  extends in place — an earlier version opened a separate composer that read as a new note
  (`:516-529`, `CHANGELOG.md:214-217`). Root + 2 pairs show; the rest collapse behind
  `▾ N more` / `▴ hide`, auto-expanded while actively continuing
  (`:910-912`, `:937-957`, `:501`).
- **Delete:** soft. Sets `deleted: true`, removes the card and connector immediately, and
  forces the drawer feed to re-emit (`:557-570`). Restore is one click from the panel's
  bottom tray (`:572-579`, `tree-panel.ts:631-649`).
- **Expand:** ⤢ opens a fullscreen shadow-DOM modal rendering the whole thread as markdown;
  closes on ✕, backdrop click, or Escape (`:581-625`).
- **Markdown:** streaming replies render as **plain text**, and the finished reply
  re-renders as markdown once complete (`:963-964`, `:152-164`). Deliberate, and it reads
  well — no half-parsed tables mid-stream.
- **Indicators:** cards sit in a right-margin gutter mounted *inside* the message-list
  container so they scroll with their messages (`:225-253`), laid out Google-Docs style:
  sort by anchor y, push down on collision, draw a connector line back to the anchor
  (`:767-788`, `:820-835`). Panel-side indicators are the unanchored drawer and the deleted
  tray only — **there is no per-message "has notes" marker in the sidebar**, which strikes me
  as a real omission.

### What annoyed the author in daily use

Inferred from the changelog, since there is no notes file — treat as evidence, not testimony:

- The margin **+** button was hard to reach; the pointer lost it while travelling from text
  to gutter. Fixed twice: a hover "corridor" with a deliberately narrow band around the
  button (`src/content/features/comments.ts:74-87`) and a larger invisible hit area
  (`CHANGELOG.md:577-581`).
- The composer **stole keystrokes into the main chat box** until events were stopped at the
  shadow boundary (`src/content/features/note-cards.ts:48-58`, `CHANGELOG.md:583-585`).
- Opening the composer **jumped the scroll** (`CHANGELOG.md:581-583`).
- Notes reappeared as visible chat messages after a reload, twice, needing both a model-based
  and a DOM-marker-based hiding pass (`src/content/index.ts:216-237`, `CHANGELOG.md:387-390`).
- Answers came back as flat prose because the built-in instructions had *forbidden*
  formatting; the instruction text had to be rewritten to ask for normal markdown
  (`CHANGELOG.md:52-58`, current text at `src/shared/note-protocol.ts:17-22`).
- Cards landed at the top of the message instead of at the highlight — the bug that produced
  the entire dense-matching layer (`CHANGELOG.md:70-82`).

---

## Part F — Storage and state

### Backend and key schema — `ADAPT`

Two backends, both browser-local (`src/shared/storage.ts:1-13`):

| Key | Value | Cite |
|---|---|---|
| `pt.settings` | `Settings` — six booleans | `:80`, `:62-78` |
| `pt.panel.collapsed` | `boolean` | `:81`, `:134-140` |
| `pt.notes.{conversationUuid}` | `NoteRecord[]` | `:82`, `:144-159` |
| `pt.draft.{conversationUuid}` | `DraftRecord` (one per conversation) | `:83`, `:163-174` |
| IndexedDB `prompt-tree-drafts` / store `draftFiles` | key = conversation uuid → `DraftFile[]` (`{ name, type, blob }`) | `:184-185`, `:217-234` |

The split is deliberate: `chrome.storage` for structured records, IndexedDB for Blobs that
are "too large/binary for chrome.storage" (`:5-8`). The DB name is prefixed so it is
identifiable inside the host origin (`:8`).

Every accessor is wrapped to resolve to a safe default and log once on error, never throwing
into feature code (`:85-109`, `:10-13`).

### Serialized shapes with concrete examples

**`Settings`** (`src/shared/storage.ts:62-78`):

```ts
export interface Settings {
  branchCompose: boolean;
  treePanel: boolean;
  notes: boolean;
  comments: boolean;
  replies: boolean;
  draftAutosave: boolean;
}
```
```json
{ "branchCompose": true, "treePanel": true, "notes": true,
  "comments": true, "replies": true, "draftAutosave": true }
```
Loaded as `{ ...DEFAULT_SETTINGS, ...stored }`, so a newly added feature flag defaults on
without a migration (`:113-115`). That spread is the *entire* forward-compatibility story in
this codebase, and for a flat boolean record it is genuinely sufficient.

**`NoteRecord`** — type in Part E. A concrete note record (uuids shortened for readability):

```json
{
  "noteId": "019f3f53-8769-71b0-8160-c86835378b38",
  "kind": "note",
  "conversationUuid": "019f3e54-bcd7-790e-8728-9143e4799a2c",
  "anchorMessageUuid": "019f3e54-bcd7-7b52-b5c6-c08c663367f5",
  "noteBranchRootUuid": "019f3f5d-9fa5-75bc-ac32-2bf3f8d9e4cb",
  "followUpRootUuids": ["019f3f6a-40f5-7781-9f0a-192a6d48d4db"],
  "quote": "the second paragraph of the reply",
  "prefix": "…as described above, ",
  "suffix": " which follows from",
  "charOffset": 412,
  "createdAt": 1753300000000
}
```
and a comment record, same type, different half populated:
```json
{
  "noteId": "019f3f71-2a10-7c4e-9b31-55aa19f0e2c1",
  "kind": "comment",
  "conversationUuid": "019f3e54-bcd7-790e-8728-9143e4799a2c",
  "anchorMessageUuid": "019f3e54-bcd7-7b52-b5c6-c08c663367f5",
  "noteBranchRootUuid": "019f3f71-2a10-7ffe-8004-31b2c0d4a7e9",
  "anchorText": "Because the index is global creation",
  "offsetRatio": 0.62,
  "deleted": true,
  "createdAt": 1753300500000
}
```
(Shape per `src/shared/storage.ts:15-35`; `deleted` semantics `:32-33`.)

**`DraftRecord`** (`src/shared/storage.ts:37-60`):

```ts
export type DraftMode = "normal" | "branch" | "note" | "comment";

export interface DraftRecord {
  conversationUuid: string;
  text: string;
  mode: DraftMode;
  /** branch mode: the ghosted (branched-from) message and its parent. */
  branchTargetUuid?: string;
  branchParentUuid?: string;
  /** note/comment mode: the full anchor object. */
  anchor?: Partial<NoteRecord> & { anchorMessageUuid: string };
  /** true when attachments exceeded the cap and were not saved. */
  attachmentsSkipped?: boolean;
  /** true when attachment blobs were saved to IndexedDB. */
  hasAttachments?: boolean;
  /**
   * A "cleared" tombstone: the user dismissed this draft, but the site keeps
   * its own copy of the composer text and re-inserts it on reload. The
   * tombstone remembers the dismissed text so the next load can empty the
   * composer again instead of resurrecting it with no banner.
   */
  cleared?: boolean;
  savedAt: number;
}
```
```json
{
  "conversationUuid": "019f3e54-bcd7-790e-8728-9143e4799a2c",
  "text": "let me try that differently —",
  "mode": "branch",
  "branchTargetUuid": "019f3e55-e059-7cad-8c76-7fab17011aa6",
  "branchParentUuid": "00000000-0000-4000-8000-000000000000",
  "hasAttachments": false,
  "attachmentsSkipped": false,
  "savedAt": 1753301234567
}
```

`mode` + the mode-specific fields is a small, good pattern: a draft is not just text, it is
**text plus the UI state needed to re-enter the context it was written in**
(`src/content/features/drafts.ts:423-463`). Copy that idea.

### Size limits hit in practice

- **Attachments: 5 MB total**, enforced *before* writing. Over the cap, nothing is saved and
  the record carries `attachmentsSkipped: true`, which the restore banner surfaces as
  "(attachments not saved)" (`src/content/features/drafts.ts:58`, `:253-263`, `:342`).
  This is the only hard limit in the codebase, and the honest-degradation handling around it
  is the pattern worth copying.
- **`chrome.storage.local` quota is never checked.** A failed write is caught, logged, and
  swallowed (`src/shared/storage.ts:95-101`). At the boundary the user would silently lose
  annotations. There is no eviction, no compaction, and no size accounting.
- **Note arrays are unbounded** — one array per conversation, appended forever, never pruned
  (soft-deleted records stay in the array by design, `src/shared/storage.ts:32-33`).
- The only bounded structure in the whole app is the panel's summary memo, cleared past 4,000
  entries (`src/content/features/tree-panel.ts:535`).

### Migrations

**There are none.** No `schemaVersion`, no version field on any record, no upgrade path;
`grep` for `version|migrat` over `src/shared/storage.ts` returns nothing. The IndexedDB
database is opened at version 1 and its `onupgradeneeded` only creates the store
(`src/shared/storage.ts:189-194`) — it has never been bumped.

On load with a changed shape, behaviour is by luck rather than design: `Settings` survives
via the defaults spread (`:113-115`); `NoteRecord`/`DraftRecord` are cast straight out of
storage with `as T` and **no validation** (`:88`), so a stale record with a removed field
becomes an object with `undefined` where code expects a value. In practice most anchoring
fields are already optional, so old records degrade rather than crash — but that is a
property of the type, not of any migration logic. The one real shape change that happened
(v0.5.0 moving notes from side branches to in-thread messages) was explicitly **not**
migrated; old notes just keep behaving the old way (`README.md:135-140`).

**For a git-backed markdown app this is the single easiest thing to do better**, and the
cheapest: a `schema:` key in front matter costs nothing and buys you the ability to change
your mind.

### Client state management — `PORTABLE` pattern

No library. No framework. The pattern is:

- **A typed event bus** with per-event payload types, a `Map<event, Set<handler>>`, and
  handler errors caught so one listener cannot break another
  (`src/shared/util.ts:61-86`, event catalogue `src/content/ctx.ts:14-66`).
- **A `Ctx` object** passed to every feature: bus, DOM map, current-conversation getter,
  tree getter, page channel, settings getter (`src/content/ctx.ts:68-76`).
- **A `Feature` interface** — `id` (matching a settings key), idempotent `setEnabled`,
  `onConversation` (`src/content/ctx.ts:78-85`). Features are constructed in dependency
  order, each in its own try/catch so one failure skips only that feature
  (`src/content/index.ts:246-268`).
- **`waitForBusEvent(bus, event, predicate, timeoutMs)`** for "act, then wait for the
  observable consequence" flows, with the timeout as an explicit failure guard rather than a
  scheduling mechanism (`src/content/ctx.ts:87-112`).

**Where the source of truth lives when they disagree:** unambiguously the **server**, via
the tree registry. The in-memory tree is the working copy; a `conversation-loaded` event
replaces it wholesale (`src/content/index.ts:111-118`). Local optimistic application exists
only to avoid a refetch round-trip (`src/shared/tree.ts:204-207`). Persisted local storage
holds *only* what the server cannot: settings, panel state, anchors, drafts. The DOM is
never a source of truth for identity — only for geometry (`docs/architecture.md:95-98`).

That layering is the right answer and transfers directly: **files on disk are the truth, an
in-memory tree is the working copy, and the rendered DOM is neither.**

### Sync, import, export

**None of the three exist.** No export, no import, no backup, no cross-device sync of
extension data (`chrome.storage.sync` is never used — only `.local`). The README's claim
that notes "persist across reloads and devices" (`README.md:29-32`) is true only because the
*content* lives in the host's server-side conversation; the *anchors* stay on one machine
(`docs/architecture.md:121-126`). **So an annotation viewed on a second device shows its
messages but has no card.** That is a real consequence of the split-brain storage and a good
argument for keeping annotations in the same store as messages — which, in your app, they
will be.

### What I would change knowing you persist to markdown files on disk

| Record | Maps cleanly to one file per record? | Why |
|---|---|---|
| **Message** | **Yes — one file per message.** | It is immutable once complete, has a stable sortable id, and its `parentId` is a one-line front-matter field. Branching writes a new file and touches nothing else, which is exactly the git-friendly property you want: a branch is an *added* file, not a modified one. |
| **Conversation** | **Yes, but keep it tiny.** | It should hold `id`, title, and `activeLeafId` — and nothing else. `activeLeafId` is the one genuinely mutable, high-churn field in the entire system; isolating it in a small file keeps your diffs legible instead of rewriting a large thread file on every message. |
| **Annotation** | **Yes — one file per annotation.** | Independent lifecycle from messages, independently created and soft-deleted, and it references its target by id. One file per annotation also means annotation churn never touches message files. |
| **Draft** | **No — do not put drafts in the repo at all.** | Drafts are per-device, per-moment, and change on every keystroke (debounced 500ms here, `src/content/features/drafts.ts:84`). Committing them would flood history. Keep them in `localStorage`/IndexedDB or a gitignored scratch dir, exactly as this codebase keeps them out of the shared store. |
| **Attachments** | **No — content-address them.** | `DraftFile` blobs (`src/shared/storage.ts:178-182`) map to files on disk named by content hash, with messages referencing the hash. Do not inline base64 into markdown. |
| **Settings / panel state** | **No.** | Per-device UI preferences (`src/shared/storage.ts:62-78`, `:81`). A collapsed sidebar is not project state. |

Two more file-storage-specific notes drawn from what this code does:

- **The derived-`children` decision pays off enormously here.** Because `children` is rebuilt
  from parent links (`src/shared/tree.ts:110-116`), writing a new message never requires
  modifying its parent's file. If you stored a `children[]` array you would rewrite the
  parent on every branch — one logical append becoming a two-file diff and a lost-update race.
  **Store the parent pointer, derive the children. Always.**
- **`index` must go.** A global integer counter needs a coordinator, and with one file per
  message written concurrently there isn't one. Every use of `index` in this codebase is
  really "which is newer" (`src/shared/tree.ts:119`, `:140`, `:193`) — a UUIDv7 id or an ISO
  `createdAt` answers that with no coordination at all.

---

## Part G — Interaction design worth keeping

### Keyboard shortcuts

Complete list. There is no `commands` block in the manifest and no global shortcut anywhere.

| Key | Context | Action | Cite |
|---|---|---|---|
| `Enter` | note / comment composer | send | `note-cards.ts:361-364` |
| `Shift+Enter` | note / comment composer | newline | same |
| `Escape` | note / comment composer | cancel and close | `note-cards.ts:359` |
| `Enter` | in-card "Continue" box | send follow-up | `note-cards.ts:875-878` |
| `Shift+Enter` | in-card "Continue" box | newline | same |
| `Escape` | in-card "Continue" box | close the box | `note-cards.ts:873` |
| `Escape` | fullscreen note modal | close | `note-cards.ts:615-621` |
| `↑ ↓ PgUp PgDn Home End Space` | during a scroll glide, outside inputs | cancel the glide | `tree-panel.ts:43-51`, `:878-882`; `replies.ts:35`, `:354-357` |

**Documentation disagrees with the code here.** `README.md:84-85` and
`docs/test-checklist.md:110-111` say Ctrl/Cmd-Enter submits a note; the code sends on plain
`Enter` (`src/content/features/note-cards.ts:361-364`). `PROJECT.md:84` and
`CHANGELOG.md:216` agree with the code — plain Enter was introduced in v0.10.0 and the README
was never updated. **Trust the code.**

### Layout and sizing decisions, with reasoning

- **Panel: 280px full / 36px strip / hidden**, chosen purely by available space, requiring a
  ≥304px gap and a ≥1100px viewport (`tree-panel.ts:37-39`, `:402-413`). Reasoning: mode must
  never depend on conversation length — the earlier length-based rule collapsed the panel
  exactly when a new branch made the path short (`CHANGELOG.md:477-482`).
- **Gutter: 300px preferred / 200px minimum**, and when the margin cannot fit the minimum the
  gutter **hides entirely rather than overlapping** (`note-cards.ts:44-45`, `:691-705`). It
  also actively steps right of the composer when the composer is wider than the message
  column (`:686-690`). Reasoning is explicit: cards scroll past the input vertically, so any
  horizontal overlap intrudes (`:682-684`).
- **Cards: sort by anchor y, push down on collision, connector line back to the anchor**
  (`:767-788`, `:820-835`). Standard Google Docs margin-notes layout, and it works.
- **The open composer participates in the same collision layout** as the cards
  (`:776-779`) — so an open composer pushes cards down instead of overlapping them.
- **A three-tier z-index policy** stated once and obeyed everywhere: 20 in-scroll surfaces,
  30 panel and bars, 40 toasts and modals, all below the host's overlay layer at 50
  (`src/shared/tokens.ts:77-86`). Trivial to copy, saves a week of z-index whack-a-mole.
- **Bars above the composer are fixed overlays positioned against a measured rect, not
  inserted into the host's DOM** (`src/content/composer.ts:43-76`) — and they stack via a
  `liftPx` argument when both the draft banner and the branch header are showing
  (`src/content/features/branch-compose.ts:206-212`).

### Empty, loading, and error states

- **Empty:** the summarizer returns `"(empty)"` for a message with no text
  (`src/shared/summary.ts:39`). The panel renders nothing when there is no tree
  (`tree-panel.ts:566-569`). The unanchored drawer and deleted tray render **only when
  non-empty** (`tree-panel.ts:620`, `:631`) — no permanent empty-state chrome.
- **Loading:** a card's status line reads `sending` → `thinking` → (blank) and gets a `busy`
  class while in flight (`note-cards.ts:914-929`). The pending card is mounted *immediately*
  at the composer's position (`:461-476`). There are no skeletons anywhere.
- **Error:** one toast surface, at most once per id per page load, auto-dismissed by a CSS
  animation with removal on `animationend` — no timers (`src/content/toast.ts:91-115`). Every
  message names the broken dependency and what still works, e.g. the selector-validation
  toast lists exactly which hooks were not found (`src/content/index.ts:300-306`). Failed
  annotation sends render a failed card *and* toast the reason
  (`note-cards.ts:165-173`). Failed anchors show "anchor moved" inline (`:843-844`).

**The degradation philosophy is the most transferable thing in this section:** every module
header declares its failure behaviour explicitly (`src/shared/tree.ts:18-19`,
`src/shared/storage.ts:10-13`, `src/page/api.ts:14-16`, and so on for every file), and the
rule is uniformly *degrade one feature, never break the page*.

### What made it feel fast

- **Optimistic model application** before the network confirms (`src/shared/tree.ts:204-243`).
- **Composer-becomes-card in one frame**, reusing the composer's exact `top`
  (`note-cards.ts:369-373`, `:461-476`). This is the single nicest interaction in the app.
- **One rAF-batched observer for everything.** All DOM work in every feature runs inside one
  `MutationObserver` callback that merely schedules a frame
  (`src/content/observer.ts:1-33`, `:45-61`). The stated subscriber contract is worth
  quoting: ticks must be fast and **must not write a value that is already set**, so stable
  states settle with no further ticks (`:12-16`). Dirty-check writes are everywhere as a
  result (`tree-panel.ts:428-430`, `note-cards.ts:784-785`, `:831-834`).
- **No polling timers anywhere.** Scroll, resize, and visibility drive ticks; when the tab is
  hidden `requestAnimationFrame` does not fire, so idle CPU is ~0 (`observer.ts:5-8`, `:55-61`).
- **The render signature + summary memo** described in Part C.
- **Debounced draft autosave at 500ms** (`drafts.ts:84-85`) — the only debounce in the app,
  and the header comment is explicit that timers are never used for correctness anywhere
  (`src/shared/util.ts:2-5`).
- **`waitUntil` as a bounded, frame-driven condition wait** rather than a sleep — it runs only
  while awaited, only on animation frames, and always terminates (`src/shared/util.ts:37-59`).

### Built and never used / turned out unnecessary

- **`Summarizer` as a swappable interface** (`src/shared/summary.ts:10-13`, `:46-51`) — one
  implementation, ever. The seam cost nothing but bought nothing either.
- **`TreeNode.pending`** is written in two places and, as far as I can find, read nowhere
  (`src/shared/tree.ts:36`, `:238`, `:250`).
- **`SseResult.ok`** is computed carefully (`src/page/sse.ts:78`) and then ignored by the main
  consumer (`src/page/fetch-patch.ts:229-237`).
- **`DomMap.rowForElement`** does a linear scan over all rows for every call
  (`src/content/dom-map.ts:48-54`) and is invoked from a `mousemove` handler
  (`comments.ts:71`) — it works, but it is the kind of thing that exists because nobody
  measured.
- **Hover-to-highlight in the panel** was built in v0.11.0 and **removed in v0.11.1**
  (`CHANGELOG.md:118-121`, `:132-135`).
- **Edge centering** ("breathing room so the first and last entries can also be centered")
  was built in v0.9.0 and **reverted in v0.11.1** (`CHANGELOG.md:196-200`, `:124-128`).

### Theming, dark mode, accessibility

**Theming — `ADAPT`, but the technique is a genuinely good trick.** The host defines its
palette as CSS custom properties holding *raw HSL triplets*
(e.g. `--bg-100: 48 33% 97%`). Because custom properties **inherit across shadow
boundaries**, all extension CSS references them directly as
`hsl(var(--bg-100, <fallback>))`, so light/dark switches are applied by the CSS engine with
**no JS observers, no theme listeners, and no repaints of its own**
(`src/shared/tokens.ts:1-19`, `:88-93`). A bundled fallback palette keeps everything legible
if the tokens vanish (`:21-42`), and `validateTokens()` logs missing tokens once at startup
as a redesign detector (`:95-108`).

The generalizable lesson: **define your palette as CSS variables on `:root` and let shadow
roots / nested components inherit them.** Dark mode then costs zero JavaScript.

**Accessibility — thin but not absent.** Present: `:focus-visible` outlines defined once and
applied on every interactive surface (`src/shared/tokens.ts:72-75`, and per-component at
`tree-panel.ts:65`, `replies.ts:455`, `drafts.ts:365`); `role="status"` on the branch header
and draft banner (`branch-compose.ts:255`, `drafts.ts:371`); `role="dialog"` +
`aria-label` on the modal (`note-cards.ts:595`); `aria-label` on the panel chevron and toast
close (`tree-panel.ts:613`, `toast.ts:110`); `title` tooltips throughout.

Absent: no focus trap in the modal, no `aria-live` on streaming cards, no keyboard path to
the gutter buttons at all (they appear on hover/selection only), no skip links, and colours
inherited wholesale from the host with no independent contrast check.

---

## Part H — Scars

### Known bugs

1. **A rejected send leaves phantom nodes.** Repro: put the browser offline (or trigger a
   4xx) and send. `send-observed` fires *before* the request is forwarded
   (`src/page/fetch-patch.ts:207-216` precedes `:218`), so `applySend` has already inserted a
   human node and a pending assistant node (`src/content/index.ts:125-134`). On failure only
   `send-failed` is emitted (`src/page/fetch-patch.ts:219-222`), and the only listener re-arms
   branch mode (`branch-compose.ts:68-79`). Nothing removes the nodes. They persist in the
   panel until the next full tree load.
2. **An interrupted stream is stored as complete.** Repro: kill the network mid-response.
   `parseSseStream` returns `ok: false` (`src/page/sse.ts:79-82`); `handleCompletion` posts
   `stream-done` regardless (`:229-237`); `applyAssistantText(..., true)` clears `pending`
   (`src/shared/tree.ts:250`). Result: a truncated reply presented as finished.
3. **Concurrent annotation saves can clobber each other.** `saveNote` is read-modify-write of
   the whole per-conversation array (`src/shared/storage.ts:148-154`); two overlapping calls
   (e.g. `note-cards.ts:136` while `:569` is in flight) race, and the loser's change is lost.
4. **`streamBuffers` leaks on failure.** Entries are set on `send-observed`
   (`src/content/index.ts:132`) and deleted only on `stream-done` (`:150`). A failed or
   abandoned send leaves its buffer forever; nothing clears the map on navigation.
5. **The README documents a shortcut the code does not implement** (Ctrl/Cmd-Enter vs Enter —
   see Part G).

### Code that looks strange until you know why

Each of these is a scar with a real cause. Several of the *causes* vanish in your app; the
*lessons* mostly do not.

- **`ordered` rows are kept in DOM order unless the measurable ones are genuinely out of
  visual order** (`src/content/dom-map.ts:144-160`). Sorting unconditionally by
  `getBoundingClientRect().top` looks obviously correct — but `display: none` rows measure
  0×0 at the viewport origin and therefore all sort to the front, scrambling the map every
  tick and making the UI flicker (`CHANGELOG.md:202-209`). **Lesson that survives: hidden
  elements have position (0,0), not "no position".**
- **The row↔message alignment scores candidate offsets instead of requiring a full match**
  (`src/content/dom-map.ts:211-231`). A single row mounting with half-rendered text used to
  throw the whole window anchor back to offset 0 for one frame, making the highlight snap up
  the chat and back (`CHANGELOG.md:246-251`). **Lesson: when aligning two sequences that are
  both in flux, score, don't assert.**
- **Ties in that scoring resolve to the *latest* offset** (`:218`, `:222-230`) because chats
  open scrolled to the bottom.
- **The scroll container is found by `overflow-y` alone, deliberately *not* by
  `scrollHeight > clientHeight`** (`src/content/dom-map.ts:249-263`). A short conversation is
  not scrollable yet but is still the viewport; the earlier check fell through to the document
  and made every geometry consumer jump to the page edge (`CHANGELOG.md:344-348`).
- **Only `ev.isTrusted` input counts as typing** (`src/content/features/drafts.ts:175`). The
  host app restores its own composer text through editor machinery that fires *synthetic*
  input events, which used to dismiss the restore banner instantly and could rewrite the
  stored draft mid-initialization (`CHANGELOG.md:147-153`).
- **The "cleared tombstone"** (`src/shared/storage.ts:52-58`,
  `src/content/features/drafts.ts:388-408`, `:195-202`). Clearing a draft was not enough
  because the host re-inserts its own copy on reload with no banner to act on; so a dismissal
  is *recorded*, and on the next load the composer is re-emptied if and only if it contains
  exactly that text — rate-limited to 750ms so it never fights the editor frame by frame.
  Pure platform scar; `DISCARD`. But note the shape: **a tombstone is a record of a decision,
  not the absence of a record.** That idea generalizes.
- **Two independent mechanisms hide annotation rows** — one model-driven, one that reads the
  DOM text for a marker prefix as a "safety net for any alignment failure"
  (`src/content/index.ts:216-237`). Belt and braces after the same bug appeared twice
  (`CHANGELOG.md:387-390`).
- **The branch-arrow selector is a case-insensitive substring match on `aria-label` *or*
  `title`, deliberately scoped within one row** (`src/shared/selectors.ts:58-71`). An exact
  match broke silently when the host renamed the label, and every branch switch fell back to
  reload-based switching without saying so (`CHANGELOG.md:9-16`).
- **`contentElOf` descends up to 8 levels looking for the largest child that excludes the
  hover toolbar** (`src/content/dom-map.ts:74-109`). It exists so a click-highlight pulses the
  reply text and not the empty control space beneath it (`CHANGELOG.md:516-521`).
- **Input events are stopped (never `preventDefault`ed) at the shadow-host boundary**
  (`src/content/features/note-cards.ts:48-58`) so the host's document-level handlers cannot
  steal keystrokes, while the inputs still behave natively.
- **Fractions are rendered innermost-first in a `do/while` loop** and braced sub/superscripts
  are dissolved *before* fractions are parsed, so `\frac{V_{rare}}{N}` no longer has nested
  braces to break the `[^{}]` match (`src/shared/markdown.ts:48-57`, `:64-67`).
- **A `NUL` byte is used as the placeholder delimiter** when stashing code/math spans during
  inline markdown processing, because it cannot occur in HTML-escaped text
  (`src/shared/markdown.ts:84-91`).

### Abandoned approaches and reverted work

Reconstructed from git history and the changelog; there are no dead files or commented-out
blocks in `src/`.

| Approach | Why dropped | Cite |
|---|---|---|
| **Notes as real side branches** (v0.1.0–0.4.0) | Branches polluted the host's native `‹ 1/2 ›` counters and the tree. Replaced with hidden in-thread messages, accepting that notes enter the model's context — an explicitly user-approved trade-off. **Old notes were never migrated.** | `CHANGELOG.md:411-428`, `README.md:135-140` |
| **Leaf PUT + page reload as the primary branch switch** | Confirmed by captures, but reloading was too disruptive in field testing. Demoted to fallback in v0.2.0. | `docs/recon-report.md:89-102`, `CHANGELOG.md:549-559` |
| **Inserting bars into the host's own alert band** (v0.5.0) | React reconciliation dropped the foreign nodes. Replaced with a fixed overlay aligned to the band's measured rect. | `src/content/composer.ts:43-47`, `CHANGELOG.md:385-387` |
| **Preferring the alert band's rect unconditionally** (v0.5.0–0.11.x) | The band began rendering as a zero-width placeholder, so bars measured 0 width and stayed invisible. Now the band is used only when it has width. | `src/content/composer.ts:59-65`, `CHANGELOG.md:107-114` |
| **Glide v1: absolute target from client rects** (v0.8.1) | Mixed visual coordinates (transform-distorted) with scroll coordinates; jumps landed wrong. | `CHANGELOG.md:264-273` |
| **Glide v2: absolute target from the `offsetTop` chain** (v0.8.2) | Layout offsets are exactly the "assumed positions" a virtualizer invalidates when it repositions rows. | `CHANGELOG.md:222-231` |
| **Glide v3: per-frame relative delta** (v0.8.4) | **This is the one that worked.** | `src/content/features/tree-panel.ts:849-972` |
| **Unconditional visual-order row sorting** (v0.8.4) | Broke branch preview (see above); made conditional in v0.9.0. | `CHANGELOG.md:202-209` |
| **Panel hover highlighting** (v0.11.0) | Removed one version later; highlight follows scroll only. | `CHANGELOG.md:118-121` |
| **Edge centering / list breathing room** (v0.9.0) | Reverted in v0.11.1 in favour of clamping at the scroll limits. | `CHANGELOG.md:124-128` |
| **"Collapse the panel below 4 messages"** | Kicked in whenever a new branch made the path short. Modes are now purely space-driven. | `CHANGELOG.md:477-482` |
| **A `main` landmark selector** | The host stopped rendering one and nothing consumed it; removed rather than emitting a permanent false warning. A comment marks the grave. | `src/shared/selectors.ts:84-86`, `CHANGELOG.md:540-544` |
| **Note instructions forbidding formatting** | Produced flat prose answers with nothing to render; rewritten to request normal markdown. | `CHANGELOG.md:52-58`, `src/shared/note-protocol.ts:17-22` |
| **Separate composer for "Continue"** | Read as a brand-new note; moved inside the card. | `CHANGELOG.md:214-217` |

### Every TODO / FIXME / HACK / XXX

**There are none.** A grep for `TODO|FIXME|HACK|XXX|@ts-ignore|eslint-disable` across `src/`
and `build.mjs` returns zero matches.

Two things are labelled `KNOWN LIMITATION` in module headers, and both still apply:

| Marker | File:line | Still applies? |
|---|---|---|
| Assistant rows have no dedicated `data-testid`; classification is an action-bar heuristic that degrades if the toolbar is restructured | `src/content/dom-map.ts:18-22` | **Yes** — still listed as an open gap at `docs/recon-report.md:142-147` |
| Files removed from the composer after capture cannot be observed, so a restored draft may offer files the user removed | `src/content/features/drafts.ts:25-28` | **Yes** — `README.md:147-151` |

**Stale documentation found while extracting** (the disagreements are themselves useful):

- `docs/recon-report.md:132` still says the branch arrows are "registered for diagnostics;
  not clicked", and §5 at `:85-87` still records the original "do not simulate arrow clicks"
  directive. The code has driven those arrows as its *primary* mechanism since v0.2.0
  (`src/content/branch-switch.ts:54-123`). The deviation *is* documented at
  `docs/recon-report.md:89-102`, but the table above it was never updated.
- `docs/recon-report.md:132` also lists the exact-match arrow selector that v0.12.2 replaced
  (`src/shared/selectors.ts:58-71`).
- `docs/recon-report.md:135` lists the `main` landmark hook that was deleted from the registry
  (`src/shared/selectors.ts:84-86`).
- `README.md:84-85` and `docs/test-checklist.md:110-111` document Ctrl/Cmd-Enter for note
  submission; the code uses plain Enter.
- `docs/architecture.md:104` omits `replies` from the settings record, which has had six keys
  since v0.12.0 (`src/shared/storage.ts:62-69`).

### Fights with the platform that simply do not exist for you

Every one of these is `DISCARD`, and together they are roughly a third of the codebase:

1. **Reading your own data out of someone else's network traffic** — the entire `page/` tier,
   744 lines (`src/page/fetch-patch.ts:1-23`).
2. **Mapping rendered DOM back to message identity** because the DOM carries no ids —
   `dom-map.ts`, 265 lines including the virtualization window-anchoring
   (`src/content/dom-map.ts:1-23`, `:190-241`). You will render from your own data; the row
   *is* the message.
3. **Smuggling annotation metadata through a prompt string** with a marker, a JSON line, and
   `---` fences (`src/shared/note-protocol.ts:44-49`). You have a database and a filesystem.
4. **Lying to the host about where a thread ends** so hidden messages do not break its
   requests — `syncThreadTails` plus the page-side remap, ~120 lines
   (`src/content/index.ts:78-107`, `src/page/fetch-patch.ts:188-201`, `:264-298`). Including
   the specific server error it exists to avoid: PUTting a leaf that still has children is
   rejected with "Current leaf message has unexpected children"
   (`src/page/fetch-patch.ts:279-281`).
5. **Hiding messages that the host insists on rendering** — two independent mechanisms
   (`src/content/index.ts:216-237`).
6. **Clicking someone else's buttons to make their React state update**, with event-driven
   waits and a reload fallback (`src/content/branch-switch.ts:54-156`).
7. **Fighting the host's composer**: `execCommand("insertText")` with a synthetic-paste
   fallback, synthetic drag-and-drop for file reattachment, select-all-and-delete to clear
   (`src/content/composer.ts:99-150`, `:83-97`).
8. **A selector registry with runtime validation and per-feature self-disabling** because the
   host's DOM can change under you at any time (`src/shared/selectors.ts:1-12`, `:110-126`).
9. **Shadow DOM everywhere plus event isolation** to keep the host's global handlers out
   (`src/content/features/note-cards.ts:48-58`).
10. **A z-index policy negotiated against someone else's overlay layer**
    (`src/shared/tokens.ts:77-86`).
11. **Re-installing your own stylesheet every tick** in case the host purges it
    (`src/content/styles.ts:81-86`, `src/content/index.ts:213`).

---

## Part I — Recommendations for the rebuild

**This part is opinion, clearly separated from the factual extraction above.**

### What to build first, in order

1. **The message tree and the active path.** `Message { id, parentId, role, text, createdAt,
   status }`, a `Map`, derived children, `activePath()` by walking parents from
   `activeLeafId`. Port `activePath`, `siblingsOf`, and `latestLeafUnder` almost verbatim
   from Part D. Do this before you render anything. If you get this wrong, everything above
   it is wrong; if you get it right, branching is nearly free later.
2. **Persistence and the file layout** (my proposal below), plus a `schema:` version field
   from commit one. Write a loader that reads a directory of message files into the tree and
   a writer that appends one file. Test round-tripping before building UI.
3. **A linear chat that renders `activePath()`** with client-minted UUIDv7 ids and optimistic
   append. No branching UI yet — but the data model already supports it. Get streaming and
   the `status` transitions right here, including the failure path, because that is where
   this codebase has its two real bugs.
4. **Branch creation and switching.** Given (1), this is: "send with `parentId` = target's
   parent" and "set `activeLeafId = latestLeafUnder(sibling)`". Then the sidebar UI for it:
   section headers at branch points, numbered alternatives, collapse past two.
5. **The sidebar**, with the pair model, the render-signature guard, and the current-message
   tracking rules from Part C. Skip the glide initially — if you do not virtualize,
   `scrollIntoView` is enough. Add relative-delta stepping only when you virtualize.
6. **Annotations**, last, and only after messages are stable. Port `text-match.ts` and
   `findQuote` wholesale. Store one file per annotation with `targetMessageId` + quote +
   prefix/suffix/offset.

Deliberately last, or never: attachments, drafts beyond a `localStorage` string, and search.

### What to leave behind

- The entire `page/` tier and everything about interception.
- `dom-map.ts` in its entirety.
- `note-protocol.ts` — the marker/JSON/fence smuggling format.
- `syncThreadTails` and the thread-tail remapping.
- `branch-switch.ts` — both adapters.
- `composer.ts` — every host-composer manipulation.
- `selectors.ts`, `tokens.ts` (keep only the z-index tier idea), and all CSS-in-TS.
- `markdown.ts` — you are in a Next.js app; use `remark`/`react-markdown` with a sanitizer.
  Keep one idea only: **stream as plain text, render as markdown once complete**
  (`note-cards.ts:963-964`). It avoids half-parsed tables and it looks intentional.
- The draft "cleared tombstone" machinery — you own the composer, so clearing clears.

### What to build differently for markdown files, server-side model calls, and Next.js

**File layout — my recommendation:**

```
conversations/
  <conv-id>/
    conversation.md         # front matter: id, title, activeLeafId, schema, createdAt
    messages/
      019f3e54-….md         # front matter: id, parentId, role, status, createdAt, model
                            # body: the message text, verbatim markdown
    annotations/
      019f3f71-….md         # front matter: id, targetMessageId, quote, prefix, suffix,
                            #   charOffset | anchorText, offsetRatio, deleted, createdAt
                            # body: the annotation's own question/answer thread
```

**One file per message, not one file per thread**, for four reasons drawn from what this
codebase does and does not do:

1. A branch becomes an *added* file rather than a modified one. Git diffs stay readable and
   merges stay possible; with one file per thread, two branches from the same point are a
   guaranteed conflict in the same region.
2. Messages are immutable once complete, which is the ideal property for one-file-per-record.
   The only high-churn field in the system, `activeLeafId`, is isolated in a tiny file.
3. UUIDv7 filenames sort chronologically in any directory listing, so `ls` is a timeline for
   free (`src/shared/uuid.ts:1-10`).
4. Streaming writes touch exactly one small file repeatedly instead of rewriting a growing
   thread file on every chunk. **Do not commit while streaming** — write, finalize, then
   commit.

**Server-side model calls change one thing that matters:** mint the message id *before* the
model call, return it to the client immediately, and stream into that known id. That is the
same insight the client-generated `turn_message_uuids` gave this extension
(`docs/recon-report.md:51-56`) — and you get it by construction rather than by luck.

**Next.js specifics:** the tree is small and derived, so keep it in one client-side store
hydrated from a server read; make branch creation, leaf switching, and annotation writes
server actions that own the filesystem; treat the files as truth and the store as a working
copy, exactly the layering at `docs/architecture.md:95-98`. Do **not** put `activeLeafId` in
the URL unless you want branch switching in browser history — that is a product decision, but
note that this extension's "which branch am I on" state is server-side and shared, which is
why a second device sees the same branch.

**Annotations should live in the same store as messages, not beside it.** The split-brain
design here is directly responsible for annotations that show on one device and not another
(`docs/architecture.md:121-126`). One file per annotation, in the same repo, and the problem
does not exist.

### The two or three decisions most likely to be regretted if made carelessly

1. **Storing `children[]` on the parent instead of `parentId` on the child.** It looks
   equivalent and it is not. Derived children mean appending a message never modifies an
   existing file — no rewrite, no lost-update race, no git conflict on the parent. This
   codebase derives (`src/shared/tree.ts:110-116`) and never regretted it. **The
   file-per-record model makes this decision much more expensive to reverse than it was here.**
2. **Making "edit", "branch", and "regenerate" three different operations.** They are one
   operation — append a child to some node, move the leaf — and the moment they diverge in
   your code you will have three subtly different sets of bugs. The clarity of this codebase
   on that point (`docs/recon-report.md:45-50`) is not an accident of the host's API; it is
   the correct model.
3. **Designing annotation anchoring as "message id + character offset".** It is the obvious
   design and it breaks the first time a message is edited or re-rendered. The quote +
   prefix/suffix + offset *scoring* approach (`anchoring.ts:101-127`) with dense matching
   (`text-match.ts:44-75`) is barely more code and survives reflow, whitespace differences,
   and markdown-vs-rendered mismatch. Retrofitting it later means re-anchoring every
   annotation you have already stored.

A fourth, smaller: **decide your deletion semantics before you ship, because this codebase
never did.** My recommendation, given git-backed storage: refuse hard deletion of a message
with children; offer soft-delete (tombstone the file's front matter, keep the body) for
leaves; and for annotations copy the soft-delete-plus-restore-tray behaviour verbatim
(`note-cards.ts:557-579`) — it was clearly the right call in daily use. Git already gives you
undo; do not build a second undo system on top of it.

---

## Part J — Things you did not ask about

1. **The module-header convention is the best documentation practice in this repo.** Every
   file opens with what it owns and — crucially — **a stated "Failure behavior:" paragraph**
   (`src/shared/tree.ts:18-19`, `src/shared/storage.ts:10-13`, `src/page/api.ts:14-16`,
   `src/content/observer.ts:16-17`, and so on for all 27 source files). Reading this codebase
   cold was fast *because of* that convention. It costs four lines per file. Adopt it.

2. **The single-observer discipline.** One `MutationObserver` on `documentElement`, filtered
   to four attributes, whose callback only schedules a rAF; every feature subscribes to that
   one tick (`src/content/observer.ts:45-61`, `:22-33`). The subscriber contract — *never
   write a value that is already set, so stable states settle* (`:12-16`) — is what makes it
   work. Even though you have React, the discipline generalizes: **one scheduler, dirty-check
   every write, and idle means zero work.**

3. **A quote-reply feature you did not ask about, and should probably want.** When a user
   quotes an earlier message, `replies.ts` recognizes it *from the data model* (a message
   whose leading blockquote is found in an earlier message on the path), marks the quote with
   a clickable bar, shows the source's **original formatting** on hover, and jumps to the
   exact span on click (`src/content/features/replies.ts:1-24`). The recognizer is small and
   `PORTABLE`:

```ts
/** Leading blockquote of a message → the quoted passage (markers stripped). */
export function parseQuoteReply(text: string): string | null {
  const lines = text.split("\n");
  const quoted: string[] = [];
  let i = 0;
  while (i < lines.length && /^\s*>/.test(lines[i]!)) {
    quoted.push(lines[i]!.replace(/^\s*>\s?/, ""));
    i++;
  }
  const quote = quoted.join("\n").trim();
  return quote ? quote : null;
}
```
   (`src/content/features/replies.ts:48-59`.) The source lookup is the nearest earlier message
   on the path whose *markdown* contains the quote, matched markdown-insensitively on both
   sides (`:141-157`). The cheap-exit discipline is worth copying too: the overwhelming
   majority of conversations have no quote-replies, so the feature tears down its overlay
   entirely rather than idling (`:191-202`), and recomputation is gated on a structural
   signature (`:120-122`).

4. **The CSS Custom Highlight API** styles arbitrary text ranges with **zero DOM mutation** —
   `CSS.highlights.set(name, new Highlight(...ranges))` plus a `::highlight(name)` rule
   (`src/content/features/replies.ts:322-334`, `src/content/styles.ts:71-78`). In your app you
   *could* wrap spans, but you will discover that wrapping breaks text selection across the
   boundary and fights your markdown renderer. This API does not. Feature-detected here, and
   worth knowing exists.

5. **`Summarizer` as a seam, done right** (`src/shared/summary.ts:10-13`, `:46-51`): an
   interface, a pure local implementation, a mutable module-level binding, and a setter. Never
   used — but in *your* app, where an LLM call is a server action away, one-line message
   summaries for the sidebar are actually reachable. The local `stripMarkdown` +
   first-N-words implementation (`:16-44`) is a perfectly good v1 and is `PORTABLE` as-is.

6. **`build.mjs` generates the PNG icons programmatically** with a hand-rolled CRC32 +
   deflate PNG encoder, so no binary assets are committed (`build.mjs:48-90`). Over-engineered
   for the problem, genuinely nice as a "keep the repo text-only" principle — which happens to
   be exactly your app's thesis.

7. **The `waitForBusEvent` pattern** (`src/content/ctx.ts:87-112`): act, then await the
   *observable consequence* with a timeout as a **failure guard, not a schedule**. The
   codebase is emphatic that timers are never used for correctness
   (`src/shared/util.ts:2-5`, `src/content/ctx.ts:87-91`), and it shows — there is not one
   `setTimeout(…, 300)` "wait for it to settle" in the whole app.

8. **Feature construction with explicit dependency ordering and per-feature try/catch**
   (`src/content/index.ts:246-268`): each constructor is a closure in an ordered array, later
   ones receive earlier instances, and a thrown constructor skips exactly one feature. A
   lightweight DI pattern worth remembering when you have six subsystems and no framework.

9. **`docs/test-checklist.md` (254 lines) is the entire test suite.** There are no automated
   tests in this repo. Given how much of the behaviour is geometric and host-dependent, that
   was arguably the right call *here* — but in your app the tree model, the active-path
   derivation, and the anchoring math are all pure functions over plain data. **They are
   trivially unit-testable, and they are exactly the parts where a silent bug is most
   expensive.** Test those three; leave the rest to a checklist if you like.

---

## Part K — Questions for me

Written against explicit assumptions; none of these blocked the extraction.

1. **Does your chat tab need branching at all in v1, or is this aspirational?**
   *Assumption:* yes, since Part D was flagged as the most important section. *If not:* build
   the tree model anyway (it costs nothing over a list) but skip the sidebar branch UI, the
   sibling ordering, and `latestLeafUnder` entirely.

2. **Is the git repo synced between machines or shared with anyone?**
   *Assumption:* single-user, possibly multi-machine, no concurrent writers. *If concurrent
   writers or merges are real:* one-file-per-message becomes more important, not less, and
   `activeLeafId` needs a conflict policy — my instinct would be "last write wins, and it is
   fine because it is a view pointer."

3. **Do you want conversation history in git history, or is the repo just the storage
   medium?** *Assumption:* it is the storage medium and you commit deliberately, not per
   message. *If you auto-commit per message:* do not commit during streaming, and consider
   whether an amend-on-finalize flow is worth it.

4. **Are messages ever edited in place after completion?** *Assumption:* no — an edit creates
   a sibling, as in this codebase (`docs/recon-report.md:45-50`). *If yes:* your annotation
   anchors need the durability work this codebase never did (Part E), and you need a version
   history per message, which is a materially different data model.

5. **Are annotations meant to be visible to the model?** This codebase was forced into "yes"
   by the storage medium and treated it as a trade-off requiring user approval
   (`CHANGELOG.md:421-424`). *Assumption:* you want the opposite — annotations as private
   marginalia, excluded from context by default. *If you want them in context:* that is a
   per-annotation flag, and it should be a deliberate user choice, not a storage accident.

6. **Roughly how long are your conversations?** *Assumption:* tens to low hundreds of
   messages, so you can render the whole path without virtualizing. *If thousands:* you need
   virtualization, and then the relative-delta glide (`tree-panel.ts:849-972`) stops being
   optional and the file-per-message read path needs an index rather than a directory scan.

7. **Does the task manager's own domain model touch chat?** — i.e. does a message ever
   reference a task, or a task reference a conversation? Nothing in this extraction addresses
   that, and it could change the file layout substantially (a conversation living *inside* a
   task's directory rather than in a global `conversations/`). *Assumption:* they are
   separate for now, with a reference field added later.
