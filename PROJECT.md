# Attune — build specification

A personal to-do and scheduling app, run locally, whose entire state is plain files in a private git repository. An assistant is part of the interface: it creates and edits tasks, answers questions, maintains a knowledge base, and can modify the app's own code.

This file is the complete specification. `BUILD_PROMPT.md` is the brief it was written from; `HANDOFF-CHAT.md` is a reference extraction from an earlier project and is cited here for code to port rather than restated. Where this file and the brief differ, this file wins, and the difference is listed under Decisions. Both of those files are private: `npm run publish` drops them together with `data/` (§12), so a public clone has only this file and `AGENTS.md`. The spec stands without them; the handoff citations are a convenience on the owner's machines.

---

## Decisions

Every call the brief left open, or where this spec deviates from it. One line of reasoning each. Decisions 34–44 were added after review rounds on 2026-09-03; 45–49 during the Phase 2 build the same day.

**Data model**

1. **No per-day file (`data/days/`).** Ordering lives entirely in the ranking function; the manual override is the task's own `scheduled` field, which may carry a time. A second ordering source of truth would need its own undo semantics and would fight the ranker.
2. **Recurring tasks: yes, minimal.** A `repeat` field; completing an instance materializes the next one in the same batch. No virtual instances, so ranking, calendar, and undo see only real files.
3. **Subtasks are checkboxes in the body.** Separate files would turn one problem set into six ranked rows. The row shows `2/4` progress from the body.
4. **Dropped the brief's `blocked_by`.** Nothing in v1 reads it; a field no code consumes is a field that rots. Add it when a scheduler needs it.
5. **Kept `createdBy`** even though the action log also records the actor. It is the one place the fact is visible when reading the file in a text editor.
6. **Added `repeat`, `source`, and `collection` to tasks; added `tasks` to collections.** `source` records the prompt or conversation that produced the task; `collection` and `tasks` are the two ends of the promote-to-task link.
7. **Task filenames are fixed at creation.** Changing `due` does not rename the file. Renames churn git and break links; the date prefix is a hint, not an index.
8. **Message deletion:** hard delete is refused for any message with children. Leaves soft-delete (`deleted: true` in frontmatter, body kept). Childless *failed* assistant messages may be hard-deleted because they never held content worth keeping. Conversation deletion removes the directory as one batch, recoverable through git.
9. **No message index file.** A directory scan of a few hundred small files is milliseconds. If a conversation ever needs thousands, add `messages.index.json` then, not now. **What stands in for the index is the filename order**, so this decision depends on Decision 61: a sorted listing is a timeline only because `uuidv7()` is monotonic.
10. **Chats in the graph: one node per conversation, never per message.** Conversation nodes are on by default; edges come from task ids and `data/` paths referenced in messages.
11. **`activeLeafId` changes are ordinary logged, committed actions** (`chat.update`). Consistency with "everything is reversible" wins over commit noise; the history view hides this type by default.
12. **Schema version on every frontmatter record from the first commit** (`schema: 1`). Cheapest possible insurance.

**Behavior**

13. **Weather provider: Open-Meteo.** Terms confirmed 2026-09-03: free for non-commercial use, no key, 10,000 calls/day, CC-BY 4.0 attribution. The Settings weather section carries the attribution. Forecasts are cached server-side for 30 minutes.
14. **The + button becomes the close affordance** while the sheet is open (rotates to ×). One element, one position, no reflow.
15. **`Ctrl/Cmd+Z` outside a text field opens the history sheet with the latest batch focused; it does not undo instantly.** A silent undo of a six-task batch is worse than one extra keypress.
16. **Build mode "Plan first" has two gates, and the diff is real.** Gate 1: the agent runs in `plan` permission mode and returns a plan; you approve or reject. Gate 2: the agent applies the plan to the working tree with `acceptEdits`, you see `git diff`, and you commit or revert. The brief says "nothing is written until I approve"; files *are* written between gate 1 and gate 2 but nothing is committed, and revert is one click. Showing a genuine diff without writing would need a second checkout, which is not boring.
17. **Ask-mode prompts from the floating composer create real conversations** under `data/chats/` so they appear in the Chats panel. Tasks-mode prompts are ephemeral; the prompt text is preserved in the batch's log entry.
18. **Session summaries are made on demand** ("Distill to knowledge" in the conversation menu), not automatically. Automatic distillation would write knowledge nobody reviewed.
19. **Per-device UI state lives in `localStorage`**, not `settings.json`: active panel, expanded folders, scroll positions, sidebar collapse, composer drafts. A collapsed sidebar on one machine is not user data. Settings that are yours (name, timezone, models, theme choice) live in `settings.json` and sync.
20. **External file edits are picked up on the next request plus a refetch on window focus.** No filesystem watcher in v1.
21. **`npm run dev` is a thin wrapper script around `next dev`** so the push flush on shutdown is guaranteed by the parent process rather than by Next internals.
22. **Publishing uses two remotes.** `origin` is the private repo with `data/`; `npm run publish` builds an orphan `public` branch without `data/` and force-pushes it to a `public` remote. The brief specifies `publish-check` but not the mechanism; this is the smallest one that keeps the two repos honest. Confirmed in Decision 35.

**Assistant**

23. **Default model `claude-opus-5`, effort `high`, adaptive thinking (SDK default, nothing sent).** Task extraction defaults to the same model at effort `medium` rather than a cheaper model: same cache namespace, lower cost, one prompt-caching story. Change it in Settings if you want a cheaper model.
24. **One conversation loop, three tool sets.** Tasks, Ask, and knowledge proposals all run through `runChatTurn()`; modes differ only in system prompt and which tools are offered. Proposals (`propose_tasks`, `propose_knowledge_write`, `propose_collection_append`) are collected, never executed, and shown in the preview panel.
25. **Knowledge retrieval is a tool the model calls** (`read_knowledge(path)`, `search_knowledge(query)`), not a retriever we build. `index.md` and `profile/` are always in the system prompt; everything else the model asks for by path.
26. **Refusal fallbacks are not wired in v1.** A to-do app is unlikely to trip a safety classifier; if it does, the message fails visibly and can be retried on another model.
27. **Structured output through the SDK's `output_config.format` + `zod`** for anything that must be a fixed shape, sent over `messages.stream` and read off `finalMessage().parsed_output`. Zod also validates settings and frontmatter, which is why it earns a dependency slot. **It is not `messages.parse`, and the reason has to stay written down here.** `parse` is non-streaming, and the installed client refuses a non-streaming request *client-side, before any network call*, once `max_tokens` exceeds `128000 / 6 ≈ 21333` — see `calculateNonstreamingTimeout` in `@anthropic-ai/sdk`. §13.2 sets `max_tokens: 64000`, so `parse` throws on every call at that ceiling, with a valid key or without one. `stream` carries the identical `output_config.format` and returns the identical `parsed_output` with no ceiling, so nothing is given up. Anyone reading this Decision, seeing `messages.stream` in `lib/agent/anthropic.ts`, and taking it for a slip would reintroduce a total outage. **And it would not be caught:** every offline test passed while `runExtract` was broken this way, because a scripted fake provider never reaches the client that does the refusing. It surfaced only from a live call made with a deliberately invalid key (Phase 5 Stage A review, item 6).

**Stack**

28. **Runtime dependencies (8 of 12):** `@anthropic-ai/sdk`, `@anthropic-ai/claude-agent-sdk`, `marked`, `dompurify`, `katex`, `yaml`, `d3-force`, `zod`. Frontmatter splitting is ten lines on top of `yaml`; UUIDv7 is ported from the handoff; git is shelled out to; search is a scan; drag and drop is native.
29. **Tests use `vitest`** (dev dependency, not budgeted). Node's built-in runner would need extension-suffixed imports that Next code does not use.
30. **Tree math, text matching, and anchoring live in `lib/chat/`**, a directory the brief's layout did not have, because they must be pure, importable from both server and client, and unit-tested without a DOM.
31. **Markdown pipeline is `marked` → math pre-pass with `katex` → `dompurify`.** Math spans are stashed behind NUL placeholders before `marked` runs and rendered by KaTeX after, the same trick the handoff uses for code spans.
32. **Units default to Fahrenheit and first day of week to Monday.** Fahrenheit because the seed location is New York; Monday because it is a school planner. Both are one-line settings. Confirmed in Decision 36.
33. **This file is long.** Hard rule 5 caps *source* files at ~300 lines; the brief asks for a spec someone can build from alone. It is one file because the brief asked for exactly two.

**After the first review (2026-09-03)**

34. **Priority weights are `{1: 11, 2: 6, 3: 2, 4: 0}`**, up from `{8, 5, 2, 0}`. With urgency capped at 10, the old weights let any near deadline beat any importance: a someday errand due tomorrow outranked a critical task with no date. Now a critical undated task (11) beats a someday task due tomorrow (9), while a high-priority task due tomorrow (9 + 6) beats both. Urgency and importance interleave instead of one always winning.
35. **Two-remote publishing with a squashed `public` branch: yes.** Public history would either leak the private repo's commit messages, which name personal tasks, or need a rewritten history on every publish. A single `Publish` commit per release is honest about what the public repo is: a snapshot.
36. **Fahrenheit and Monday stay the defaults.** Both are one-line settings and the first-run card makes them visible.
37. **Ask-mode conversations started from the floating composer are listed in the Chats panel like any other.** A hidden class of conversations is a second concept for no gain; a quick question that turns out to matter should already be findable.
38. **The public seed ships with weather off.** `seed/settings/settings.json` has `weather.query: ""` and no coordinates; the first-run card asks for a location. The timezone stays `America/New_York` because the brief names it as the shipped default and the first-run card confirms it. A stranger's clone should not fetch New York weather until they ask for it.
39. **The pre-commit hook path is installed by an npm `postinstall` script, not by `npm run init`.** `init` refuses to run when `data/` is non-empty, which is every clone of the private repo, so hook setup inside `init` would silently never happen on a second machine. `postinstall` runs on every `npm install`.
40. **Frontmatter keys are camelCase everywhere**, matching the TypeScript field names exactly. The first draft had tasks, notes, and collections in snake_case and chats in camelCase. One convention means no mapping layer at the store boundary and no guessing when hand-editing a file.
41. **`npm run publish` drops `BUILD_PROMPT.md` and `HANDOFF-CHAT.md` alongside `data/`.** The handoff documents a separate private project and the brief carries the owner's repo, timezone, and location. `PROJECT.md` and `AGENTS.md` stay public and stand without them. `publish-check` greps the published file set only, so if `BUILD_PROMPT.md` ever trips the AI-authorship grep the fix is that it should not be in the set, not a longer skip list.
42. **Line endings are LF on every platform.** `.gitattributes` says `* text=auto eol=lf`, and the store normalizes CRLF to LF before writing. `text=auto` alone checks out CRLF on Windows while Node writes LF, so app-rewritten files end up mixed, and `git diff --exit-code` normalizes before comparing, so a byte-for-byte check could pass while the bytes on disk changed. Byte-for-byte acceptance checks therefore compare SHA-256 hashes, never `git diff`.
43. **The shutdown push flush is owned by `scripts/dev.mjs` alone and is synchronous.** Windows has no `SIGTERM` and `Ctrl+C` can orphan a child tree, so the wrapper handles `SIGINT`, `SIGBREAK`, and `SIGHUP`, kills the child tree (`taskkill /T /F` on Windows, `SIGTERM` elsewhere), then runs `git push` through `execFileSync` before exiting, because Node's `'exit'` event cannot await anything. `instrumentation.ts` does not push on `beforeExit`; one owner, one path. The pre-commit hook is a `#!/bin/sh` script with LF endings and the executable bit set in the index, which is what Git for Windows needs to run it.
44. **Node's type stripping is load-bearing, so `lib/` avoids every TypeScript feature that needs code generation.** The CLI scripts import `lib/**/*.ts` through plain Node, which strips types and runs the result rather than compiling it. No `enum`, `const enum`, `namespace`, or parameter properties (`constructor(private x)`) anywhere under `lib/`; all four need emitted runtime code and Node refuses them. The trap is not the error message — Node 24 names the feature (`TypeScript enum is not supported in strip-only mode`) — it is *when* the message arrives: `tsc` and `next build` accept all four, so the failure surfaces only once a CLI script runs, long after the code looked correct. `--experimental-transform-types` would compile them, but it would have to be passed on every script invocation forever to buy back features the project does not need. Two settings keep the seam explicit: `allowImportingTsExtensions` with a `.ts` extension on every `lib/`→`lib/` import, because Node will not resolve an extensionless specifier, and `verbatimModuleSyntax`, so a type-only import is spelled `import type` and stripping is never a judgment call.

**During Phase 2 (2026-09-03)**

45. **`ATTUNE_REPO_DIR` overrides the checkout the app reads and writes.** Unset — every normal run — `REPO_DIR` is the working directory and nothing changes. Set, it points `DATA_DIR` and every git command at another tree, which is what lets the Phase 2 acceptance checks create, undo, and redo real batches in a throwaway repository instead of the owner's, and what will let Phase 6's store round-trip test run against a temp directory. Four lines in `paths.ts`, one environment variable, no test-only branch anywhere in the code it exercises.
46. **Two files were added to the §3 layout: `lib/history/actions.ts` and `lib/store/manifest.ts`.** `actions.ts` holds the `ActionSpec` builders. They cannot live in `lib/store/`, because a store that imported history types would close a cycle, and they cannot live in the routes, which §14 keeps to ten lines of adapter. `manifest.ts` is the uploads directory and its generated table, split out of `files.ts` when the action log's append primitives pushed that file toward the 300-line cap; the split is by feature — generic file access versus upload policy — not by layer.
47. **The commit hash is backfilled one batch late, which keeps the working tree clean.** A batch appends its log lines with `commit: null` and then never touches `data/` again; the *next* batch fills that hash in before appending its own, inside the `runBatch` that commits the result. Every write under `data/` is therefore made by the batch that commits it, and `git status -- data` is empty between batches. The backfill takes the newest run of `commit: null` lines, grouped by batch id, and stamps **only the last group**, and only when `git log -1` shows HEAD's subject equal to that batch's `<prefix>: <summary>` — one git call per batch, never one per line. An older null-commit batch stays null forever, which is correct: it either ran with `commit: false` or its commit failed, and a wrong hash is worse than a visible gap, because a gap is recoverable and announces itself. Both cases are marked where they happen — `meta.noCommit`, or `meta.commitFailed` with `meta.commitError` — so every null in the log says why it is null and §7.5 reads the reason instead of inferring it. The cost is that the newest batch's hash is outstanding until the next batch runs. It is recoverable from HEAD, and `undoBatch` does exactly that under the same subject guard, so a `{git: true}` snapshot on the newest `code.change` is still restorable. The rejected alternatives were amending the commit, which races the debounced push, and resolving hashes with `git log --grep`, which costs one git call per mirror line on every regeneration.
48. **`undo` and `redo` join the commit-prefix vocabulary.** §8 lists seven prefixes for kinds of data; §7.2 specifies the message `undo: <original summary>`. Both are right — a reversal describes a history operation rather than a kind of file — so `BatchSpec.commitPrefix` accepts nine values and the mirror renders the two new ones as `· undo ·` and `· redo ·` with `↶` and `↷`.
49. **`npm test` runs `scripts/check-lib-imports.mjs` before vitest.** It imports every `lib/**/*.ts` through plain Node and fails naming each module that will not load. Decision 44 records the constraint; this is what makes it fail at test time rather than at the first CLI run, which is otherwise the earliest anything notices, because `tsc --noEmit` and `next build` both accept all four forbidden features. Verified by adding an `enum` under `lib/`: `tsc` exited 0, `npm test` exited 1.
50. **A batch that would write a credential into `data/` is refused whole, before anything is logged, and the write path and the pre-commit hook share one pattern set.** A secret in a task's own text does not reach `actions.jsonl` through the error path — it reaches it through the snapshot, which is written before git is ever called. Scrubbing is not available there: snapshots exist to restore files byte for byte, and a redacted snapshot restores the wrong file. So `runBatch` scans what it is about to log, and on a hit rolls back and refuses. The alternative was letting the write through and relying on the hook, which is what produced the deadlock this closes: the log is append-only and committed, so a credential in it is found on the *next* commit and refuses every commit after that, and undo makes it worse by snapshotting the same text again. `SECRET_PATTERNS` in `lib/security/secrets.ts` is the single list both sides use — **anything the hook would refuse, the write path refuses first** — and relaxing one side alone reopens the deadlock exactly as it was, which is why it is a hard rule in AGENTS.md and a test (`findSecret` has one sample per pattern, and the table must equal the pattern list). Refusal never costs anyone their words: the rollback restores every file to what it was, and the text is still wherever it was typed, the same principle as §13.5. No `force` in v1 — a force would have to exempt the pre-commit hook too, or the block simply moves one step later, and that is more machinery than the case has earned.

**During Phase 3 (2026-09-04)**

51. **Weather is off when `lat`/`lon` are absent, not when `query` is empty.** §11.2 asked for browser geolocation followed by a reverse geocode "via Open-Meteo", and Open-Meteo has no reverse endpoint — `/v1/search` takes a name and `/v1/get` takes an id, both forward, and reverse is an open upstream request. So a geolocated user has coordinates and no query string, which under the old rule turned weather off for exactly the people who had just asked for it. The three fields now have one job each: `lat`/`lon` are what the forecast call needs and the only thing the off-condition reads, `query` records how they were found, and `label` is what the header displays. "Use my location" sets coordinates and the label `"My location"`, which is honest about what is known; a text search sets all four; Clear wipes all four. The rejected alternative was a second geocoding provider for the reverse direction, which buys one label at the cost of a dependency and another set of terms.

52. **A repeat with no `due` and no `scheduled` is refused at write time, and completion-anchored recurrence is deliberately not built.** A repeat rule describes an interval between dates; with neither field set there is no date to advance from, so the next instance cannot be computed and completing the task would silently end the series. The refusal lives in `writeTask` rather than in the task form, because the form is not the only writer: the agent creates tasks in Phase 5, the collection promote path in Phase 7, and a hand-edited file goes through the same store on its next save. The rejected alternative is the second recurrence model — anchoring the next instance to `completedAt` — and it is rejected on purpose rather than missing: it makes "every Monday" mean "every seven days from whenever I got round to it", which is a different feature that happens to share a field name. Two recurrence models in one `repeat` field cannot be told apart by reading a task file, and the ranker, the calendar, and undo would all have to ask which kind it was. If drifting recurrence is ever wanted it needs its own field and its own name.
53. **The shared task-write layer, `components/tasks/writes.ts`, is a deliberate exception to hard rule 1's three-uses threshold, taken at the second use.** What it holds is not convenience code: `send`, the busy id, `router.refresh()` rather than a local patch, and §13.5's rule about *where* a failure is shown — a toast for a write with no on-screen origin, an inline message for a refused edit, which is also what preserves the typed text (Decision 50). Those are semantics, and two hand-copied versions of them do not stay copies; they drift into disagreeing about where an error appears, which is a correctness divergence rather than duplication. The threshold is a guard against speculative abstraction, and this one is not speculative — Today is the first surface, the calendar's selection toolbar is the second, and Phase 5's preview panel and Phase 8's document view are the third and fourth, already specified. **The exception is recorded rather than taken quietly so the rule does not erode into "abstract at two."** It is kept narrow on purpose: `send`, the busy id, the toast-versus-inline routing, and `router.refresh()`. Nothing else belongs in it, and unrelated helpers accumulating there is hard rule 1 reasserting itself, not the exception widening.
54. **A past calendar cell shows what was missed as well as what was finished.** §10.3 originally listed tasks by `due`/`scheduled` for future days and by `completedAt` for past days, which meant a task due last Tuesday and still open appeared nowhere on the calendar at all — it lives in Today's Overdue section, and last Tuesday's cell renders empty. An empty cell reads as "nothing was due", which is the opposite of what happened. "What did I miss" is a question you open a calendar to answer, so an open overdue task keeps its place on the day it was due, drawn the way Today draws overdue. The objection was that this makes the calendar a second inbox; it does not, because the selection toolbar already makes every cell item actionable — this fills a hole rather than adding an affordance. Cells are therefore built from two lists, `due` and `completed`, and past cells render both.
55. **Three files were added to the §3 layout for Phase 4: `lib/schedule/calendar.ts`, `components/tasks/writes.ts`, and two more names under `components/calendar/`.** `calendar.ts` holds the grid maths for Rolling/Month/Week and the day grouping; it is pure and belongs beside `rank.ts` and `timeline.ts` rather than in the page, because both the page and `GET /api/calendar` need the same answer and a pure module is the only one both may import. `writes.ts` is Decision 53. `CalendarView` and `SelectionBar` join `CalendarGrid` and `DayCell`: the view owns selection, drag state and the writes; the grid is layout only. `TaskEditForm.tsx` and `format.ts` stay in `components/today/` and are imported across rather than moved — a move is churn for no behaviour change — with the trigger written down in AGENTS.md amendment `m`: a **third** surface importing from `components/today/` is the signal to move the shared pieces into `components/tasks/`.
56. **Hard rule 5's ~300 line cap applies to modules containing logic. CSS modules and test files are bounded by their subject, not by a line count.** The rule guards against coupling: a long module is hard to change because everything in it can reach everything else, and the fix is to split it along a seam. Neither exempted kind has that shape. A CSS module is a flat list of selectors with no control flow — nothing in it calls anything else in it — and splitting one produces two files that must be imported together and read together, which is worse. A test file is a flat list of independent cases, and its length is a measure of how thoroughly its subject is covered; capping it is an argument for testing less. Both are bounded by their subject instead: a CSS module ends when its component's selectors do, and a test file ends when its module's behaviour is covered. This resolves `components/today/TaskList.module.css` at 360 lines, which was a standing violation nobody had ruled on, as well as Phase 4's `components/calendar/Calendar.module.css` at 394 and `lib/schedule/calendar.test.ts` at 355. `lib/history/batch.ts` at 317 stays in scope and stays watched: it is logic, and it is over. It is not split because the `runBatch` sequence — apply, backfill, append, mirror, commit, push — is one ordered transaction whose steps share the rollback, and a seam through it would be a seam through the thing that makes the write atomic. Phase 5 took it to 330 by returning `targets` on `BatchResult`, which was accepted: `runBatch` already computes that list for the log, so returning it exposes a fact the function knows rather than deriving a new one, and every alternative recomputes what it has. **The seam is named in advance so it is not chosen under pressure: past 350, `scanBatch` and its `snapshotText` and `Rejection` helpers move to `lib/history/scan.ts`.** They are the one part of the file that is not in the ordered transaction — a pure predicate over a batch and its snapshots, called once, sharing no state with the rollback — and they are the part most likely to grow, because every new snapshot kind adds a case to them. `applySnapshot` is the tempting alternative and is the wrong cut: undo calls it, so moving it splits the rollback across two files. `lib/history/actions.ts` reached 299 in the same phase and is the next in scope; **its seam is by domain, not by layer** — task builders, file builders, settings builders — because it is a flat list of independent closures that never call one another, so the coupling this rule guards against is already near zero and the cut is obvious wherever it is made. **The procedural point is worth recording too: the miss in Phase 4 was not asking before writing the two long files, and rule 7 says to ask. Self-reporting it in the phase report was the correct move, and is what produced this rule rather than a quiet precedent.**


**During Phase 5 (2026-09-06)**

57. **`scope` records whose change a batch is, not which directory it touched.** §12 said "under `data/` is `user`; everything else is `project`", which was written when the only two kinds of change were data files and code. §11.5's key writes are neither: `.env.local` sits outside `data/` and is more personal than anything inside it, and filing a key change as `project` would put it in the history alongside code changes, which is the opposite of what a scope filter is for. The rule now says what it always meant — `user` is anything personal to the owner, which is everything under `data/` plus `.env.local`; `project` is code, `seed/`, and docs — so the case is inside the rule rather than an exception beside it. Rewording rather than adding an exception is the point: an exception outside a rule is a thing the next phase has to be told about.

58. **Undo restores `{fields}` and `{content}` snapshots only under `data/`, and says why when it refuses.** Every store path is resolved relative to `data/`, so applying a `fields` snapshot whose target is `.env.local` would not rewrite the real file — it would create `data/.env.local` with frontmatter, silently, and report success. The §11.5 key batch is the only writer that names a path outside `data/` today, and undoing it is meaningless in any case: the snapshot records `ANTHROPIC_API_KEY: "set" | "unset"`, the name and never the value, so there is nothing to restore from. `undoBatch` therefore refuses such a batch with a message giving that reason rather than a path error, because a refusal that reads like a bug gets "fixed" into the silent write it was preventing. `{git: true}` is deliberately untouched: it reconstructs from a commit rather than through the store, which is how `code.change` reaches repository paths correctly. Found by reading `applySnapshot` while planning the key writes, before either existed.

59. **The settings preamble is split so the cache prefix can actually hit.** §13.1 originally put the whole preamble first and marked the four blocks behind it `cache: true`. The preamble carries the current local time, so its text changed on every request; prompt caching is prefix-based, and a breakpoint whose prefix changes every call is a breakpoint that never matches. The effect was not neutral — it paid the 1.25x cache-write premium on every request for zero reads. The fix is to split by volatility rather than by topic: the stable half (name, timezone, day shape, categories, formats) joins the cached prefix, and the clock becomes its own uncached block placed immediately before the view tasks table, where the rest of the per-request content already is. Found while building Phase 5's `context.ts`, by asking what the `cache: true` flag would actually do rather than only setting it.

**During Phase 6a (2026-09-07)**

63. **A message is `streaming` on disk until the batch that finalizes it.** §16.3 originally said the user's message is written `complete` immediately and the assistant's `streaming`. The final state is identical either way — one batch writes both as `complete` — and the difference is only what a process killed mid-turn leaves behind: under the original wording, a user message that claims to be finished with nothing in the log recording it. Writing both as `streaming` makes one invariant true with no exceptions — **anything under `data/chats/*/messages/` that is not in the log is `status: streaming`** — and that is exactly the condition `history.streamingWrite` and `streamingDiscard` enforce, which is what keeps §8's sanctioned bypass narrow enough to be safe. The cost is that a crashed turn's prompt renders as unfinished rather than as sent; that is the honest reading, since nothing recorded it.

64. **A startup sweep marks interrupted messages failed, and Decision 63 is what makes it both necessary and safe.** The Phase 6a browser checks found that a client disconnect abandoned a turn's generator mid-stream, leaving a message `streaming` on disk with nothing in the log; the route now drains the turn so it finalizes. **Process death is the same wound with no such fix available** — a `Ctrl+C`, a crash, or a machine losing power leaves exactly that file, and Decision 63's invariant is what makes it invisible: a `streaming` message is indistinguishable from a live one, so the app renders a reply that will never arrive and no error is ever raised.

    So `lib/history/streaming.ts` gains `sweepInterruptedMessages()`, called by `scripts/dev.mjs` at startup, in the same place and for the same reason as `clearStaleIndexLock` (Decision 43): **at startup this process has no live streams, and §16.0 rule 2 says there are no concurrent writers**, so a `streaming` message whose path appears in no log entry can only be one a previous run abandoned. It is repaired to the state §16.3 would have left it in — the prompt to `complete`, since it was written whole in one go, and the reply to `failed` with an interrupted reason, since it was not — through `runBatch`, so the repair is itself logged, committed and undoable. Writing it outside the log would leave a non-streaming file that nothing recorded, which is the same invariant broken from the other side.

    The sweep is deliberately narrow. It reads the log's target paths and touches nothing that appears there, so a message someone is legitimately mid-way through on another machine is not its business — and it runs at startup only, never on the write path, exactly like the index-lock guard.

61. **`uuidv7()` is monotonic within a millisecond, and that is load-bearing rather than tidy.** The chain is three links long and every one of them is elsewhere in this file, which is why it is written down here as one thing. Decision 9 says there is no message index. `readConversation` therefore takes its ordering from a sorted directory listing (`lib/store/chats.ts`). And that listing is a timeline **only** if the ids sort in creation order — which UUIDv7's timestamp cannot deliver on its own, because it has millisecond resolution and several messages are easily written inside one. The generator ported from `HANDOFF-CHAT.md` Part B left those ids in random order; the 12 bits after the version now carry a counter that increments while the clock stands still (the monotonic-random method the UUIDv7 spec allows), and a clock that jumps backwards is ignored in favour of the last millisecond issued.

    **The guard is the creation-order case in `lib/chat/uuid.test.ts`, which mints a thousand ids and asserts the array is already sorted.** A thousand ids take well under a millisecond, so it fails the moment the counter goes away. **If it ever fails, the generator has regressed — the test is not wrong and must not be relaxed**; loosening it to "sorts across milliseconds" would restore exactly the bug it was written for, and the symptom in the app is not an error but messages quietly coming back in the wrong order.

    The residual is deliberate and small: the counter is per process, so two browser tabs minting inside the same millisecond can still tie, and the tie breaks on the random half. That costs the display order of two sibling branches. **Structure is unaffected** — it comes from `parentId`, and `lib/chat/tree.ts` orders siblings by `(createdAt, id)`, never by a filename.

62. **`lib/chat/types.ts` holds the `Message`, `Conversation` and `Annotation` shapes**, as zod schemas with the TypeScript types inferred from them, so each is defined once rather than as an interface and a validator that drift. It exists because of §3's own rule rather than as a preference: components may not import `lib/store/`, so with the shapes living in `lib/store/chats.ts` a component would learn what a message looks like by importing a module that touches `node:fs`. `lib/chat/` is already the directory for what both sides need and neither side may make impure (Decision 30), so the model goes there and the file access stays in the store.

60. **`ExtractResult` is a discriminated union in TypeScript and a flat object on the wire.** §9.4 defines the three answers as a union, and that is what callers get: `narrow()` in `lib/agent/chat.ts` is the only place the two shapes meet. The schema handed to the structured-output request is deliberately not that union. A discriminated union becomes `anyOf` in JSON Schema, which is the construct strict structured output handles least well and most inconsistently across models; a single closed object whose every key is present — `kind`, plus `tasks`, `collection`, `collectionItems`, `question`, `note` with the irrelevant halves nulled — is a shape a strict schema can enforce. The cost is one narrowing function that refuses an answer its own fields do not support: a `kind: "question"` with no question is a provider error, not a `question` with an empty string. Written down because the difference between the two shapes is otherwise something the next reader discovers rather than reads.


**During Phase 6b (2026-09-08)**

65. **Message attachments live in `data/files/`, and §4.7's conversation-local `attachments/` directory is deleted.** The spec said both: §4.7 showed `data/chats/<conv-id>/attachments/<sha256-8>-<name>` and called the field "relative to the conversation dir", while §9.2 uploads through `POST /api/files/upload` into `data/files/<kind>/<YYYY-MM>/`, which is what the code actually does. Nothing ever wrote to the first one — `attachmentsDir()` existed in `lib/store/chats.ts` and had exactly one reader, `removeConversation`, sweeping a directory that is always empty. One home wins, and it is `data/files/`, because that is the one with §4.8's manifest, content-hash dedup, backlinks and an undo story; a second uploads directory means a second of each of those. A message stores `data/`-relative paths, the same shape `refs` already uses.

    **The consequence, named rather than discovered: deleting a conversation no longer deletes its attachments.** It cannot. Dedup is by content hash, so the file a message points at may be the same file another message in another conversation points at, and a delete that swept it would break the other one. What is left behind is a file nothing links to any more, which is a **visible** signal rather than an invisible leak: `npm run kb:check` is where it surfaces, alongside orphans and broken links. Garbage collection is not Phase 6b's problem and is not being built here; the point of writing this down is that the trade was chosen, so the first person to see an orphaned upload reads this instead of filing a bug.

66. **The chat pane's width cascade is ordered, and the annotation gutter is outside the message column rather than inside it.** §16.4 gives the gutter 300 px preferred / 200 minimum / hidden, and §16.5 gives the sidebar full width while "the main pane can keep ≥ 640 px". Read independently the two do not compose: a 300 px gutter taken out of 640 leaves a 340 px reading column, which is narrower than either section would accept and which neither section says. So §16.5 now states the order outright — message column, then gutter, then sidebar, each taking what the ones above it left — rather than leaving it to emerge from two rules that were never checked against each other. The left panel's collapse is the release valve, deliberately the reader's control rather than an automatic reflow.

    **And a gutter that hides owes a count.** §16.4 already refuses to let an off-path annotation vanish silently; a hidden gutter is the same disappearance by a different cause, so it gets the same remedy — "N notes hidden" in the conversation header. The rule underneath both is that an annotation which exists and is not drawn must still say so, and the fix is one the reader can act on.

67. **`npm run check:ui` past five minutes needs sharding or selective running, and until then always runs everything.** Decision 56's precedent is the shape here: name the threshold in advance, so the decision is made once while it is cheap rather than under pressure by whoever first finds the suite slow. The browser checks ran nine cases in about 41 seconds at the end of Phase 6a; Phase 6b roughly triples that count, and every later phase with a surface adds more. Five minutes is the number, and below it the answer is always the whole suite: a partial run is a claim about what was checked, and the cost of getting that claim wrong is higher than four minutes of waiting. Past it, the options in order of preference are sharding across workers — which `fullyParallel: false` currently forbids, for the good reason that there is one data directory and one git repository, so it means a sandbox per worker first — and then selective running by spec file. Splitting `e2e/chat.spec.ts` along §17's own step letters is not that; it is the Conventions split rule, and it happened in Phase 6b as ordinary reported work.

68. **Edit and "Branch from here" are different operations, and each is offered on one role.** §16.2 defined branch-from-here as "the same call with a new prompt", which read literally makes it Edit with an empty box — same parent, same sibling set, same result — and §10.2 would then be listing two names for one action. The reading built instead: **Edit appends with `parentId = edited.parentId`**, which is what §16.2 already says for Edit, and **Branch from here appends with `parentId = thisMessage.id`** — a child rather than a sibling, forking the tail below a message that stays where it is. That is the operation §10.2 needs a separate name for: continuing differently from a point, rather than saying the last thing differently.

    Which role gets which follows from the tree rather than from taste. Offering both on both roles makes it possible to append a user message as a sibling of an assistant message: legal in the data model, since siblings are only "children of the same parent", and unexplainable on screen, since the branch bar would then be stepping between a question and an answer. So **Edit is on user messages, Branch from here is on complete assistant messages**, and every sibling set holds one role. Regenerate is the third of the set and needs no box at all — an assistant sibling under the same prompt.

69. **A server render never replaces the open conversation's client state; `reload()` is the only path into it.** `useConversation` began as `useEffect(() => setState(initial), [initial])`, adopting every payload the server sent. `send` ends with `router.refresh()` so the chats panel shows the new timestamp, and that payload lands whenever it lands — so a first send's refresh could arrive after a second send's `reload` and put the view back to the state before the edit. The same race truncates a streaming reply, since deltas live in that state too. It was a live defect from Phase 6a Stage B (`9cafe80`), invisible until branching made two sends land seconds apart, and the browser checks found it.

    Two things were checked before the fix was trusted, and both changed what the fix should be. **The effect's stated purpose was already served by a key:** `app/chat/page.tsx` mounts `<ChatView key={open.conversation.id}>`, so opening another conversation is a remount and `useState(initial)` takes the new payload by itself. Gating the effect on a changed id would have left dead code carrying a careful comment, so the effect is deleted instead. **And Decision 20's "refetch on window focus" does not exist anywhere in the app:** the only window `focus` listener is `components/shell/SyncStatus.tsx`, which re-reads `/api/sync/status` and touches no view's data. Nothing was closed by removing the adoption, because nothing was open. Amendment `q` records that gap rather than leaving the spec claiming a behaviour the code does not have.

    When that refetch is built it goes through `reload()`, never through `initial`. `reload()` is the client's own request: it is ordered against the sends it must not overtake, and it can be skipped while a message is streaming. A server render offers neither guarantee — it is a snapshot from whenever the server happened to be asked, which is the whole of what went wrong here.

70. **Every re-read of the open conversation is ordered by issue, and an older one is discarded.** Decision 69 removed one way a stale payload could win — a server render adopted as state — and Phase 6b's browser checks found the other one, which is the same race between two of the client's own reads. `send` ends by re-reading and nothing waits for it (`void send(...)`), while the view is already correct optimistically, so the reader can act at once: switch a branch, change the model. Their write's re-read can resolve *first*, and the send's older read then lands on top and silently undoes what they just did. It showed up as clicking "N notes on other branches" appearing to do nothing. `reload` now takes a ticket and adopts a payload only when no later read already has; a read issued later sees a state at least as new, so issue order is the right order.

    **The server has the same ownership question and answers it the other way, correctly.** A branch switch made *during* a turn is undone by that turn's own `finalizeTurn`, which writes the leaf it created. That is not a bug — the turn owns the leaf until it is finished — but it means a check that switches branches before a turn has finalized is measuring how fast the machine is. The remedy is on the checking side: wait for the turn to land first.

71. **A transient `EPERM` on an atomic write's rename is retried.** On Windows, renaming a temporary file over its destination fails with `EPERM`, `EBUSY` or `EACCES` whenever another process has either file open for a moment — a virus scanner reading a file that was just created, an indexer, a backup agent. It is transient by definition: the same call succeeds milliseconds later. Phase 6b's browser checks caught it once in about thirty runs, as a chat turn that rolled back for no reason and read as flakiness. In the running app the same failure loses the message being written, which is why the fix is in `lib/store/files.ts` rather than in the harness. Five attempts with a widening gap, and only for those three codes: a genuinely permanent permission error still surfaces as itself rather than hanging, and on every other platform the first attempt succeeds and none of it runs. The delay is a **failure guard, not a schedule** (Conventions): what the loop waits on is the rename succeeding. **It is exported, and every atomic write in the project goes through it** — the Phase 6b close caught that it did not: `writeText`, `writeBinary` and `rename` covered every markdown record and every upload, but `writeJsonAtomic` in `lib/store/settings.ts` and the `.env.local` write in `lib/store/env.ts` renamed themselves. The reasoning does not stop at messages, and the quarantine rename in `settings.ts` is the worst one to lose, since it runs only when `settings.json` is already unparseable. `renameAtomic` takes absolute paths and resolves nothing, which is what lets the one write outside the data tree use it too. **And the sentence above is held by `lib/store/files.test.ts` rather than by good intentions** — it reads every source file the repository tracks and fails on a rename imported from `node:fs` under any name, or called on an fs namespace, anywhere but inside `renameAtomic`'s own body. Three writers drifted past this Decision while it was only prose, which is the whole argument for the check: a function cannot see who declined to call it.

72. **§6.3's "fuzzy-matches above 0.8" is Sørensen–Dice over character bigrams of normalized titles, and a match is a score strictly above 0.8.** The spec gave the number and not the measure, and the number is meaningless without it: 0.8 under Levenshtein ratio, token Jaccard and bigram Dice are three different lines. Dice over bigrams was chosen because it tolerates what near-duplicate note titles actually differ by — a plural, a reordering ("MATH 221 office hours" against "Office hours for MATH 221" scores 0.94), a dropped article — while two titles that share only a topic word stay well apart. **Normalization, fixed with the measure:** NFKD with combining marks removed, lower case, every run of non-alphanumerics turned into one space, and fifteen stop words dropped (`a an the of for and or to in on at by with about my`) unless the title is nothing but stop words; bigrams are taken with spaces removed, as a multiset. **"Above" is read literally:** `Dune` against `Dun` scores exactly 0.8 and is not a match; `Dune` against `Dunes` (0.857) is. `lib/agent/memory.test.ts` holds the line on both sides — "Advisor meetings" / "Advisor meeting notes" at 0.8125 matches, "Office hours" / "Office hrs" at 0.7778 does not — because a threshold tested only far from its edge is one nobody has checked. A rewritten proposal carries `rewritten.why` and is the write the card shows and the route applies (Phase 7 approval), and only a write the filter left unchanged may be auto-applied.

73. **`kb:check` exits 0, 1 or 2, and 2 outranks 1.** §6.5 said exit 1 if anything is reported, which leaves CI unable to tell a real violation from a check that could not be made — and the second is the one that needs a person. Violations exit 1; *could not evaluate* exits 2; notices never touch the code. When both happen, 2 wins: a run that could not look at everything cannot claim its violations are all of them. The *could not evaluate* tier is the Conventions rule about lenient readers made concrete — a map whose frontmatter does not parse suspends the orphan rule, because it may be the map that links the note, and a non-empty `listTasks.errors` suspends the collection rule for the same reason. `listTasks` was named in Conventions as the lenient reader whose first acting caller owes the check; `kb:check` is that caller. Verified against a throwaway checkout: clean seed exit 0, a hand-written orphan exit 1 naming it, the same tree with `courses.md`'s frontmatter broken exit 2 with no orphan named.

74. **Link targets resolve by a fixed precedence, without looking at the disk, and the app writes `data/`-relative links.** In a body: a scheme, an absolute path or a bare fragment is not an edge; `./` and `../` are relative to the file; a first segment naming a top-level `data/` directory (`tasks`, `knowledge`, `files`, `chats`, `settings`, `history`) is `data/`-relative; anything else is relative to the file. In frontmatter, every path is `data/`-relative (§4 Conventions). The order puts "top-level name" before "relative to the file" at a known cost — a folder under `knowledge/notes/` named `files` is reached as `./files/x.md` — because the alternative is asking the disk which reading exists, and an extractor whose answer changes without its input changing is not one a check can trust. **`knowledge/index.md` is now written with `data/`-relative links**, which is the form `read_knowledge` takes; the seed's index was knowledge-relative, so a model that followed it was refused on its first read. `regenerateIndex` compares content rather than a flag, so an existing checkout's index repairs itself the first time anything regenerates it, and the extractor reads both forms meanwhile.

75. **Git acts only on `REPO_DIR`'s own repository.** Found in Phase 7: `lib/history/chat-actions.test.ts` built its sandbox with no `git init`, git's discovery climbed out of the temp directory, and 232 of its undo commits landed in a repository in the home folder — silently, for two months, because a failed commit was only ever logged. Two layers now, in `lib/history/repository.ts`. **Prevention:** every git command runs with `GIT_CEILING_DIRECTORIES` set to `REPO_DIR`'s symlink-resolved parent (`;`-separated on Windows, `:` elsewhere, no trailing separator, ours first so an existing empty entry cannot stop git resolving it) and with the variables that redirect git (`GIT_DIR`, `GIT_WORK_TREE` and five more) removed. **The invariant:** before a commit, a push or a checkout, `git rev-parse --show-toplevel --absolute-git-dir` must name `REPO_DIR` and the git directory `REPO_DIR/.git` names — both, because with `GIT_DIR` set git calls the working directory the top of the work tree, so the toplevel alone passes while the objects land elsewhere. A mutation check removed each layer in turn: without the ceiling one test fails and the assertion still refuses the batch; without the assertion three fail. **Outside production a `RepositoryError` throws before a batch applies anything**; in production it is the existing failed-commit path. Every test that commits builds its checkout through `lib/testing/checkout.ts`, which initializes the repository with the directory, so there is no step to forget; `scripts/dev.mjs`'s shutdown push runs from `REPO_DIR` with the same options and checks the repository before pushing.

76. **A batch never commits a message file a turn is still streaming into, and the one batch that may is the turn's own.** `runBatch` stages `data/` whole, so before Phase 7 any batch landing mid-turn swept the half-written reply into its commit — §8's "never commit a streaming message", broken by construction rather than by accident; reproduced as a failing test before the fix (`lib/history/batch-commit.test.ts`). `lib/history/in-flight.ts` holds each streaming path with its owning turn; every commit excludes held paths with `:(exclude,literal)` pathspecs, except those the batch both declares and owns (`BatchSpec.turn`, set by `finalizeTurn`). **Excluding rather than staging only declared targets, deliberately:** a builder that forgot a target would then never be committed, silently, and the tree would drift from history; over-staging is visible and recoverable. Outside production each commit's staged set is compared with the batch's declared targets and differences are reported, which is the evidence for whether the other way could ever be safe. **Ownership, not declaration, is the exception** (the Phase 7 approval's question): a batch that declares a held path it does not own is refused whole before anything is logged, so the defect has no second route. Entries have a lifetime — the owning batch ends the hold, `runChatTurn`'s `finally` releases the rest on every exit, a file still streaming when released becomes an orphan (kept out of commits, named once, taken over by the next batch that declares it), and an entry whose file stopped streaming unreleased is dropped at the next batch, named. The startup sweep runs in `scripts/dev.mjs`, a different process from the server, so the server's registry starts empty; the sweep skips any path a live turn in its own process holds.

77. **Files added to the §3 layout in Phase 7.** `lib/history/scan.ts` (every reason `runBatch` refuses a batch before logging it — Decision 56's named seam), `lib/history/in-flight.ts` (Decision 76), `lib/history/repository.ts` (Decision 75), `lib/history/knowledge-actions.ts` (the knowledge builders, split by domain as Decision 56 names), `lib/agent/finalize.ts` (§16.3's finality contract, split from `turn.ts`), `lib/knowledge/items.ts` (§4.5's item format, pure), `lib/testing/checkout.ts` (the one sandbox a committing test may use), `components/chat/useConversationWrites.ts` (the conversation's one-field writes, split from `useConversation.ts`), and `app/api/collections/[slug]/promote/route.ts`. `lib/knowledge/search.ts` stays unbuilt until Phase 8's `/api/search`, its only caller. `repository.ts` reads `REPO_DIR/.git` directly, following `git.ts`'s index-lock precedent: hard rule 7 is about `data/`, and the repository's own metadata is not data.

78. **A request that fails its schema is a 400 with a fixed message, and the zod dump never leaves the server.** Until Phase 7 every route answered a zod failure with 500 and zod's own message — every field path and bound, and whatever the client sent — which is disclosure, not tidiness, on routes that take model-generated writes. Routes parse input through `parseInput` in `app/api/respond.ts`: a mismatch is `{ ok: false, error: "The request was not in the expected shape.", code: "invalid" }` at 400, the same for every route, and the issues are logged to the server's console outside production. **Never in the body, in any mode**, because the app only runs under `next dev`: a body gated on `NODE_ENV` would carry the dump in the only place the app is used. A `ZodError` that reaches `handle` without passing through `parseInput` is the store refusing a record, which is a fault, so it is a 500 with a fixed message of its own; the one residual is a request that passes its route's schema and fails the store's, which answers 500 — safely, but it is a gap between two schemas and is fixed per route by tightening the route's. `app/api/validation.test.ts` covers one route per family that parses a body; calendar, sync and weather parse none with zod, and knowledge and search parse only a query string (files joined the body-parsing families in Phase 8).

79. **§6.3's auto-apply runs after the turn's own batch, only for a completed turn, and its record is read from the log.** `runChatTurn` holds a turn's knowledge proposals back instead of forwarding them as they arrive, because which one may apply itself is known only once the turn is known to have been kept — and a card for a write that then applied itself would be a card for something already done. After `finalizeTurn`, and only when the turn finished without a failure, `pickAutoApply` chooses at most one write (Decision 72's filter, the three-line limit, the one-per-turn cap) and `lib/agent/auto-apply.ts` applies it as **a batch of its own**, `actor: agent`, so undoing the memory never undoes the reply. A stopped or failed turn applies nothing and sends every write back as a card: a write nobody asked for should not ride on a reply nobody finished. A refused auto-apply is not the turn's failure; the write becomes a card and the server says why. The client gets an `applied` event for the toast, and the sheet draws the marker from it under its Ask answer; the toast itself has no Undo (Decision 84). **The marker is the record, the toast is the notification** (Phase 7 approval): the batch carries `meta.autoApplied` — conversation, assistant message, path, line count, fixed at write time — and `lib/history/auto-applied.ts` finds markers by those and by batch id, never by log position, so a marker resolves through later writes, an undo and a redo. Nothing is written into the message: finalized messages are not edited, and a second writer on a reply file is what Decision 76 protects against. An undone batch is not drawn (`undoState`), which is how Undo removes the marker without a compensating edit. **Absence is never silent:** a log that cannot be read, a torn line naming the conversation's auto-applied write, or an entry missing a field each render no marker and warn on the server; the client warns when a turn it saw apply a write re-reads without that marker. The marker's Undo refuses rather than forces when a later batch touched the same file, because forcing restores the whole file and takes the later change with it.

80. **Proposals land in a tray, one card per knowledge write, held in memory; distill is a proposal like any other.** `components/composer/useProposals.ts` is the tray and `ProposalPanel.tsx` draws it — above the chat composer, and in the sheet, which closes §9.6's gap: Ask mode collected task proposals and never drew them. Each knowledge write is its own card with its own Add, because a turn that proposes a note and a profile change has not asked for both or neither; a task proposal stays one card with a selection. `CollectionCard.tsx` is shared with `PreviewPanel`, whose collection Add now works — wired, and **not browser-checked**: Tasks mode's extraction is a `parse` call, which the scripted provider refuses, so only the tray's use of the same card is checked. That is a known gap, not coverage. A refused Add keeps the card and its edits, with the reason on the card (§13.5, Decision 50). In memory only (Phase 7 approval, open call 3): distill is the first thing to get persistence if it proves slow or expensive. For the same reason, **a distill card's Discard confirms and no other card's does** (the Phase 7 close, decision 3): a discarded task draft costs a retype and a discarded distill costs a model call. **Distill** (`lib/agent/distill.ts`, `POST /api/chats/[id]/distill`) streams through `Provider.streamChat` rather than `parse`, so the scripted provider answers it: the conversation's active path is sent as itself with one user turn after it asking for the summary, under one system block of instructions. It returns a `create` of `knowledge/sessions/<id>.md`, or a `replace` when one exists, and writes nothing. The Chats menu opens the conversation with a one-shot `?distill=1`, which the view consumes once and removes from the address, so a reload does not spend a second model call. The guard is once per request, not once per mount. The view is keyed by conversation and outlives the flag, so a once-per-mount guard swallowed a second Distill from the menu. It shipped that way in Stage B and was fixed at the close, when the check for decision 3 distilled twice. **The prompts** (`lib/agent/prompts.ts`): Ask carries §6.4's heuristic from `memory.ts`, the search before a new note, and the map rule; a profile file over 150 lines adds a distillation request to the Instructions block, which is behind the cache breakpoint (Decision 59). **The scripted provider has five proposal directives, and this list is the record, not the approved plan's count of four:** `[[propose-habit]]`, `[[propose-note]]`, `[[propose-note-nomap]]`, `[[propose-collection]]`, and `[[propose-tasks]]`. The plan did not have `[[propose-tasks]]`; it was needed to check Ask-mode task proposals in a browser, and was accepted at the Phase 7 close. The five are the only coverage those prompts get until a key exists.

81. **Files added to the §3 layout in Phase 7 Stage B.** `lib/agent/auto-apply.ts` and `lib/history/auto-applied.ts` (Decision 79), `lib/agent/distill.ts` and `app/api/chats/[id]/distill/route.ts` (Decision 80), `components/composer/{useProposals,autoApplied}.ts` and `{ProposalPanel,KnowledgeCard,CollectionCard}.tsx`, `components/chat/AppliedMarker.tsx` and `useDistill.ts`, and `e2e/knowledge.spec.ts`. `AutoApplied`'s shape lives in `lib/chat/types.ts` for Decision 62's reason: a component has to know what a marker is without importing `lib/history/`.

82. **A component may `import type` from `lib/store/`; it still may not import a value from it, and may not import `lib/history/` at all** (§3, amended at the Phase 7 close). §3's sentence forbade every import, and 13 type-only imports across 11 components had stood against it since Phase 3 (`8c460e8`): `Task` from `lib/store/tasks.ts`, `Settings` from `lib/store/settings.ts`. A type-only import is erased at compile time and gives a component nothing it can call, so it cannot reach `node:fs`, which is what the rule protects against. A value import still can, and stays forbidden. The rule is now `components/imports.test.ts`, not just a sentence: only `import type` and `export type` count as type-only, because `import { type X }` leaves `import {}` behind under `verbatimModuleSyntax` and still loads the module. `lib/history/` stays closed to types as well: nothing in it is a shape a component needs, and the one that looked like one, the auto-applied marker, lives in `lib/chat/types.ts` (Decision 81). The same pass found that route-level files' read exemption named `lib/store` only, while `app/chat/page.tsx` has read `autoAppliedIn` from `lib/history/` since Stage B. §3 now says route-level files may call `lib/history`'s read functions too: reading the log is the same kind of act as reading the store, and a page that fetched it over HTTP from itself would not be the boring option either.

83. **A check that fails intermittently for a filed reason is tagged `@known-flake`. It still runs, it is reported apart from the rest, and it never sets `check:ui`'s exit code** (the Phase 7 close, item 2). `playwright.config.ts` splits the checks into two projects by the tag. `scripts/check-ui.mjs` counts each with `--list`, runs the untagged checks first, and takes the exit code from that run alone. The tagged checks then run under their own heading with their real outcome, which is how "38/39" and "31/32" stop hiding whatever else might have failed beside amendment `u`. Two conditions keep this from becoming a place to put inconvenient checks. A check gets the tag only with a deferred amendment naming it, and loses it when that amendment closes. And the tag is for intermittent failures: a check that fails every time is a defect, and it stays in the gating run until it is fixed. The one tagged today is `u`'s Stop check in `e2e/chat.spec.ts`. `npx playwright test` run directly still runs both projects and counts them together.

84. **A toast is text only and transparent to the pointer, and a check asks the page what is on top of Send while one is up** (the Phase 7 close, item 1, and the owner's answer to the corner question). The approval asked for `pointer-events: none` on the host with the toast's buttons re-enabled. That closed both bugs found by looking at the screen: seven seconds of dead Send after any toast, and a toast paused in its fade-out that stayed as an invisible layer over Send. `e2e/toast.spec.ts` holds a toast on screen, samples fifteen points across Send's box with `elementFromPoint` at four window sizes, then clicks by coordinate with `page.mouse`. Playwright's own `click()` waits until its target is unobscured, which is why `check:ui` passed through both bugs. **Its first run found what pointer-events could not fix:** in windows about 800–1100 px wide, the toast's own Undo sat on the right third of Send, so a click there undid the auto-applied write instead of sending. A survey of the candidate positions found no corner clear on every page. Top-right and top-center cover the Today and Calendar navigation and the chat header. Bottom-left covers the chat input, and at 400 px the + button and Send. Bottom-right covers §9.1's + button, the sheet and Send. So the corner stays, and **toasts lost their buttons**: no Undo and no ×, and a toast leaves when its animation ends. The auto-applied write's one Undo is the marker under the reply. In Chat that marker is read from the log (Decision 79). In the sheet it is drawn under the Ask answer from the turn's `applied` event and cleared by the next question, because a toast with no Undo needs the answer it came from to carry one. The toast says where Undo is. What remains is visual: a toast covers Send for its seven seconds, and clicks pass through it.

85. **The open document's block is capped at 32,000 characters, cut at a line break, with a marker saying how much was sent** (the Phase 8 approval, "don't leave this as an observation"). §6.2 says "the open document's full text" and `assembleContext` read it with no limit. The block sits behind the cache breakpoint (Decision 59), so it is paid for on every turn of a conversation that has a file open, not once. 32,000 characters is about 8,000 tokens by §6.2's own estimate, four times the always-in-prompt target of 2,000. A 200-item collection at 60 characters a line is about 12,000 characters, well under it, and the notes §4.2 caps at 200 words are a fraction of it. A file past it is a dump, and its first 32,000 characters are a fair sample. Past the cap, the text is cut at the last line break in the second half of the allowance, and `[Truncated: this is the first N of M characters of <path>. The rest is not in this context.]` follows, so neither the model nor the debug view can take a partial file for the whole one. Nothing is dropped silently. Two more things are said rather than sent. A credential-shaped path is withheld by name, as it is everywhere in the browser (Decision 88). A binary is described by its size, because decoded as text it would be noise. A path out of `data/` still throws, as it did, before any block can name it.

86. **What the document view may write is decided by path, in the builder, and a save is checked against the bytes the editor opened** (the Phase 8 approval, open call 4 and the 409 condition). The table in AGENTS.md's Phase 8 conditions is `lib/history/write-policy.ts`. The builders in `document-actions.ts` and `file-actions.ts` apply it inside the batch, and the read route reports it, so **the view decides what to show and the builder decides what is allowed**. A request that never saw the view is refused the same way, with 403 and the reason as a sentence. The rules:
    - **A save is one of two shapes.** The first is the frontmatter table and the body, where `fields: null` means the table was not touched. The second is the whole text, for a file with no frontmatter or one whose frontmatter will not parse, which the read route returns raw with the parse error, so the owner can fix it in place.
    - **`base` is SHA-256 over the file's bytes exactly as `store.files.readBinary` returns them**, before any parsing or line-ending change. It is computed by one function, `versionOf`, over the same read, on both sides. The page never hashes; it sends back what the read gave it. **The version a save answers with is taken inside its batch**, from the bytes it wrote, the writer's `updatedAt` stamp included, so the next save is not a false 409. Taken after the batch returned, it could be the version of a write that landed in between, and the next save would then pass the check and overwrite that write (the Stage A review, item 6; `document-actions.test.ts` makes the gap deterministic). A mismatch is 409 `conflict`, a new `StoreError` code, with nothing written and the text left in the editor. `base: null` means create, and a file that exists by then is 409 `exists`.
    - **An unchanged save is answered `unchanged` with no batch**, so no log line and no commit. That is what keeps an equation sheet's SHA-256 through Edit and Save (§15). A table sent back whole with its keys in another order is still unchanged.
    - **A changed save goes through the file's own writer.** A task goes through `writeTask`, with its `id` fixed. Knowledge files go through `writeRecord`, which stamps `updatedAt` and validates. A new map or collection gets its id from the store and must have a title. A new note must name its map, and goes through the same builder a proposal does, so §6.3's link is written in the same batch. A profile file and a file under `files/` have no schema, so an untouched frontmatter block is kept byte for byte. **The body is never touched by any of them**, so a body edit writes exactly what was typed. A frontmatter that fails its schema is refused, naming the field and never the value (Decision 78).
    - **A checkbox click is one action.** It sends the body line's index and the line as the page drew it. If the line is no longer that, it is 409 and nothing is written. No `base` is asked for, because two quick clicks on two boxes should both land.
    - **Rename stays in its folder, keeps its extension, and is refused while anything links to the file**, with a refusal that says the link would break and names who holds it (amendment `v`). The two generated listings, `knowledge/index.md` and `files/index.md`, do not count. They list every map, collection and upload, and the rename regenerates them, so counting them would refuse every rename. A rename is also refused when the link index could not read some file. The index is lenient, and a file it skipped might be the one linking here (AGENTS.md Conventions). A note is refused outright, because a map always links it.
    - **Delete takes a file, or a folder under `files/` with its `.gitkeep` files.** New folder writes a `.gitkeep`, because git keeps no empty folder.
    - **Log vocabulary.** Every operation is logged in §4.11's existing vocabulary by path: `task.update`, `task.delete`, `knowledge.write` or `file.write`. The listing a change affects, the index or the manifest, rides along as a target when it changes, the way `addFile` carries its manifest.

87. **Search takes an entry's best single score, ignores case, and counts a body subsequence only inside twice the query's length** (the Phase 8 approval, open call 6). §10.0 gave four scores and no rule for combining them. Summed, a note whose title and body both contain the word outranks one whose title *is* the word, and the order says more about the length of a body than about the query, so the best one counts. The 10-point body subsequence was the rule that needed a bound. Unbounded, "cob" is a subsequence of nearly any paragraph: a `c`, an `o` somewhere after it, a `b` somewhere after that. It would fill the top 20 with any long body. **Twice the query's length** still finds a query typed with a missing letter or two words out of order close together, and refuses letters scattered across a paragraph. The window counts from the first matched character to the last, inclusive. `lib/knowledge/search.test.ts` checks "abc" matching in a six-character window and not in seven, as Decision 72 checked either side of 0.8. A title subsequence stays unbounded, because titles are short and matching "cob" to "Change of basis" is the rule's point. Ties go to the more recent `updatedAt`, compared as instants rather than strings in different offsets. Entries are tasks, notes, collections (title and item lines) and titled conversations, read through the store. Only tasks have an mtime cache, so notes and collections are read fresh on each query, which is fine at this size and is what §10.0's "through the store's mtime cache" amounts to today.

88. **The browser shows nothing credential-shaped, shows "Whole repo" as git's tracked files, follows no link out of its tree, and serves an upload inline only as a raster image whose bytes and name agree** (the Phase 8 approval, both security sections). `lib/security/credential-paths.ts` refuses a path by name: `.env*`, key and certificate extensions, SSH identities, saved logins such as `.npmrc` and `.git-credentials`, `credentials*` and `secrets.<config>`, and `.ssh`, `.aws`, `.gnupg` and `.docker` folders. It checks every segment, case-insensitively, whether or not the file is tracked. The trees, `/api/files/read`, `/raw`, the document view's writes and file operations, and the open-document block all apply it. An upload is not refused by name. Its content is scanned (Decision 89), and a stored `….env` is then hidden and unreadable like any other. It deliberately over-refuses (`.env.example`, a public `id_rsa.pub`), because a false negative is not recoverable. **"Whole repo"** is `git ls-files`, and a read of a path not in that set is refused when asked for directly, not only left out of the tree. `listTree` lost its `wholeRepo` option, which walked the directory and would have listed `.env.local`. **A read resolves the real path** and refuses one that lands outside `data/` or the checkout. Since the Stage A review this is the store's rule for every read and write, not the browser's alone (Decision 94). It also applies the name rule to the real path, so a symlink named `notes.txt` that leads to `.env.local` is refused. The approval did not name that hole; Stage A found it while building the read. **`/api/files/raw`** (`lib/security/raw.ts`) decides on sniffed bytes. PNG, JPEG, GIF and WebP go inline when the extension agrees. Everything else is `application/octet-stream` as an attachment, including SVG, HTML, a PNG named `.gif` and **PDF**. Every response carries `X-Content-Type-Options: nosniff` and `Content-Security-Policy: sandbox`. PDF is a download because the plan had exempted it from the sandbox on the understanding that Chromium's viewer will not run under one, and a PDF can carry script. Nothing has shown the viewer safe either way, so §10.2's PDF `<iframe>` is a download link until someone does. An SVG in a document does not render for the same reason. The failing cases are kept in `app/api/files/routes.test.ts` and `lib/security/raw.test.ts` so the rule is not relaxed by someone who does not know why it is there.

89. **A `{ git: true }` snapshot is secret-scanned from the file on disk, rolled back from bytes held in memory, and restored by undo and redo from `data/<path>` at the right revision** (the owner's answer, AGENTS.md's Phase 8 `{ git: true }` conditions). Found in Phase 8 Stage A. None of the three held before. **The scan read the snapshot as empty text**, so a key in an uploaded text file, or in any text file over 64 KB, was logged and committed. The pre-commit hook scans every staged file without a NUL byte, so it then refused that commit and every one after it: hard rule 4's deadlock, reachable through the composer's attach. `unloggedTexts` in `scan.ts` now reads the bytes of every target whose last snapshot is `{ git: true }`, skips a file with a NUL byte as the hook does, and scans the rest whole. That refuses everything the hook's line-by-line scan would, since no pattern is anchored. It covers data paths only: a Phase 9 `code.change` names repository paths, and that batch owes the same scan (amendment `w`). **Rollback had no commit to restore from**, so a refused batch left such a file as it had written it. `snapshotContent` now holds the bytes behind each `{ git: true }` it returns, first capture per path, cleared as each batch starts, and `rollback` writes them back. **Undo and redo** handed git a `data/`-relative path from the repository root, and redo checked out the commit's parent. `applySnapshot` now takes the side, `<commit>^` for a `before` and `<commit>` for an `after`, and prefixes `data/` unless the entry is a `code.change`. **A binary is `{ git: true }` at any size**, because as inline text it would be decoded lossily and written back corrupted. Nothing snapshotted a binary through `snapshotContent` before Phase 8's Delete and Rename. `lib/history/git-snapshot.test.ts` holds the reproductions, which failed six of seven before the fix.

90. **The link index checks the disk on every read, and backlinks and the graph are one reading of it.** `linkIndex()` compares `treeSignature()` before answering. The signature is a stat walk of every indexed file: path, size, modification and change times to the nanosecond, and file id. A write the store did not make is now seen, whether it is undo's `git checkout` or a note edited in another program. Until Phase 8 only store writes invalidated the cache, and `invalidateLinkIndex()`, which claimed to cover the rest, had no caller. **The residual gap is written where the signature is computed:** an edit that keeps the size and the file id and lands in the same timestamp tick as the write before it, with the index rebuilt between them. The tick is the file system's clock, 1–16 ms on NTFS, a few ms on Linux, 2 s on FAT32. A content hash would close it at the cost of reading every file on every request; the approval allowed either. `LinkIndex` now carries `titles`, from frontmatter or the first heading, and `taskIds`, id to path, both from the parse it already did. `lib/knowledge/graph.ts` builds backlinks, the graph and the Knowledge tree through one `nodeOf`, which folds a conversation's messages and annotations into it, and one task-id resolution. So a node's incoming graph edges are its backlinks by construction, and `graph.test.ts` checks it for every node of a fixture. Every result carries the index's `errors`.

91. **Files added to the §3 layout in Phase 8 Stage A.** `lib/history/document-actions.ts` (saves and checkbox clicks, `/api/files/write`), `lib/history/write-policy.ts` (Decision 86), and the file operations added to `file-actions.ts` (`/api/files/op`). `document-actions.ts` and `file-actions.ts` are §14's two routes. `file-actions.ts` itself was split from `actions.ts` in Step 0, by Decision 56's named domain seam. Also added: `lib/knowledge/graph.ts` (Decision 90), `lib/knowledge/search.ts` (Decision 87), `lib/knowledge/slug.ts` (`slugify`, moved out of `lib/store/knowledge.ts` so `items.ts` is pure: its header said so while importing a store module, and `components/imports.test.ts` now follows a component's value imports through `lib/` so a claim like that is checked rather than believed), `lib/security/credential-paths.ts` and `lib/security/raw.ts` (Decision 88), `lib/store/browse.ts` (the browser's trees and its one guarded read), `scripts/playwright-run.ts` (how `check:ui` hands its arguments to Playwright: `process.execPath` and the resolved CLI, never a shell, since a `-g` pattern with a space was split and one with `|` or `&` ran what followed on Windows), and the routes `app/api/files/{tree,read,raw,write,op}`, `app/api/search` and `app/api/knowledge/{tree,graph,backlinks}`. The store's `rename` is now `moveFile`, because `lib/store/files.test.ts` flags every member call of the fs verb so no write can skip `renameAtomic`, and the store's own function tripped it the first time anything called it.

92. **`lib/history/batch.ts` at 328 lines and `lib/store/files.ts` at 303 are over hard rule 5's cap, accepted as reported, and neither has a named seam left, so the next line added to either needs a Decision, not a judgement call** (the Stage A review, item 1). `batch.ts` went from 294 to 328 in Phase 8. The bytes behind each `{ git: true }` snapshot, held so `rollback` can write them back (Decision 89), belong beside `snapshotContent`, which takes them, and `rollback`, which reads them. Moving either would split the rollback across two files, which Decision 56 already named as the wrong cut. Decision 56's one named seam, `scanBatch` into `scan.ts`, was taken in Phase 7, so nothing is left to cut along. `files.ts` gained `treeSignature` (Decision 90), which has to walk exactly as `walk` does, and `moveFile`. Its header also claimed the uploads directory and manifest, which `manifest.ts` has owned since Phase 2; that is corrected. Neither file was split in Stage A because inventing a seam is a stop-and-ask. That remains the rule: whoever next needs a line in either file asks first, and names the seam in the Decision that answers.

93. **PDFs are served as downloads and an SVG in a document does not render. This is the current position, and each has a stated condition that would change it** (the Stage A review, item 7; Decision 88). It is a decision about evidence, not an omission. **PDF.** Chromium's viewer is believed not to run under `Content-Security-Policy: sandbox`, and a PDF can carry script. Nobody has shown the viewer safe without the sandbox, or working under it. What would change it is a check that serves a PDF carrying document-level JavaScript through `/api/files/raw`, opens it inline in the browser `check:ui` runs, and observes both that the page renders and that the script left no trace, such as a request to a marker URL. If the viewer renders under `sandbox`, PDF goes inline with the sandbox. If it only renders without it, the check has to show the script inert without it. Either way, §10.2's `<iframe>` returns for PDF, and not before. **SVG.** An SVG is text, and XML with script in it, so the raw route cannot sniff one apart from HTML the way it sniffs a PNG. It downloads, and a document that embeds one does not render it. What would change it is a check that an SVG carrying script and an external reference, served as `image/svg+xml` under the same `nosniff` and `sandbox` headers, runs nothing and fetches nothing in two cases: embedded with `<img>` in a document, and with its raw URL opened directly. With that check passing, SVG renders through `<img>` only, never `<object>`, `<embed>` or inline markup. Until one of these checks exists and passes, the position holds.

94. **The store follows a link on a read only as far as the browser's read would, and never writes through one** (the Stage A review, item 3). Stage A put the link rule in the browser's read route. Writes and every other store read resolved paths lexically with `resolveData`, and the file system followed whatever link was there. A save, a checkbox click, a rename, a delete and New folder through a junction in `data/` leading out of it each wrote outside `data/`. `lib/history/links.test.ts` reproduced all five before the fix. So did the open-document block (Decision 85). It checked the requested name, then read through `readBinary`, so a link named `notes.md` that led to `.env.local` would have put that file in the prompt sent to the provider. The review did not name that case; it was found while tracing where writes resolve. `lib/agent/context.test.ts` reproduced it. **The rule is now `paths.ts`'s**, and `files.ts` and `settings.ts` take it for every read and write:
    - **A read** resolves the real path (`realWithin`). It refuses one outside `data/`, and applies Decision 88's name rule to wherever a link led. Only where a link was followed: a path that is itself credential-shaped is its callers' to judge, because the store keeps uploads such as `….env` whose contents were scanned when they arrived.
    - **A write** is refused if any part of its path that exists is a link, wherever the link leads. That is stricter than a read, on purpose. A write through a link out of `data/` lands outside it. A write through a link that stays inside does not do what it says either: an atomic write replaces the path, so the link becomes a copy and the file it named is left unchanged. The refusal names the link.
    - **The browser's "Whole repo" read** takes the same `realWithin` against the checkout, so there is one rule, not two that can drift. `paths.ts`'s old claim that "nothing outside DATA_DIR is ever written" was not true against a link until this change, and its header says why it now is.

    Git restores are unaffected: `git checkout` writes the path as a path and follows no link. The tree walks already skip links, so none is listed. Each part of the rule was removed in turn, and each removal failed its own cases in `links.test.ts`, `context.test.ts` and `browse.test.ts`. A timing comparison of a git-heavy test file with and without the rule found no difference.

95. **`files/index.md` has no `used-by` column** (the Stage A review, item 2; §4.8 amended rather than built). §4.8 said the column "is filled from the link index on regeneration", and the column shipped empty until the index existed. Filled that way, it is stale by construction: a note that starts linking an upload does not regenerate the manifest. A stale answer to "who uses this" is worse than none, because it is the answer someone deletes a file on. An upload's backlinks in the document view answer the question live, and `kb:check`'s notice names the uploads nothing links to. The generator writes four columns, and the seed's `files/index.md` is exactly what it writes for an empty `files/` (`lib/store/manifest.test.ts` holds that). A table written with the fifth column keeps its descriptions. The owner's `data/files/index.md` changes shape the next time an upload regenerates it.

96. **Files added to the §3 layout in Phase 8 B1, and the rail's fourth icon is not one of them.** `components/browser/` gains `Tree.tsx` and `Panels.tsx` (the Knowledge and Files panels, §10.2's "same component, fed different `TreeNode[]` arrays"), `DocumentView.tsx` and `DocumentBody.tsx`, `FrontmatterTable.tsx`, `Backlinks.tsx`, `href.ts` (every address the browser hands out, pure, so node tests hold it), `useDocument.ts` (Decision 97), `remember.ts` (`localStorage`) and `Browser.module.css`. `components/markdown/checkboxes.ts` is Decision 98's line matching, and `lib/knowledge/checkbox.ts` holds the one task-line regex both it and `document-actions.ts` read, so the page and the route cannot disagree about what a box is. **Graph has no rail icon yet.** §10.2 lists four panels and Phase 8b builds the fourth; an icon that opens nothing is a dead end drawn on purpose, so it arrives with the view. `components/chat/Rail.tsx` now takes its panels as a record keyed by name rather than a single `children`, which is what let Phase 8 add two without touching the drag or the width; the fold does for three icons what Phase 6b's did for one.

97. **The document view never adopts a server render, and its one way in is ordered by issue** (Decisions 69 and 70, and the approval's instruction to watch that surface for a third form of amendment `u`). `app/chat/page.tsx` hands `DocumentView` a path, which tree that path is in, and the open conversation's id — never the file's contents — and keys it by `${where}:${path}`, so opening another file is a remount, not an update to adopt. `useDocument.ts` reads through `/api/files/read` alone: each `reload()` takes a ticket, and a read that returns after a later one was applied is dropped, which is what keeps a checkbox click's re-read from being undone by an older one in flight. Nothing in `components/browser/` calls `router.refresh()`, the route by which `u`'s stale render reaches the chat pane. A read that fails leaves the last good document on screen with the reason above it, because blanking a document someone is reading is the worse failure.

98. **A checkbox is clickable only while the page and the file provably agree on which line it is; otherwise every box in the file is disabled and says why** (the Phase 8 approval's checkbox condition; Decision 86). A rendered box does not know its line, and application code may not read one from a `data-*` attribute (AGENTS.md Conventions). So `components/markdown/checkboxes.ts` lexes the same stashed text the view renders, counts the math stash back out so a display block over several lines does not shift everything after it, and takes the nth task item the lexer found as the nth box drawn. It refuses to guess in three cases: the page drew a different number of boxes than the lexer found task items (raw HTML can draw an `<input>` of its own), a drawn box's ticked state is not its line's, or the line is not one `lib/knowledge/checkbox.ts` says a click can flip — a box inside a quote, which the route would refuse anyway. The reason is a sentence, shown above the body **and** on each box as its `title`, so a box that does nothing never looks like one that is broken. `DocumentBody.tsx` finds the boxes by position in document order, which is what the lines were matched against. **One consequence is load-bearing and not obvious:** the `dangerouslySetInnerHTML` prop is one object per HTML string. React 19 compares that prop by identity (`react-dom` 19.2's `updateProperties`) and assigns `innerHTML` whenever the object differs, whatever `__html` holds, so a fresh object per render re-set the HTML and put `marked`'s own `disabled` attribute back on every box after the layout effect had cleared it. Every node test passed while the boxes were dead in the browser. `components/markdown/Markdown.tsx` had the same shape, re-setting every finished chat message's markup on each render of the view. B1 reported it, and B2's first commit memoized it the same way, with a browser check that a reply's nodes survive a second turn (`e2e/chat.spec.ts`).

99. **The `data-*` convention is a check, and app code neither reads a `data-*` value nor selects on one** (the B1 review's addendum, widened by the B2 review's first decision). `components/data-hooks.test.ts` fails on `.dataset` in any form, on `getAttribute`, `getAttributeNS` or `getAttributeNode` with a literal `data-` name, and on any `[data-…]` attribute selector. It scans every source file under `app/`, `components/` and `lib/`, excluding test files and skipping comment lines. **Two breaches had stood since Phase 6b** while `MessageRow.tsx` said nothing read the attribute: `useSidebar.ts` read each row's id back off the element to measure it, and `anchoring-dom.ts`'s `rememberSelection` read the id of the row a selection was made in. **The review's reading is why the selectors went too:** the attributes are test hooks, so a check may rename one freely, and an app selector keyed on one makes app behaviour depend on a test hook, which is what the rule prevents — a selector is a read in every sense that matters.

    **The replacement is `components/chat/element-registry.ts`**, a map from a record's id to the element rendering it, filled by the elements themselves through callback refs. `MessageRow` takes `rowRef` and `Sidebar` takes the entries registry; `useSidebar`'s `measure` and its auto-centring, `scrollMessageIntoView`, `useAnnotations`' placement pass and `useAnnotationDraft` all ask the registry. Three properties are not obvious and are tested: the ref for a key is **one function for the life of the registry**, because React detaches and re-attaches a ref whose identity changed, so a fresh closure per render would churn the map on every keystroke; an entry leaves when its element unmounts while the function stays, which is what makes a remount safe; and `owner` **walks up** from a node to the nearest registered element, which is how `rememberSelection` traces a selection back to its message — it now remembers the message id, and `useAnnotationDraft` compares ids rather than elements.

    **One selector is left, and it is pinned rather than skipped.** §16.4's injected-UI filter asks whether a node sits inside *any* app control — a class of elements, not an identity — so there is no element to look up, and §16.4 spells that filter `[data-ui]` in the spec itself. The check therefore requires **exactly one** selector in the tree: in `anchoring-dom.ts`, inside `textNodes`, matching `[data-ui]`. A second one in that file fails, so does moving it out of that function, and so does any selector anywhere else — which is what stops "the file may" from becoming the address-scoped rule that let three writers drift past Decision 71. It is reported for the owner to decide rather than forced into a ref. **The alternative, if they want it:** index the message *body* element, which `MessageRow` would register like the row, so chrome is outside the indexed subtree and no filter is needed at all. That is a spec change to §16.4's port sentence and a change to what an anchor offset is measured against, which is why it was not taken unilaterally.

    **What the check still does not cover**, on the record: a `getAttribute` whose name is not a literal, and a selector assembled from fragments at runtime.

100. **A test run removes every temp directory it makes, and fails if it did not** (the B1 review's addendum). Nothing had removed them. 430 were in `%TEMP%` when B2 began, from 21 test files: the fifteen that call `createCheckout`, and six that called `mkdtemp` themselves. All 21 now go through `lib/testing/checkout.ts`. `createTempDir` makes the directory and writes it to the run's registry, then registers an `afterAll` on the calling file that removes it, with retries. `createCheckout` is `createTempDir` plus `git init`. **`afterAll` was not enough, and two failures showed why.**
    - A file that throws while loading is never collected, so its hooks never run. Planting a throw after `createCheckout` left the directory behind.
    - On a machine under load, a test that times out leaves git running with the checkout as its working directory. Removal then fails with EPERM, even on a directory already emptied. That left 11 directories across two runs, before the registry existed.

    A process-`exit` backstop was tried and never fired: vitest ends its workers without one. So `lib/testing/leftovers.ts`, a vitest `globalSetup`, is both the check and the last line of removal. It lists the test-made names in the temp directory before the run and again after it. For each new one, it removes the directory if it is registered and reports what happened. It fails the run whenever any is new, including one it removed, because a directory its file should have removed is exactly what the check exists to catch. It counts names under the suite's two prefixes, `attune-` and `check-ui-args-`, not the whole of `%TEMP%`, which every process on the machine shares. Directories that were there when the run began are never touched. **Mutation-tested**, each against a clean baseline:
    - per-file removal off: all 693 tests pass, the run fails naming 21 directories, and teardown removes them;
    - that plus the check off: the run passes and leaves 21;
    - a throw planted at load: the run fails naming the one directory, and teardown removes it;
    - that plus teardown's removal off: the one directory stays;
    - a planted failing test: that test fails, and nothing is left.

    **One rule for callers, found by the check itself:** `createTempDir` must be called at the top of a test file, while vitest is collecting it. Called from `beforeEach` or `beforeAll`, its `afterAll` is registered too late and never runs. `scripts/check-ui.test.ts` did both on its way to Decision 101, and the teardown named every directory each time.

101. **Every `check:ui` run keeps the evidence of each failing check in a folder no later run overwrites** (the review of B2's first commit: "a failure nobody can read is a failure we can't rule out"). Three failures in B2's first commit could not be explained afterwards. The error text went only to the terminal. The traces went to `test-results/`, which Playwright empties at the start of each invocation, and `check:ui` makes two, so the known flakes' run wiped the gating run's traces before the run was over. The server's output was interleaved in the scroll with no times on it. Now `playwright-run.ts` picks one folder per run, `check-ui-evidence/<start time>/` (git-ignored and never pruned), and hands it to both invocations in `CHECK_UI_EVIDENCE`. `scripts/ui-evidence.ts`, a Playwright reporter beside the list reporter, fills it:
    - `server.log`: every line the dev server printed, each stamped with the time it arrived;
    - for each check that did not end as expected, `failures/<n>-<project>-<spec>-<line>-<title>/failure.txt`: where it is, how it ended and after how long, every error with its stack and snippet, the check's own output, and the server lines that arrived while it ran, with a copy of its trace and other attachments beside it;
    - `errors.txt`: anything that failed outside a check, such as the server not starting or a run cut short.

    The two `--list` counts pass `--reporter=list`, which replaces the configured reporters for those calls, so a count that matches nothing is not written up as an error. The run's last line names the folder and how many failures it holds. `trace` stays `retain-on-failure`. **Checked in a real run** with two planted failures, one gating and one tagged `@known-flake`: both folders held `failure.txt` and `trace.zip`, while `test-results/` held only the flake's. **Mutation-tested**, each failing only its own case in `scripts/check-ui.test.ts`:
    - no `failure.txt` written: the two cases that expect one fail;
    - no trace copied: the case that reads the copy fails;
    - server lines not limited to the check's own window: the same case fails, on the line from before the check began;
    - the folder not handed to the runs: the invocation case fails;
    - the counts keeping every reporter: the invocation case fails.

102. **The document view's editing is the file's bytes, a table that gives back the shape it took, and one save that sends both — and the warning about unsaved work is where §10.2 put it** (§10.2, Decision 86). The editor is a monospace textarea holding the body exactly as it is on disk; the markdown pipeline runs on the preview side and never touches it, which is what makes §15's "a LaTeX sheet through Edit and Save keeps its SHA-256" a property rather than a hope. The frontmatter table edits in preview as well as in Edit, because they save together: `asValue` puts a value back in the shape the file had it in — a list stays a list, a number stays a number while the text still reads as one, an empty cell means "not set" as a hand-edited `due:` does (§4.1) — and a value no text box can hold without flattening it, an object or a list of them, is shown and not editable. **`base` is captured when the draft starts, not when Save is pressed**, which is the whole of what a 409 means: the bytes the editor opened. A save taking the version of the last *read* would pass every check that does not re-read in between, and would then overwrite another program's edit without a word; the browser check makes the window focus in the middle for exactly that reason.

     **The toggle shows the draft, so only leaving warns.** Preview renders what has been typed rather than what is on disk, which makes Edit and Preview two views of one draft instead of two documents: switching cannot lose a character, so it asks nothing. `beforeunload` covers the tab and an in-app confirm covers "← Back to chat", because leaving is the one way the draft is actually lost. **It was built the other way first** — the toggle warned and then discarded — on the reading that §10.2's "the toggle and navigation warn when dirty" had to describe something the code did. The owner's ruling is the better one and §10.2 now says it: a warning does not redeem throwing work away, because people dismiss warnings, and preview is what the button means.

     **What stops taking clicks while a draft is open is every control that writes the file by another route**: a checkbox, a task's Complete and `⋯` menu, and a collection item's "Make this a task". Each writes immediately and against the file, so it would land on bytes the draft no longer matches and make the next Save a conflict nobody caused. The checkbox was the only one of the four in B2; the other three were reachable in a dirty preview then too, since the frontmatter table has always been editable there, and previewing the draft is what made that obvious rather than what made it true.

103. **A message typed under a document is handed to the conversation through `sessionStorage`, and the turn does not start during the mount cycle** (§10.2, the Phase 8 approval's open call 3). The composer docked under a document does three things in order: makes the conversation exist and carry this file as its `context.file` (§16.9, reading the conversation first so a blind write does not drop the task ids "Ask about this" put there), stores the text under `attune.handover:<conversation>`, and only then navigates. The text is never in the address, which is the approval's condition — an address is copied, kept in history and shown in a tab title. **Nothing may lose it**, so: storage that refuses answers false and the send is refused with the text still in the box; the entry is taken with a read-and-remove, so it is sent once; a marker `&ask=1` with no entry behind it becomes a message above the composer rather than silence; and a send that is refused puts the text back in the box through the composer's `handed` prop.

     **The mount-cycle rule is the part that was found by running it, and it would have been invisible in production.** `useConversation` aborts its request when the view unmounts, which is what stops a stream leaking on navigate-away (§16.8), and React's development remount runs that cleanup once on the way in — so a send started in a mount effect is aborted before it leaves. The first run of the check showed the reply stuck at `streaming`, no `POST /api/chats/<id>/messages` in the server log at all, and `settle()`'s re-read in it, which `send` runs only on the abort path. The handover waits one render, which is a state change rather than a timer: what is being waited for is a render, and that is the thing renders announce. The app only ever runs under `next dev`, so this is not a development-only wrinkle; it is the only mode there is.

104. **Files added to the §3 layout in Phase 8 B2, and what amendment `m` moved.** `components/browser/` gains `DocumentEditor.tsx` and `useDocumentDraft.ts` (Decision 102), `DocumentComposer.tsx` and `handover.ts` (Decision 103), `FileMenu.tsx` and `useFileOps.ts` (the Files panel's New file, New folder, Rename and Delete, each one batch through `/api/files/op` or the create half of `/api/files/write`), `TaskDocument.tsx` (§10.2's Complete button and `⋯` menu on a task file) and `CollectionItems.tsx` (amendment `s`). `components/shell/Search.tsx` is §10.0's field, `Ctrl/Cmd+K` included. `components/chat/useHandover.ts` is the receiving end of Decision 103.

     **Amendment `m` fired and was taken as written.** The document view is the third surface to want Today's task pieces, so `TaskEditForm.tsx`, `TaskMenu.tsx`, `format.ts` and `TaskList.module.css` moved from `components/today/` to `components/tasks/`. Two things moved with them that the amendment did not name and that the move made obvious. `RowActions` was declared in `TaskRow.tsx`, so a shared menu importing it would have depended on the surface it was extracted from; it is now `components/tasks/actions.ts`. And the ~70 lines of `run(...)` calls behind a row — complete, duplicate, reschedule, delete, the inline save — were `TodayView`'s, and a second hand-written copy in the document view is exactly the divergence Decision 53 records, so they are `useTaskActions` in the same file. Each surface supplies only what is its own: how to re-read after a write, and whether it has anywhere to open an "Ask about this" (the document view does not, because the composer under it *is* the Ask).

     **What the Files panel's menu decides is Decision 105**, which the Phase 8 close took. As B2 built it the menu offered the same entries everywhere under `data/` and the refusal came back from `write-policy.ts` afterwards; that was narrower than Decision 86's "the view shows only what will work", and it is no longer how it works. **"Reveal in graph" is still not in the menu**: Decision 96 already settled that an affordance opening nothing is a dead end drawn on purpose, so it arrives with Phase 8b's view.

105. **The Files panel's row menu is the write policy read for a row, and the reading happens on the server** (§10.2, Decision 86). `rowPolicy` in `lib/history/write-policy.ts` answers four questions for one tree node — Rename, Delete, New file, New folder — and every answer it gives is a string `policyFor` or `folderPolicy` already returns: null where the builder would allow it, and the builder's own sentence where it would not. `GET /api/files/tree` calls it for each node of the data tree and hands the result down beside the tree; the menu disables an entry whose answer is a sentence and shows that sentence under the label. **Nothing about enforcement moved.** A request that never saw a menu meets the same refusal inside the batch, which is what the browser check asserts by renaming a note over HTTP after finding the entry disabled.

     **Why the reading is on the server and not in the component.** §3 keeps `lib/history/` closed to everything under `components/`, types included, so a component cannot ask the table directly; the route can, and a route is how components reach `lib/` for everything else. The alternative — a copy of the rules in the view — is the thing the condition ruled out, and it is the shape that let three writers drift past Decision 71. `RowPolicy` is declared in `FileMenu.tsx` as the wire shape, which is a record of four nullable strings and not a rule. **The invariant is checked rather than described**: `lib/history/write-policy.test.ts` asserts, for a table of files and folders, that each of the four answers is *the same string* the primitive gives, so a sentence hand-written into `rowPolicy` fails a test instead of quietly disagreeing with the builder in a menu nobody compares.

     **Two things the menu still offers and the writer still refuses, named rather than papered over.** A new file under `knowledge/notes/` needs the map §6.3 requires, and this menu has no way to ask for one; a new file under `knowledge/maps/` or `knowledge/collections/` needs frontmatter that an empty new file has none of. Both are enforced where the record is written — `saveAction`'s map-link check and the record schemas — not in the table, so a sentence for either one in `write-policy.ts` would be a second copy of a rule that lives elsewhere, which is what this decision exists to avoid. They arrive as a refusal beside the typed name, which is where §13.5 puts it, and `write-policy.test.ts` pins them so they read as a known edge rather than an oversight. **A folder's Rename moved into the table** on the way: the sentence was a literal in `renameAction`, and it is now `folderPolicy(rel).rename`, so the entry the menu greys out and the error the builder throws are one string.

---

## 1. Hard rules

These override anything else in this document.

1. **Do not overcomplicate.** Prefer the boring solution. No abstraction until there are three concrete uses. No state-management library, ORM, component library, or CSS framework. If a feature can be a function in an existing file, it does not get a new file.
2. **Dependency budget: 12 runtime dependencies**, not counting `next`, `react`, `react-dom`. Eight are allocated (Decision 28). Adding one requires writing down what it replaces and why hand-rolling is worse.
3. **No AI-authorship attribution anywhere.** No `Co-Authored-By`, no "generated with", no assistant name in commits, docs, comments, or UI copy. Model IDs in code and settings are fine.
4. **Secrets never touch `data/`.** See §11.5.
5. **No source file over ~300 lines.** Split by feature, not by layer. The cap applies to modules containing logic; CSS modules and test files are bounded by their subject instead (Decision 56).
6. **Every write goes through the history layer.** No component or route writes to disk directly. There are exactly three exceptions: `.env.local` (through `lib/store/env.ts`, logged by key name); files the Agent SDK writes in Build mode, captured afterward as one `code.change` batch; and `history.streamingWrite()`, which may write only `data/chats/*/messages/*.md` files whose `status` is `streaming`, and whose final content is always logged and committed through `runBatch` at finalize (§8).
7. **`lib/store/` is the only module that touches the filesystem; `lib/agent/` is the only module that talks to a model provider.** Everything else calls async functions.

---

## 2. Stack

- **Next.js 15, App Router, TypeScript strict**, single process. `npm run dev` serves UI and API on one port.
- **Node 24** (the machine has 24.14). Next's compiler builds the app, but the CLI scripts under `scripts/` import `lib/**/*.ts` through plain Node, so **type stripping is a hard requirement**, not a convenience — Decision 44 records the constraint that puts on `lib/`. `tsc` is the type check and emits nothing.
- **Client components + `fetch` to API routes.** No server actions. Every API route is a thin adapter: parse input, call a `lib/` function, return JSON or a stream.
- **Plain CSS.** `app/theme.css` defines the tokens (§11.3); each component has a CSS module. No Tailwind, no CSS-in-JS.
- **Tests:** `vitest`, files beside the code as `*.test.ts`. Only pure modules are required to have tests (§16.10); everything else is a manual checklist in `docs/CHECKLIST.md`. Any phase that produces a check no automated test can answer adds it there when it produces it, with the date it was verified or the word *pending*; Phase 11 completes the file rather than starting it. Phase 3 started it.
- **Git** is shelled out to with `child_process.execFile('git', [...])`. No git library.

Two seams and nothing more:

- **`lib/store/`** exports named functions (`listTasks`, `writeTask`, `readSettings`, …). Replacing local files with object storage means replacing this module's internals.
- **`lib/agent/`** exports `runChatTurn`, `extractProposals`, `runBuild`. A hosted version runs these on a worker.

---

## 3. Repository layout

```
app/
  layout.tsx                 # shell: tabs, search, sync indicator, theme loader
  page.tsx                   # Today
  chat/page.tsx
  calendar/page.tsx
  settings/page.tsx
  theme.css
  api/                       # every route is <10 lines of adapter; see §14
    respond.ts               # the one {ok:...} JSON shape and the StoreError-to-status mapping
components/
  shell/                     # Tabs, Search (§10.0's field and Ctrl/Cmd+K), SyncStatus, Toast
  today/                     # DayHeader, TaskRow, TaskList, Timeline, Weather, FirstRunCard
  calendar/                  # CalendarView, CalendarGrid, DayCell, SelectionBar
  tasks/                     # what more than one task surface uses: writes.ts (the write layer),
                             #   actions.ts (RowActions and the writes behind a row), TaskMenu,
                             #   TaskEditForm, format.ts, TaskList.module.css (amendment `m`)
  composer/                  # ComposerButton, ComposerSheet, ModeSelector, PreviewPanel, TaskCard,
                             #   ProposalPanel, KnowledgeCard, CollectionCard (the tray — Decision 80)
  chat/                      # Conversation, MessageView, ChatComposer, Sidebar, Annotations, QuoteRefs
  browser/                   # Tree + Panels (Knowledge, Files), DocumentView + DocumentBody,
                             #   DocumentEditor + useDocumentDraft (edit and save, Decision 102),
                             #   FrontmatterTable, Backlinks, TaskDocument, CollectionItems,
                             #   FileMenu + useFileOps (the Files panel's operations),
                             #   DocumentComposer + handover.ts (Decision 103),
                             #   href.ts (every address it hands out),
                             #   useDocument.ts (the open file, ordered — Decisions 69, 70),
                             #   remember.ts (localStorage); GraphView is Phase 8b's (Decision 96)
  history/                   # HistorySheet
  settings/                  # one file per settings section
  markdown/                  # Markdown.tsx (marked + katex + dompurify), pipeline.ts (Decision 31,
                             #   with a document's own link and image rules), checkboxes.ts: which
                             #   body line each drawn box came from, and whether any may be clicked
lib/
  store/                     # ONLY module that touches the filesystem
    paths.ts                 # DATA_DIR, SEED_DIR, REPO_DIR, resolveData(rel) with traversal guard, and the link rule (Decision 94)
    frontmatter.ts           # split(text) → {data, body}; join(data, body); yaml parse/stringify
    tasks.ts                 # Task schema, defaults, listTasks/readTask/writeTask/deleteTask
    settings.ts              # Settings schema, defaults, readSettings/writeSettings
    files.ts                 # listTree, read/write/delete/rename/mkdir, append + tail edit for the log
    manifest.ts              # uploads directory (addFile) and the generated files/index.md table
    chats.ts                 # conversations, messages, annotations
    knowledge.ts             # notes, maps, collections, index.md regeneration
    env.ts                   # .env.local read/write, key masking
    browse.ts                # the file browser's trees and its one guarded read (Decision 88)
    events.ts                # onWrite(cb): store emits {paths} after any write
  history/
    log.ts                   # appendActions, readActions, groupBatches, nextSeq, regenerateMirror
    batch.ts                 # runBatch(): the one entry point every mutation uses; snapshot capture
    scan.ts                  # every refusal before logging: secrets, contested streams, §6.3 (Decision 56)
    in-flight.ts             # streaming paths and their owning turn, excluded from commits (Decision 76)
    repository.ts            # git confined to REPO_DIR's own repository (Decision 75)
    actions.ts               # the ActionSpec builders (task.create/update/delete, settings.update)
    knowledge-actions.ts     # knowledge writes, collections, promote (Decision 77)
    file-actions.ts          # uploads, New folder, Rename, Delete — /api/files/op (Decision 91)
    document-actions.ts      # saves and checkbox clicks from the document view — /api/files/write (Decision 86)
    write-policy.ts          # what the document view may do to a file, by path (Decision 86)
    auto-applied.ts          # the transcript's auto-apply markers, read from the log (Decision 79)
    undo.ts                  # undoBatch, redoBatch, conflict check
    git.ts                   # commit, push (debounced), flush, status, show, revert
    queue.ts                 # in-process serial queue for all writes
  schedule/
    dates.ts                 # timezone helpers, today(), daysBetween, minutesFromMidnight
    rank.ts                  # score(), rankDay()
    timeline.ts              # packDay()
    calendar.ts              # gridFor(), shiftAnchor(), groupDays()
  chat/                      # pure functions, no fs, no DOM
    types.ts                 # Message, Conversation, Annotation: zod schemas + inferred types
    tree.ts                  # buildTree, activePath, siblingsOf, latestLeafUnder, buildPairs
    text-match.ts            # ported verbatim from HANDOFF Part E
    anchoring.ts             # findQuote, findAnchorText (pure half)
    refs.ts                  # extractRefs(text)
    quotes.ts                # parseQuoteReply(text) and its source lookup (§16.6)
    uuid.ts                  # uuidv7(), ported from HANDOFF Part B (monotonic — Decision 61)
  agent/                     # ONLY module that talks to a provider
    registry.ts              # model registry + Provider type
    anthropic.ts             # Provider implementation
    context.ts               # assembleContext()
    tools.ts                 # tool definitions + read-only executors + proposal collectors
    prompts.ts               # system prompt text per mode
    chat.ts                  # runChatTurn(): the streaming loop
    finalize.ts              # finalizeTurn and discard: the one finality contract, §16.3 (Decision 77)
    build.ts                 # Agent SDK: plan, apply, capture
    memory.ts                # the remembering heuristic as prompt text + proposal filter
    auto-apply.ts            # §6.3's one write per turn that skips the card (Decision 79)
    distill.ts               # a conversation → a session summary proposal (Decision 80)
  knowledge/
    checkbox.ts              # the one GFM task-line rule: which lines a click may flip (Decision 96)
    links.ts                 # extractLinks(fromPath, data, body); resolution precedence (Decision 74)
    items.ts                 # collection item lines and slugs (§4.5)
    index.ts                 # LinkIndex build/cache, checked against the disk on every read (Decision 90)
    graph.ts                 # backlinks, the graph and the Knowledge tree, one reading of the index (Decision 90)
    slug.ts                  # slugify, pure (Decision 91)
    check.ts                 # kb:check rules and its three exit codes (Decision 73)
    search.ts                # the shell's scan search, /api/search its only caller (Decision 87)
  security/
    secrets.ts               # SECRET_PATTERNS, shared by the write path and the pre-commit hook (§11.5)
    credential-paths.ts      # file names the browser never shows, reads or writes (Decision 88)
    raw.ts                   # how /api/files/raw serves bytes: sniffed, sandboxed (Decision 88)
  testing/
    checkout.ts              # the throwaway checkout every committing test uses, and every test temp dir (Decisions 75, 100)
    leftovers.ts             # vitest globalSetup: a run that leaves a temp dir fails, and teardown removes it (Decision 100)
  weather.ts                 # Open-Meteo geocode + forecast, cached
scripts/
  dev.mjs                    # spawns next dev; flushes push on exit
  init.mjs                   # seed/ → data/
  postinstall.mjs            # git config core.hooksPath .githooks; runs on every npm install
  history.mjs                # CLI: list | undo <batch> | redo <batch>
  check-lib-imports.mjs      # imports every lib/**/*.ts in plain Node; runs first in `npm test`
  check-ui.mjs               # npm run check:ui: port guard, browser check, then playwright-run.ts
  playwright-run.ts          # Playwright run with no shell; known flakes apart (Decisions 83, 91)
  ui-evidence.ts             # reporter: each failing check's errors, trace, server log kept (Decision 101)
  kb-check.mjs
  check-secrets.mjs
  publish-check.mjs
  publish.mjs
seed/                        # blank-slate copy of every data file — SHIPPED
data/                        # yours — private repo only (layout in §4.7)
docs/
  CHECKLIST.md               # manual acceptance checklist; added to by every phase, completed in Phase 11
.githooks/pre-commit         # #!/bin/sh, LF, +x in the index; runs check-secrets on staged files
.gitattributes               # * text=auto eol=lf
.env.local                   # gitignored
```

Who may touch the store, stated once so it stops eroding:

- **Route-level server files — `app/**/page.tsx`, `app/**/layout.tsx`, and `app/api/**/route.ts` — may call `lib/store` and `lib/history` read functions directly.** They are the server-side edge of the app, the same category as an API adapter, and a page that fetched its own data over HTTP from itself would not be the boring option. The one `lib/history` read a page makes is `app/chat/page.tsx`'s `autoAppliedIn` (Decision 82).
- **Everything under `components/` goes through an API route.** Components never import a value from `lib/store/`, and never import anything from `lib/history/`; they may import pure modules (`lib/chat/`, `lib/schedule/`). **A type-only import from `lib/store/` is allowed** — `import type { Task } from "@/lib/store/tasks"` — because it is erased at compile time and leaves a component nothing to call; the thing this rule protects against is a component that can reach `node:fs`, and a type cannot (Decision 82). `lib/history/` is closed to types too: a shape a component needs belongs in a pure module, as the auto-applied marker's does in `lib/chat/types.ts`.
- **A record's *shape* is therefore not the store's to own.** `lib/chat/types.ts` holds `Message`, `Conversation` and `Annotation` for exactly this reason: a component has to know what a message is, and if that lived in `lib/store/chats.ts` the only way to find out would be to import a module that touches `node:fs`. The rule above is what creates the seam, so the seam is named here rather than discovered per phase (Decision 62).
- **Every mutation goes through an API route and `runBatch()`, whichever kind of file is asking.** The read exemption above is a read exemption; a `page.tsx` writes no more directly than a component does.

---

## 4. Data model

All dates are interpreted in `settings.timezone`. Timestamps are ISO 8601 with offset. Date-only fields are `YYYY-MM-DD`. Date-time fields are `YYYY-MM-DDTHH:mm` (local to the timezone, no offset, so hand-editing is easy).

### 4.1 Task

Path: `data/tasks/<date>-<slug>.md`, where `<date>` is `due` if set at creation, else the creation date. The filename never changes afterward.

```markdown
---
schema: 1
id: t_20260903_7fa2
title: Linear algebra problem set 4
status: todo            # todo | doing | done | archived
priority: 2             # 1 critical | 2 high | 3 normal | 4 someday
estimateMin: 90
due: 2026-09-10         # date or date-time, or empty
scheduled: 2026-09-08   # date or date-time; empty = auto
completedAt:
category: school
context: MATH 221
tags: [pset, weekly]
links:
  - files/docs/2026-09/pset4.pdf
repeat:                 # none | daily | weekly | biweekly | monthly
repeatUntil:
source:                 # chat:<conv-id> | prompt | collection:<path> | manual
collection:             # knowledge/collections/movies.md#dune (promote-to-task backlink)
createdAt: 2026-09-03T14:12:00-04:00
updatedAt: 2026-09-03T14:12:00-04:00
createdBy: agent       # user | agent
---

Chapters 4.1–4.3. Office hours Thursday if 4.3 is still unclear.

- [ ] 4.1 problems
- [ ] 4.2 problems
```

**Required:** `id`, `title`, `status`, `createdAt`, `updatedAt`. A file with only `title` loads: `readTask` fills `id` from the filename hash, `status: todo`, timestamps from file mtime, and writes the completed frontmatter back on the next save (not on read).

**Defaults for optional fields:** `priority: 3`, `estimateMin: null` (ranker treats as 30), `due: null`, `scheduled: null`, `completedAt: null`, `category: null`, `context: null`, `tags: []`, `links: []`, `repeat: null`, `repeatUntil: null`, `source: "manual"`, `collection: null`, `createdBy: "user"`.

**Id format:** `t_<YYYYMMDD>_<4 lowercase hex>`; hex from `crypto.randomBytes(2)`. Regenerate on collision (check `listTasks()`).

**Slug rules:** title → NFKD → strip diacritics → lowercase → replace runs of non `[a-z0-9]` with `-` → trim `-` → truncate to 40 chars at a hyphen boundary → fall back to `task` if empty. **Collision:** append `-2`, `-3`, … until free.

**Links** are relative to `data/` (`files/docs/...`, `knowledge/notes/...`, `tasks/...`) so they are the same string in the graph, in backlinks, and in the file tree. Markdown links in bodies may be relative to the file instead; the link extractor normalizes both.

**Completion** sets `status: done` and `completedAt: now`. If `repeat` is set and (`repeatUntil` is empty or next due ≤ `repeatUntil`), the same batch creates the next instance: new id, new file, `due` and `scheduled` advanced by the interval, body copied with checkboxes unticked, `source` unchanged. Undoing the completion removes the new instance because they share a batch. Monthly adds one calendar month clamped to the last day.

`collection` is **not** carried to the next instance; it is cleared. It is a one-to-one backlink to the list item that became a task, and the collection's own `tasks` array holds only the first instance — two tasks claiming the same item is a broken link in both directions. `source` is different in kind: it records where the work came from, not which item it *is*, so it carries forward.

**A repeat needs an anchor.** A task with `repeat` set and both `due` and `scheduled` empty is refused at write time — `writeTask` throws `StoreError("invalid")`, so every caller is covered, including the agent (Decision 52). There is nothing for the interval to advance from, and completion time is not a substitute.

**Subtask progress:** `- [ ]` / `- [x]` lines in the body are counted for the `2/4` indicator. Clicking a checkbox in preview writes the body with that line toggled (a `task.update`).

### 4.2 Knowledge note

Path: `data/knowledge/notes/<slug>.md`.

```markdown
---
schema: 1
id: n_20260903_1a2b
title: Office hours for MATH 221
type: fact              # fact | how-to | reference | decision | person | course | project
tags: [math221]
links: [knowledge/maps/courses.md]
source: chat:c_20260903_9f1c    # chat:<id> | file:<path> | manual
confidence: high        # low | medium | high
updatedAt: 2026-09-03T15:00:00-04:00
---

Thursdays 3–5pm, Room 204. Go with specific questions written down.
```

Body cap ~200 words (reported by `kb:check`, not enforced on write).

### 4.3 Map

Path: `data/knowledge/maps/<name>.md`. Frontmatter: `schema`, `id`, `title`, `updatedAt`. Body is hand-curated markdown: a list of links, each with a one-line reason. Maps are edited, never generated. The seed ships `courses.md`, `projects.md`, `people.md`, `tools.md`, each with a one-line description and no links.

### 4.4 `index.md`

`data/knowledge/index.md` is regenerated by `lib/store/knowledge.ts` whenever a map or profile file is written, or a collection is created. Content: a heading, one link per profile file, one link per map with its `title`, one link per collection. Links are `data/`-relative, the form `read_knowledge` takes (Decision 74). It is a generated view; edits to it are overwritten, and it is rewritten only when its content would change.

### 4.5 Collection

Path: `data/knowledge/collections/<slug>.md`.

```markdown
---
schema: 1
id: k_20260903_3c4d
title: Movies to watch
kind: list              # list | reference
context:                # same field as tasks
tags: []
links: [knowledge/maps/projects.md]
tasks: []               # task ids created from this collection
createdAt: 2026-09-03T15:10:00-04:00
updatedAt: 2026-09-03T15:10:00-04:00
---

- [ ] Dune — the 2021 one first
- [ ] Arrival
```

Items in a `list` collection are body checkboxes. **Collection items never enter the ranker.** "Make this a task" creates a task with `source: collection:<path>` and `collection: <path>#<item-slug>`, appends the task id to the collection's `tasks`, and appends ` → [[t_…]]` to the item line, all in one batch. The item slug is the slug of the item's text before any ` — ` description, which is what makes `Dune — the 2021 one first` the `#dune` of §4.1's example; a slug repeated in one collection takes `-2`, `-3` in order of appearance. The description becomes the task's body. An item already carrying ` → [[t_…]]` is refused a second promote: two tasks claiming one item is a broken link in both directions.

### 4.6 Session summary

Path: `data/knowledge/sessions/<conv-id>.md`. Frontmatter: `schema`, `id` (= conversation id), `title`, `createdAt`, `messageCount` — filled by the store when the summary is written, from the conversation itself, never taken from the proposal. Body: the distilled summary. Never loaded into context unless the user references a past conversation by name or the model calls `read_knowledge` on it.

### 4.7 Chats

```
data/chats/<conv-id>/
  conversation.md
  messages/<uuidv7>.md
  annotations/<uuidv7>.md
```

`conversation.md`:

```markdown
---
schema: 1
id: c_20260903_9f1c
title: Change of basis
activeLeafId: 019f3e54-bcd7-7b52-b5c6-c08c663367f5
pinned: false
model: claude-opus-5
context:
  file: knowledge/collections/equations-math221.md
  taskIds: [t_20260903_7fa2]
createdAt: 2026-09-03T16:00:00-04:00
updatedAt: 2026-09-03T16:20:00-04:00
---
```

The body is empty. `activeLeafId` is the entire branch state. `context` is the association from §16.9: it is set when the conversation is started from a document view or "Ask about this", and reopening the conversation keeps that context in every turn and shows the file as a chip in the header (§16.9).

`messages/<id>.md`:

```markdown
---
schema: 1
id: 019f3e54-bcd7-7b52-b5c6-c08c663367f5
parentId: 019f3e54-bcd7-790e-8728-9143e4799a2c    # null for a root
role: assistant                                    # user | assistant
status: complete                                   # streaming | complete | failed
createdAt: 2026-09-03T16:01:12.410-04:00
model: claude-opus-5
attachments: []                                    # paths under data/, from §4.8's manifest
refs: [t_20260903_7fa2, knowledge/notes/office-hours-math221.md]
deleted: false
error:                                             # set when status = failed
---

The message text, verbatim markdown.
```

`refs` is computed at finalize by `extractRefs(text)` (§16.9) and stored so the link index does not have to parse every message body.

`attachments` holds `data/`-relative paths into `data/files/` (§4.8, §9.2) — the same shape as `refs`, and **not** a conversation-local directory. There is one uploads directory in this project and it is the one with a manifest, content-hash dedup, backlinks and an undo story (Decision 65).

`annotations/<id>.md`: frontmatter exactly the `Annotation` type in §16.4 plus `schema: 1`; body is the annotation text.

### 4.8 Files and manifest

`data/files/<images|docs|other>/<YYYY-MM>/<sha256-8>-<sanitized-name>`. The eight-hex-char content prefix prevents collisions and makes re-uploads idempotent. `data/files/index.md` is a generated table: `| path | added | source | description |`. **It has no `used-by` column** (Decision 95): who uses a file is its backlinks in the document view, read live from the link index. A column filled on regeneration would be stale from the first link written after it, and a stale answer to "who uses this" is the one someone deletes a file on. A table written with the old fifth column keeps its descriptions.

### 4.9 Settings

`data/settings/settings.json`, validated by a zod schema in `lib/store/settings.ts`. Unknown keys are preserved; missing keys get defaults; an unparsable file is renamed to `settings.json.broken-<ts>` and replaced with defaults, with a toast. The example below is a populated user file; the seed copy differs only in `weather` (`query: ""`, no `lat`/`lon`/`label`), so a fresh clone ships with weather off (Decisions 38, 51).

```jsonc
{
  "schema": 1,
  "identity": { "name": "", "nickname": "" },
  "timezone": "America/New_York",
  "weather": { "query": "New York City", "lat": 40.7128, "lon": -74.006, "label": "New York", "units": "fahrenheit" },
  "theme": "light",
  "day": { "startMin": 600, "endMin": 1440, "blocks": [[600, 780], [840, 1080]], "breakMin": 10 },
  "list": { "focusSize": 5, "lookaheadDays": 14, "showCompleted": true },
  "categories": ["school", "personal"],
  "firstDayOfWeek": "monday",
  "models": {
    "default": { "model": "claude-opus-5", "effort": "high" },
    "extract": { "model": "claude-opus-5", "effort": "medium" },
    "build": { "model": "claude-opus-5" }
  },
  "sync": { "pushDebounceMs": 30000, "autoPush": true }
}
```

`day.endMin` may exceed 1440 (1560 = 2:00 next day).

**Weather is off when `lat`/`lon` are absent** (Decision 51). `lat`/`lon` are what the forecast call needs, `query` is only how they were found, and `label` is what is displayed. A text search sets all four; "Use my location" sets `lat`/`lon` and `label: "My location"` with `query` empty, because Open-Meteo has no reverse lookup; **Clear** wipes all four. A populated `query` with no coordinates is a search that never resolved, and weather stays off.

### 4.10 Themes

`data/settings/themes/<name>.json`: `{ "schema": 1, "name": "…", "base": "light" | "dark", "tokens": { "--bg": "#…", … } }`. Tokens omitted fall through to the base. `light` and `dark` are defined in `app/theme.css` and are protected: no file, cannot be edited or deleted. The token list is in §11.3.

### 4.11 Action log

`data/history/actions.jsonl`, one object per line:

```json
{"schema":1,"seq":142,"ts":"2026-09-03T14:12:00-04:00","batch":"b_20260903_141200_7fa2","actor":"user","scope":"user","type":"task.update","summary":"Moved 'Pset 4' due to Sep 12","targets":["tasks/2026-09-10-pset-4.md"],"before":{"tasks/2026-09-10-pset-4.md":{"fields":{"due":"2026-09-10"}}},"after":{"tasks/2026-09-10-pset-4.md":{"fields":{"due":"2026-09-12"}}},"commit":"a1b2c3d","meta":{}}
```

Types: `task.create`, `task.update`, `task.delete`, `task.complete`, `knowledge.write`, `chat.create`, `chat.message`, `chat.update`, `chat.delete`, `annotation.write`, `file.add`, `file.write`, `settings.update`, `code.change`, `undo`, `redo`.

`before` / `after` map each target path to a **snapshot**:

```ts
type Snapshot =
  | { fields: Record<string, unknown> }   // small frontmatter edits; undo re-applies fields
  | { content: string }                   // whole text file ≤ 64 KB; undo writes content
  | { git: true }                         // reconstruct from `commit` (code.change, binaries, large files)
  | null;                                 // file did not / does not exist
```

`meta` holds type-specific extras: the prompt text for extraction batches, key names for `settings.update`, the plan text for `code.change`.

---

## 5. Store (`lib/store/`)

Function surface. Every function is async, takes and returns plain objects, and throws typed errors (`StoreError` with `code: "not_found" | "exists" | "invalid" | "forbidden_path" | "secret_rejected" | "conflict"`).

```ts
// paths.ts
resolveData(rel: string): string           // throws forbidden_path on `..` escape or absolute input; lexical only
resolveForRead(rel: string): Promise<string>   // follows a link only inside data/, to a name the browser would open (Decision 94)
resolveForWrite(rel: string): Promise<string>  // refuses a path that goes through any link (Decision 94)
realWithin(root, abs, rel): Promise<string>    // the link rule itself, also used by the browser's "Whole repo" read
// frontmatter.ts
splitFrontmatter(text: string): { data: Record<string, unknown>; body: string }
joinFrontmatter(data: Record<string, unknown>, body: string): string
// tasks.ts
listTasks(): Promise<Task[]>               // cached by (path → mtime); re-parses only changed files
readTask(id: string): Promise<Task>
writeTask(task: Task): Promise<{ path: string }>       // creates or replaces; sets updatedAt
deleteTask(id: string): Promise<void>
newTaskId(): Promise<string>; slugFor(title: string, existing: Set<string>): string
// settings.ts
readSettings(): Promise<Settings>; writeSettings(s: Settings): Promise<void>
listThemes(): Promise<Theme[]>; writeTheme(t: Theme): Promise<void>; deleteTheme(name: string): Promise<void>
// files.ts
listTree(rel: string): Promise<TreeNode[]>             // data/ only; "Whole repo" is git's tracked files (Decision 88)
treeSignature(skip: string[]): Promise<string>         // a stat fingerprint of data/, for caches that must see outside writes (Decision 90)
readText(rel: string): Promise<string>; readBinary(rel: string): Promise<Buffer>
writeText(rel: string, text: string): Promise<void>; deleteFile(rel: string): Promise<void>
moveFile(from: string, to: string): Promise<void>; mkdir(rel: string): Promise<void>
exists(rel: string): Promise<boolean>; byteLength(rel: string): Promise<number>
appendText(rel: string, text: string): Promise<void>                    // the action log only
readTail(rel: string, offset: number): Promise<string>; replaceTail(rel: string, offset: number, text: string): Promise<void>
// browse.ts — the file browser (Decision 88)
dataTree(): Promise<TreeNode[]>; repoTree(tracked: string[]): TreeNode[]
readForBrowser(rel: string, where: "data" | "repo", tracked?: ReadonlySet<string>): Promise<Buffer>
// manifest.ts
addFile(kind: "images"|"docs"|"other", name: string, bytes: Buffer, source: string): Promise<{ rel: string }>
regenerateManifest(): Promise<void>
// chats.ts
listConversations(): Promise<ConversationMeta[]>
readConversation(id: string): Promise<{ conversation: Conversation; messages: Message[]; annotations: Annotation[] }>
writeConversation(c: Conversation): Promise<void>; deleteConversation(id: string): Promise<void>
writeMessage(convId: string, m: Message): Promise<void>     // whole-file write, atomic (tmp + rename)
deleteMessage(convId: string, id: string): Promise<void>
writeAnnotation(convId: string, a: Annotation): Promise<void>
// knowledge.ts
readNote / writeNote / listNotes; readMap / writeMap / listMaps; readCollection / writeCollection / listCollections
regenerateIndex(): Promise<void>
// env.ts
readKeys(): Promise<Record<string, string>>; writeKey(name: string, value: string | null): Promise<void>
maskKey(v: string): string   // "••••" + last 4
// events.ts
onWrite(cb: (paths: string[]) => void): () => void
```

Rules:

- **Atomic writes:** write to `<path>.tmp` then `rename`. A crash never leaves a half-written file.
- **LF only:** every text write replaces `\r\n` with `\n` first (Decision 42). A file hand-edited in a CRLF editor becomes LF on its next save through the app; no CR byte is ever written.
- **No component or route calls `writeTask` etc. directly.** They call `runBatch()` (§7), which calls the store. The store functions are exported so the history layer and scripts can use them; that is the whole audience.
- `listTasks` ignores files whose frontmatter fails to parse, and returns their paths in a side channel (`listTasks.errors`) that the Today tab shows as a one-line warning.
- Every store write emits `events.onWrite` with the relative paths written. `lib/knowledge/index.ts` subscribes to invalidate its cache, and also compares `treeSignature` on every read, because an undo's `git checkout` and an edit in another program emit nothing (Decision 90).

---

## 6. Knowledge base

### 6.1 Structure

`profile/` (always loaded; `about-me.md`, `habits.md`, `preferences.md`; cap 150 lines each), `notes/` (§4.2), `maps/` (§4.3), `index.md` (§4.4), `collections/` (§4.5), `sessions/` (§4.6).

### 6.2 Retrieval contract

Implemented in `lib/agent/context.ts` and `lib/agent/tools.ts`:

1. **Always in the system prompt:** a settings preamble (name, timezone, current local time, day shape), `knowledge/index.md`, and all three profile files. Target under 2,000 tokens; `assembleContext` reports the estimate (chars / 4) and the debug view shows it in red past 2,500.
2. **Selective loading is model-driven.** Tools `read_knowledge({ path })` and `search_knowledge({ query })` are offered on every turn. The system prompt says: read a map before reading its notes; read only what the question needs; do not read `sessions/` unless the user refers to a past conversation.
3. **When relevant, also in the prompt:** the current view's tasks (Today or Calendar range) as a compact table, the open document's full text (document view) up to 32,000 characters, past which it is cut with a marker saying so (Decision 85), the referenced task (Ask about this).
4. **A missing note may be proposed** via `propose_knowledge_write` so the same thing is not re-derived next time.

### 6.3 Write rules

- A new note must carry at least one map in `links`, and the proposal must include the map edit (`append` of a link line). `runBatch` rejects a `knowledge.write` batch that creates a note without a map link.
- Before proposing a new note, the model must `search_knowledge` for the topic; the prompt says so, and `memory.ts` drops a proposal whose title fuzzy-matches an existing note above 0.8 and converts it to an `append` on that note.
- Proposals appear in the preview panel (§9.5). **Auto-apply** is allowed only for `append` to `profile/habits.md` or `profile/preferences.md` of at most three lines; those are applied immediately, logged as `knowledge.write` with `actor: agent`, and announced by a toast; the Undo is on the marker under the reply, because a toast carries no buttons (Decision 84).
- A profile file over 150 lines makes the next assistant turn include a distillation proposal: rewrite the file shorter and move detail into notes.

### 6.4 What is worth remembering

The heuristic, verbatim in the prompt (`memory.ts`):

> Remember: stable facts about the user (school, courses, people, tools, constraints); recurring patterns you observe across turns; preferences the user states explicitly. Do not remember: one-off task content, anything already in a task file, transient state ("I'm tired today"), or anything the user asked you to forget. When unsure, do not propose.

### 6.5 `npm run kb:check`

Reports: notes linked from no map (orphans); links to paths that do not exist; notes over 200 words; profile files over 150 lines; collections with `tasks` ids that do not exist. Uses the same `LinkIndex` as backlinks and the graph.

**Three tiers, three exit codes**, because a CI run has to tell a violation from a check that could not be made, and the second is the one that needs a person:

- **Violations** — any of the five above. Exit 1.
- **Could not evaluate** — a rule's input did not read cleanly, so its conclusion would be a guess (Conventions: a lenient reader is not an authority). A map whose frontmatter does not parse suspends the orphan rule, since the broken map may be the one linking the note; a non-empty `listTasks.errors` suspends the missing-task rule, since the unreadable file may be the task. Any file under `knowledge/` that does not parse is named here too. Exit 2, and it outranks exit 1: a run that could not look at everything cannot say "only these".
- **Notices** — reported, never counted. The first is uploads under `data/files/` that nothing in the link index points at — an upload with no backlinks (Decision 65): removing an attachment chip leaves one behind in ordinary use, and nothing collects them. Notices never change the exit code.

Links inside chat messages are not checked: a message is immutable, so a broken link there is a report nobody can act on.

---

## 7. Action history and undo (`lib/history/`)

### 7.1 `runBatch`

The single entry point for every mutation:

```ts
interface BatchSpec {
  actor: "user" | "agent";
  scope: "user" | "project";
  summary: string;                         // becomes the commit message body
  commitPrefix: "task" | "knowledge" | "chat" | "settings" | "file" | "code" | "docs"
              | "undo" | "redo";        // §7.2 reversals; Decision 48
  actions: ActionSpec[];                   // one or more; all undo together
  commit?: boolean;                        // default true; false only for streaming writes (§8)
  meta?: Record<string, unknown>;
}
interface ActionSpec {
  type: ActionType;
  summary: string;
  apply: (store: Store) => Promise<{ targets: string[]; before: Snapshots; after: Snapshots }>;
}
runBatch(spec: BatchSpec): Promise<{ batch: string; commit: string | null; seq: number[] }>
```

Sequence, inside the serial queue (`queue.ts`):

1. Reserve `batch` id `b_<YYYYMMDD>_<HHmmss>_<4hex>`.
2. For each action: compute `before` snapshots (read current files), call `apply`, compute `after`.
3. **Scan everything this batch would write into the log** — the batch and action summaries, `meta`, the target paths, and both sides of every snapshot — against `SECRET_PATTERNS` (§11.5). On a hit: roll back every action already applied, log nothing, commit nothing, and throw `StoreError("secret_rejected")`, whose message names the file and the pattern and never the match. The route answers 422 (Decision 50).
4. Backfill the *previous* batch's `commit` field (Decision 47): take the newest run of `commit: null` lines, grouped by batch id, and stamp only the last group, and only when `git log -1` shows HEAD's subject equal to that batch's recorded `<prefix>: <summary>`. On a mismatch, leave the null alone. The log is append-only for *entries*; filling in the `commit` field of already-written lines is the one in-place edit, done by rewriting the file's tail.
5. Append this batch's log lines with `commit: null`, carrying `meta.commitSubject` — or `meta.noCommit` when `commit` is false — then regenerate `action-history.md`.
6. If `commit`: `git add -A -- data` (plus repo paths for `code.change`), then `git commit -m "<prefix>: <summary>" -- <those paths>` so unrelated edits sitting in the index never ride along. The hash is read back and returned to the caller but **not** written to the log; that is the next batch's job, and it is what leaves the tree clean. If the commit fails, mark this batch `meta.commitFailed` with `meta.commitError`.
7. Schedule a debounced push.

Steps 3 and 4 both write under `data/`, and both happen before step 5 sweeps them into the commit. Nothing writes under `data/` after that, so `git status --porcelain -- data` is empty once a successful batch returns.

If `apply` throws, files written by earlier actions in the batch are restored from their `before` snapshots — a `{git: true}` one from the bytes `snapshotContent` held when it took it (Decision 89) — nothing is logged, and the error propagates. If git fails, the batch is logged with `commit: null` and `meta.commitFailed`, the sync indicator shows `error`, and the entry remains undoable because `before` snapshots are inline (the `{git: true}` snapshot is used only for code changes, binaries and text files over 64 KB, which cannot be undone without a commit; the UI says so).

### 7.2 Undo and redo

```ts
undoBatch(batch: string, opts: { force?: boolean }): Promise<UndoResult>
redoBatch(batch: string): Promise<UndoResult>
```

- Undo applies each action's inverse **newest first**: `{fields}` → re-apply `before.fields`; `{content}` → write `before.content`; `null` → delete the file; `{git: true}` → the target checked out from the commit's parent, uncommitted: `git checkout <commit>^ -- data/<rel>`, or the repository path itself for a `code.change`. Redo checks out `<commit>` (Decision 89). Until Phase 8 this line said `git revert --no-commit`, which the code never ran.
- Undo appends an `undo` entry whose `meta.undoes = batch`, then commits `undo: <original summary>`. Redo applies `after` snapshots and appends `redo`.
- **A `{fields}` or `{content}` snapshot is restorable only for a target under `data/`.** `undoBatch` refuses a batch carrying either kind on a path outside it, saying why rather than reading as a path error: the §11.5 key batch records the key's *name* and never its value, so there is nothing to restore, and applying its snapshot through the store would resolve `.env.local` under `data/` and write a file that is not the one anyone meant. `{git: true}` is unaffected — it restores from the commit, which names a repository path as itself, and is how `code.change` reaches repository paths legitimately (Decision 58).
- **Conflict check:** if any later batch touched the same targets, `undoBatch` returns `{ conflict: [batchIds] }` without acting unless `force`. The UI shows the warning and a "Undo anyway" button.
- A batch is undoable if it has no later `undo` pointing at it, or if the latest such `undo` was itself redone. Redo is available only for a batch whose latest `undo` has no later `redo`. New actions do not clear anything; the UI simply reports "redo unavailable" when the check fails.
- History is never truncated or rewritten.

### 7.3 Mirror

`data/history/action-history.md` is regenerated on every log write: reverse-chronological, grouped by day (`## 2026-09-03`), one line per batch: `- 14:12 · task · Moved 'Pset 4' due to Sep 12 · a1b2c3d`. Undo entries render as `- 14:15 · undo · ↶ Moved 'Pset 4' …`.

### 7.4 CLI

`npm run history -- list [--n 20]`, `npm run history -- undo <batch>`, `npm run history -- redo <batch>`. Phase 2 proves undo here before any UI exists.

### 7.5 History UI

`components/history/HistorySheet.tsx`, opened from Settings → History and by `Ctrl/Cmd+Z` when focus is not in an editable element. Lists batches newest first with filters for scope and type (`chat.update` hidden by default), an Undo/Redo button per batch, and the conflict warning inline. Selecting a batch shows its actions and targets.

---

## 8. Git sync (`lib/history/git.ts`)

- One commit per batch, immediately, message `<prefix>: <summary>` (e.g. `task: add 6 tasks from prompt`, `settings: change theme to dark`, `code: add week view to calendar`). The vocabulary is `task`, `knowledge`, `chat`, `settings`, `file`, `code`, `docs`. The first five describe a change to data under `data/` and are what the mirror renders as `· task ·`; `code` and `docs` describe a change to the project itself — source and written spec respectively — and are also the prefixes for the by-hand commits of a build phase, which do not go through `runBatch` at all. Commits use the repo's configured git identity. No trailers of any kind.
- **Never commit a streaming message.** `writeMessage` during streaming runs through `runBatch` with `commit: false` and a `chat.message` action whose log entry is written once, at finalize. Concretely: the streaming write path calls the store directly from `lib/agent/chat.ts` through a `history.streamingWrite(path, content)` helper that bypasses logging, and finalize calls `runBatch` with the complete message. This is the one sanctioned bypass, and it exists only for `data/chats/*/messages/*.md` with `status: streaming`.
- **Push is debounced** `settings.sync.pushDebounceMs` (default 30 s) after the last commit. `flush()` pushes immediately if there are unpushed commits. It is called from `POST /api/sync/flush` (triggered by `navigator.sendBeacon` on `beforeunload`), from **Sync now**, and on shutdown by `scripts/dev.mjs` as described next. The Next server process does nothing on shutdown; a debounce timer that dies with the process is caught by the wrapper.
- **Shutdown (Decision 43).** `scripts/dev.mjs` spawns `next dev` with `stdio: "inherit"` and registers one idempotent handler for `SIGINT`, `SIGBREAK`, `SIGHUP`, and the child's `exit` event. The handler: (1) kills the child tree, `taskkill /pid <pid> /T /F` on Windows and `child.kill("SIGTERM")` elsewhere, ignoring errors because the console usually delivered `Ctrl+C` to the child already; (2) if `git remote get-url origin` succeeds and `git rev-list --count @{u}..HEAD` is non-zero, runs `git push` with `execFileSync` (synchronous, 20 s timeout, stdio inherited so a failure is visible in the terminal); (3) exits with the child's code. Nothing asynchronous runs after a signal. On Windows, Node raises `SIGINT` for `Ctrl+C` and `SIGBREAK` for `Ctrl+Break`; closing the console window raises `SIGHUP` and force-terminates roughly ten seconds later, which the synchronous push fits inside. Verified on Windows in Phase 1.
- **Startup (the other half of Decision 43).** Before spawning the dev server, `scripts/dev.mjs` calls `clearStaleIndexLock()` in `lib/history/git.ts`. `taskkill /T /F` cannot be delivered gracefully, so a `Ctrl+C` that lands during a batch's commit leaves `.git/index.lock` behind, and git's next message — "Another git process seems to be running" — reads like repository corruption. The guard removes the lock **only** when no `git` process is running (`tasklist` on Windows, `pgrep -x git` elsewhere) and logs once when it does; if that question cannot be answered it leaves the lock alone, because deleting one a live git holds corrupts the index. It runs at startup only, never on the write path: a lock appearing mid-session belongs to something real.
- **`ATTUNE_REPO_DIR` announces itself.** When the variable is set, `lib/store/paths.ts` logs the resolved `REPO_DIR` once on module load. It is the one setting that can silently point every read and write at a checkout the owner did not mean, and a stray `export` in a shell profile is otherwise invisible (Decision 45).
- **Status:** `GET /api/sync/status` → `{ state: "synced" | "pending" | "offline" | "error" | "conflict" | "local", ahead: number, lastError?: string }`. `ahead` is `git rev-list --count @{u}..HEAD`. The shell shows a dot with a tooltip and a **Sync now** button.
- **Failures never block.** Offline (`Could not resolve host`) → `offline`, retry on next commit. Auth or unknown → `error` with the message. Non-fast-forward → `conflict`: pushing stops, and the indicator shows: "Remote has changes. Run: `git pull --rebase && git push` in `<repo dir>`." No automatic resolution.
- If `git remote get-url origin` fails, sync state is `local` and push is skipped silently. A fresh clone with no remote still works.

---

## 9. The composer

### 9.1 Button and sheet

`components/composer/ComposerButton.tsx`: fixed, bottom-right (`right: 24px; bottom: 24px`), 56 px circle, z-tier 30. Rendered by the Today and Calendar pages only; the Chat page never mounts it. While the sheet is open the same button rotates 45° and closes it.

`ComposerSheet.tsx`: slides up from the bottom edge (transform transition 180 ms), rests along the bottom, max height 70vh, z-tier 30. Closes on `Esc`, on button click, and on outside click **only if the textarea is empty** (HANDOFF §G). A sheet with typed text stays open and its draft persists in `localStorage` under `composer.draft`.

### 9.2 Input

Auto-growing textarea (1–10 rows). `Enter` sends, `Shift+Enter` newlines, `Esc` closes. Paste of text inserts; paste of files or images attaches. Drag-and-drop anywhere on the window while the sheet is open attaches (a full-window drop overlay appears on `dragenter`). An attach button opens a file picker. **Voice input:** if `window.SpeechRecognition ?? window.webkitSpeechRecognition` exists, a mic button toggles dictation into the textarea; otherwise the button is absent.

Attachments are uploaded immediately to `POST /api/files/upload` → `data/files/<kind>/<YYYY-MM>/…`, registered in the manifest as one `file.add` batch, and shown as chips. Removing a chip does not delete the file.

### 9.3 Modes

Segmented control: **Tasks** (default) · **Ask** · **Build**. The last-used mode is remembered per tab in `localStorage`. Build mode shows the approval toggle beside the mode control:

- **Plan first** (default): amber label.
- **Auto**: red label. Switching to Auto shows a one-time confirmation dialog ("Auto applies code changes without review. Git is the safety net. Every change is a commit you can revert.") with "Don't show again".

The toggle is sticky per mode (stored in `localStorage` as `composer.buildApproval`).

### 9.4 Routing within Tasks mode

`POST /api/agent/extract` returns one of:

```ts
type ExtractResult =
  | { kind: "tasks"; items: TaskDraft[]; note?: string }
  | { kind: "collection"; collection: string /* rel path or "new:<title>" */; items: string[]; note?: string }
  | { kind: "question"; text: string };
```

The prompt instructs: default to tasks; if the content is plainly list or reference material, propose a collection write and name it; if a phrase is genuinely ambiguous (e.g. "read Dune"), return a question rather than guessing. `TaskDraft` is the task frontmatter minus `id`, timestamps, and `createdBy`, plus `body: string` and `inferred: string[]` naming the fields the model filled in from context rather than the prompt.

### 9.5 Preview-and-approve loop

`components/composer/PreviewPanel.tsx` renders inside the sheet above the textarea:

1. Send → spinner in place of the send button; the textarea is disabled but keeps its text until the response arrives.
2. `question` → shown as a message; the textarea becomes the answer box. The next send includes the prior prompt and the answer.
3. `tasks` → one `TaskCard` per item with every field editable inline (title text, priority select, estimate number, due and scheduled date inputs, category select from settings, context text, tags chips, body textarea). Inferred fields carry a dotted underline and a tooltip "Inferred from: <source>".
4. A follow-up typed into the textarea sends `{ prompt, followUp, draft: items }` to the same endpoint; the model returns a revised `items` array and the panel **replaces** its cards in place, preserving any inline edits the model did not touch (matched by index).
5. **Add all** / **Add selected** (checkbox per card) → `POST /api/tasks` → one `task.create` batch, summary `add N tasks from prompt`, `meta.prompt`. **Discard** → confirm dialog → the preview is dropped. Discards are not written to the action log: nothing reached disk, so there is nothing to undo, and a log type that exists for one button is clutter. This is a deliberate deviation from the brief; if discards should be audited, say so and they become a `note` entry carrying the prompt in `meta`.
6. `collection` → the panel shows the target collection name and the items as a checklist; **Add** appends to the collection (`knowledge.write`) or creates it (`knowledge.write` for the file). No map link is written: `index.md` lists every collection (§4.4) and the Knowledge panel has its own Collections node (§10.2), and §6.3's map rule is about notes.

Ask mode and Build mode reuse the same panel for proposals they produce.

### 9.6 Ask mode from the sheet

Creates (or continues, if the sheet was opened via "Ask about this" on the same task within the session) a conversation with `context.taskIds` set, streams the reply into the sheet, and offers "Open in Chat". Proposals collected during the turn appear in the preview panel.

### 9.7 Build mode from the sheet

Identical to Build mode in the Chat tab (§13.4); the sheet shows the plan, the diff, and the gates.

---

## 10. The three tabs

### 10.0 Shell

`app/layout.tsx`: top bar with the three tabs (`/`, `/chat`, `/calendar`), a search field, the sync indicator, and a settings gear (`/settings`). Global keyboard: `Ctrl/Cmd+K` focuses search, `Ctrl/Cmd+Z` opens history (outside inputs), `1`/`2`/`3` switch tabs when focus is on the body.

**Search:** `GET /api/search?q=` scans task titles and bodies, note titles and bodies, collection titles and items, conversation titles. Scoring: exact title substring 100, title subsequence match 60 (chars of the query appear in order), body substring 30, body subsequence 10; ties by `updatedAt` desc; top 20. Results open in the document view (`/chat?open=<rel path>`) or the conversation. No index; the scan reads files through the store's mtime cache.

**Toasts:** one component, `components/shell/Toast.tsx`, at most one toast per `id` per page load (HANDOFF §G), auto-dismiss by CSS animation with removal on `animationend`. Every toast names what broke and what still works. **A toast is text only — no buttons, not even a close — and transparent to the pointer** (Decision 84): whatever a person can do about what it says lives on the surface that owns it.

### 10.1 Today

`app/page.tsx` with `?date=YYYY-MM-DD` (default today in the settings timezone).

**Header:** `←` at top-left, `→` at top-right, date and weekday centered, a "Today" button when not on today, and weather (temperature + condition icon) when `settings.weather.lat` and `lon` are set and the date is within the forecast window (today + 6 days). With no location the weather element is not rendered at all; the header layout is a three-column grid so nothing shifts. A "Schedule" toggle switches between the list and the timeline.

**Body:**

1. **Overdue** — `status ∈ {todo, doing}` and `due < viewDate`, sorted by `due` asc. Red left border. Absent when empty.
2. **Today's focus** — the top `settings.list.focusSize` of the eligible ranked list.
3. **Also possible** — the remaining eligible tasks, grayed, collapsed by default with a count.
4. **Done today** — tasks with `completedAt` on `viewDate`, shown struck through when `settings.list.showCompleted`.

**Row:** checkbox (left) · title · context subheader · metadata chips (due as relative text, estimate, priority glyph, subtask progress) · `⋯` menu: Edit (inline form), Duplicate, Reschedule (date picker), Delete (confirm), **Ask about this** (opens the composer in Ask mode with `context.taskIds=[id]`). Clicking the title opens the task in the document view.

**Ranking** (`lib/schedule/rank.ts`), deterministic, no model:

```ts
rankDay(tasks: Task[], viewDate: string, settings: Settings, now: Date): {
  overdue: Task[]; focus: Task[]; alsoPossible: Task[]; doneToday: Task[];
}
```

Eligible: `status ∈ {todo, doing}`, not overdue, and (`scheduled` empty or `scheduled ≤ viewDate`). A task whose `scheduled` is in the future is not shown on earlier days.

```
daysUntil     = calendar days from viewDate to due (null if no due)
urgency       = due == null ? 0 : daysUntil <= 0 ? 10 : max(0, 10 - daysUntil)
priorityW     = {1: 11, 2: 6, 3: 2, 4: 0}[priority]
scheduledB    = scheduled != null && scheduled ≤ viewDate ? 6 : 0
doingB        = status == "doing" ? 3 : 0
fitB          = (estimateMin ?? 30) <= availableMinutes ? 1 : 0
score         = urgency + priorityW + scheduledB + doingB + fitB
```

`availableMinutes` for today is `day.endMin − max(nowMin, day.startMin)`, clamped at 0; for other days it is the sum of `day.blocks`. Tasks whose `due` is beyond `lookaheadDays` and have no `scheduled` on `viewDate` are excluded from focus regardless of score and go to Also possible. **Tie-break**, in order: `due` asc (nulls last), `priority` asc, `createdAt` asc, `id` asc. Focus = first `focusSize`; Also possible = the rest.

*Worked example*, viewDate 2026-09-08 (Tuesday), `focusSize` 3, `lookaheadDays` 14, 240 minutes available:

| Task | due | priority | scheduled | est | urgency | prio | sched | fit | score | section |
|---|---|---|---|---|---|---|---|---|---|---|
| Pset 4 | 09-10 | 2 | 09-08 | 90 | 8 | 6 | 6 | 1 | **21** | focus 1 |
| Email advisor | — | 1 | — | 10 | 0 | 11 | 0 | 1 | **12** | focus 2 |
| Buy notebook | 09-09 | 4 | — | 20 | 9 | 0 | 0 | 1 | **10** | focus 3 |
| Read ch. 5 | 09-15 | 3 | — | 60 | 3 | 2 | 0 | 1 | 6 | also possible |
| Plan spring courses | 10-30 | 3 | — | 60 | 0 | 2 | 0 | 1 | 3 | also possible (beyond lookahead) |
| Lab report | 09-05 | 2 | — | 120 | — | — | — | — | — | overdue |

The weights are chosen so that a critical task with no deadline (11) outranks a someday task due tomorrow (9), and a high-priority task due tomorrow (9 + 6) outranks both (Decision 34).

**Schedule mode** (`lib/schedule/timeline.ts`):

```ts
packDay(input: { focus: Task[]; fixed: Task[]; now: Date; viewDate: string; settings: Settings }): Block[]
type Block = { kind: "task" | "break" | "gap" | "fixed"; taskId?: string; startMin: number; endMin: number }
```

Timeline from `max(nowMin, day.startMin)` (or `day.startMin` for other days) to `day.endMin`. Fixed blocks = tasks whose `scheduled` carries a time on `viewDate`, placed first. Focus tasks are placed in rank order into the first gap that fits `estimateMin ?? 30`, followed by a `breakMin` break. Unplaced tasks are listed under the timeline as "Didn't fit".

**Dragging a block's body** changes the task's `scheduled` to a date-time and is logged as `task.update`. **Dragging its edges changes duration, not placement**, which is a different field: the bottom edge moves the end, so it writes `estimateMin`; the top edge moves the start while the end stays put, so it writes `estimateMin` *and* `scheduled` together. Edge resize is not built in v1 — body drag already covers rearranging a day, `estimateMin` is editable in the row's form, and resizing forces a decision about whether the rest of the day repacks around the new length that v1 does not need to make (AGENTS.md amendment `k`). **Refine with AI** sends the packed day and the tasks to `POST /api/agent/schedule` and shows the proposed order with the model's reasoning; accepting writes `scheduled` times as one batch.

**Weather** (`lib/weather.ts`): geocode `https://geocoding-api.open-meteo.com/v1/search?name=<q>&count=1` on save in Settings; forecast `https://api.open-meteo.com/v1/forecast?latitude&longitude&daily=weather_code,temperature_2m_max,temperature_2m_min&current=temperature_2m,weather_code&timezone=<tz>&temperature_unit=<unit>`. Cached in module memory for 30 minutes keyed by `lat,lon,unit`. WMO weather codes map to eight icons. A fetch failure hides the element and logs once.

### 10.2 Chat and knowledge browser

`app/chat/page.tsx`. Layout: a 44 px icon rail on the far left, a resizable panel (240–420 px, collapsible, width in `localStorage`), and the main pane.

**Rail panels:**

1. **Chats** — `listConversations()` grouped Pinned / Today / Yesterday / This week / Older, search box filtering by title, context menu: Rename, Pin, Delete (confirm), Distill to knowledge (§6, creates a session summary proposal).
2. **Knowledge** — a curated tree built from the maps: top level is each map by `title` plus **Collections**; expanding a map lists the notes it links to, in the map's order. Built by `GET /api/knowledge/tree`, which parses map bodies through the link index.
3. **Files** — the raw tree under `data/` with a "Whole repo" toggle, which shows git's tracked files outside `data/`; a credential-shaped name is never listed or opened (Decision 88). Context menu: New file, New folder, Rename, Delete, Reveal in graph. **Each entry the write policy forbids for that row is shown disabled with the policy's own reason** rather than offered and refused afterwards (Decision 105). Outside `data/` the tree is read-only unless the composer is in Build mode; the context menu says so.
4. **Graph** — opens the graph view in the main pane. Built in Phase 8b, and it has no rail icon until then (Decision 96).

Panels 2 and 3 are the same component, `components/browser/Tree.tsx`, fed different `TreeNode[]` arrays; the Knowledge panel simply passes a curated tree. Expanded-set, active panel, and scroll positions persist in `localStorage`. The rail shows one panel at a time: choosing another shows it, and choosing the one already shown folds the panel away, which is what the single Chats icon did in Phase 6b.

**Main pane** shows a conversation or a document, never both, never tabs. Opening anything from the rail swaps in the document view with a strip at the top: the path, an Edit/Preview toggle, Save, and a "← Back to chat" control. The chat composer stays docked at the bottom in document view; sends in document view set `conversation.context.file` to the open path and the document's full text is in context (§6.2). If no conversation is active, a new one is created with that context.

**Document view** (`components/browser/DocumentView.tsx`). Phase 8 B1 builds the read-only half — the strip, the frontmatter table, the rendered body with its links, images and checkboxes, and "Linked from"; the Edit/Preview toggle, Save and the docked composer are B2's. It is handed a path and reads the file itself, ordered (Decision 97):

- Preview renders markdown through Decision 31's pipeline, as `Markdown.tsx` does, but with the document's own link and image rules (`DocumentBody.tsx`, `href.ts`). Edit is a monospace textarea. `Ctrl/Cmd+S` saves. **The toggle shows the draft, and warns about nothing**: Preview renders what has been typed rather than what is on disk, so the two buttons are two views of one draft and switching between them can lose nothing. Navigation warns when dirty, because leaving is the only way work is actually lost (`beforeunload` and an in-app confirm). While a draft is unsaved, every control that would write the file through another route — a checkbox, a task's Complete and `⋯` menu, "Make this a task" — is inert and says why: each writes immediately, so it would land on bytes the draft no longer matches.
- Frontmatter renders as `FrontmatterTable.tsx`: one row per key, value editable as text (arrays as comma-separated, booleans as checkboxes). Body and table save together as one `file.write` (or `task.update` / `knowledge.write` by path).
- Checkboxes in preview are clickable and save immediately (one action per click); a click on a line that has changed since it was drawn is refused and writes nothing (Decision 86). A box the page cannot tie to its line is disabled and says why, as is every box in a file the policy will not let this view save (Decision 98).
- Links to `data/` paths navigate in place. **Backlinks** ("Linked from") from the link index at the bottom.
- Raster images (PNG, JPEG, GIF, WebP) inline from `GET /api/files/raw?path=`; anything else, PDF and SVG included, a download link from the same route. PDF goes in an `<iframe>` only once its viewer has been shown safe without the sandbox, and an SVG renders only once `<img>` has been shown to hold one; Decision 93 says what would show each.
- **Math:** `$…$` inline and `$$…$$` display through KaTeX; the raw text is never touched by the renderer, so edit-and-save round-trips byte-for-byte.
- A task file's document view adds a Complete button and the `⋯` menu from Today.

**Graph view** (`components/browser/GraphView.tsx`):

- Nodes: every file under `data/` except `history/`, `settings/`, and message/annotation files; conversations are one node each. Colored by type token (`--node-task` …), radius `4 + 2·√degree`.
- Edges from `LinkIndex`: markdown links in bodies, `links:` arrays, task `links`, note-to-map membership, message `refs` aggregated to the conversation, collection `tasks`.
- `d3-force` simulation (`forceLink`, `forceManyBody`, `forceCenter`), drawn on a `<canvas>` with device-pixel-ratio scaling. Click opens the node; hover highlights neighbors; a type filter row; a search box dims non-matches.
- Over 400 nodes: render only the 2-hop neighborhood of the focused node (default: the most connected), with a "Show all" override.
- Empty `data/` renders "Nothing here yet" and no simulation.

**Conversation behavior** is in §16. **Per-message actions:** copy, edit-and-resend, regenerate, branch from here, annotate, delete, read aloud (`speechSynthesis`, per-message play/stop). The model that produced each assistant message is shown under it. A model selector in the conversation header sets `conversation.model` from the registry.

**Context debug view:** a "Context" toggle in the conversation header shows the exact blocks `assembleContext` sent for the last turn, with per-block token estimates and total.

**Attachments:** the docked chat composer takes attach, paste and drop, through the same `components/composer/Attachments.tsx` the sheet uses and the same `POST /api/files/upload` (§9.2). The message stores `data/`-relative paths (§4.7) and §13.2 turns them into image or document blocks for models whose registry entry allows them; a model that does not refuses the send with a reason naming the model, rather than dropping the file silently.

### 10.3 Calendar

`app/calendar/page.tsx`. Views: **Rolling** (default: today plus the next 27 days as 4 rows of 7, scrolling by a week with ↑/↓), **Month**, **Week**. Arrows move by the current unit; a Today button returns.

- Each cell lists tasks by `due` (or `scheduled` if set and no due), and, on today and past days, also whatever was completed that day by `completedAt`. A past day therefore shows both what was finished and what was due and missed — an open overdue task keeps its place on the day it was due, with the same overdue treatment Today gives it (Decision 54). Past days are darkened; today is outlined. A cell scrolls internally past five items with a "+N more" line that expands it.
- Clicking an item selects it and shows the Today `⋯` menu actions in a small toolbar below the grid. Edit opens the same `TaskEditForm` there rather than inside the cell, which has no room for it.
- Native HTML5 drag: dropping an item on another day sets `scheduled` (or `due` when `Shift` is held, and the drop hint says so). One `task.update` batch per drop.
- `GET /api/calendar?from&to` returns `{ days: Record<date, { due: Task[]; completed: Task[] }> }`.

---

## 11. Settings

`app/settings/page.tsx` edits `settings.json` through `PUT /api/settings`, each section saving on blur as one `settings.update` batch with a summary naming the section.

### 11.1 Sections

Identity · Timezone (select from `Intl.supportedValuesOf("timeZone")`) · Weather (query text, Resolve button, geolocation button that asks browser permission on first use, units, Clear; attribution line "Weather data by Open-Meteo, CC-BY 4.0") · Theme (§11.3) · Day shape (start, end allowing past midnight, blocks editor, break length) · List behavior (focus size, lookahead, show completed) · Categories (editable chips) · First day of week · Models (§11.4) · API keys (§11.5) · History (opens the sheet) · Sync (push toggle, debounce, Sync now, remote URL read-only).

### 11.2 First run

If `settings.identity.name` is empty, the Today header shows a one-time card: name field, timezone confirm, weather location with "Use my location" (browser geolocation, which sets `lat`/`lon` and the label `"My location"`; there is no reverse lookup to name the place — Decision 51) or a text search, or "No weather". Dismissable; never shown again once name is set.

### 11.3 Themes and tokens

`app/theme.css` defines `:root` (light) and `[data-theme="dark"]`. The token list, all required in a theme file's base and all overridable:

```
--bg --bg-elevated --bg-sunken --fg --fg-muted --fg-faint
--border --border-strong --accent --accent-fg --accent-soft
--danger --danger-soft --warning --success --overdue --focus-ring --selection
--shadow --radius-sm --radius-md --radius-lg
--font-sans --font-mono --font-size --line-height
--priority-1 --priority-2 --priority-3 --priority-4
--node-task --node-note --node-map --node-collection --node-chat --node-file
```

Custom themes are applied by `app/layout.tsx` injecting a `<style>` with `[data-theme="<name>"] { … }` from the theme file. Theme picker: base themes marked protected; **Duplicate to new theme** writes `data/settings/themes/<name>.json` (`settings.update`); custom themes have a token editor (color inputs) and Delete. **Create by prompting:** a text field ("warm sepia, low contrast") calls `POST /api/agent/theme`, which returns a token map through the provider's `parse` — `output_config.format` over `messages.stream`, per Decision 27 — and opens it in the editor unsaved.

### 11.4 Models

`lib/agent/registry.ts`:

```ts
interface ModelEntry { id: string; label: string; provider: "anthropic"; images: boolean; pdf: boolean; effort: boolean }
export const MODELS: ModelEntry[] = [
  { id: "claude-opus-5", label: "Claude Opus 5", provider: "anthropic", images: true, pdf: true, effort: true },
  { id: "claude-sonnet-5", label: "Claude Sonnet 5", provider: "anthropic", images: true, pdf: true, effort: true },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5", provider: "anthropic", images: true, pdf: true, effort: false },
];
interface Provider { streamChat(req: ChatRequest, signal: AbortSignal): AsyncIterable<ChatEvent>; parse<T>(req: ParseRequest<T>): Promise<T> }
export const PROVIDERS: Record<ModelEntry["provider"], Provider>
```

Adding a provider = one file implementing `Provider`, one entry in `PROVIDERS`, entries in `MODELS`, and a key name in `env.ts`'s known list. Settings shows default model + effort, and per-mode overrides for extract and build. Effort values: `low | medium | high | xhigh | max`; sent as `output_config.effort` only when `entry.effort` is true.

### 11.5 API keys

- Stored only in `.env.local` as `ANTHROPIC_API_KEY=…`. `lib/store/env.ts` reads and rewrites that file line-wise, preserving unrelated lines.
- Settings shows each known key masked (`••••…a1b2`), with Set / Change / Remove. Changes go through `runBatch` with a `settings.update` action whose `targets` is `[".env.local"]` and whose snapshots are `{ fields: { ANTHROPIC_API_KEY: "set" | "unset" } }`, so the log records the name and never the value. This batch commits nothing (`commit: false`) because `.env.local` is ignored.
- After a key write, `process.env` is updated in place so the running server uses it without restart.
- `npm run check-secrets` scans staged files (or all tracked files with `--all`) for: `sk-ant-[A-Za-z0-9_-]{20,}`, `sk-[A-Za-z0-9]{32,}`, `AKIA[0-9A-Z]{16}`, `ghp_[A-Za-z0-9]{36}`, `xox[bap]-`, `-----BEGIN [A-Z ]*PRIVATE KEY-----`, and `(api[_-]?key|secret|token)\s*[:=]\s*["']?[A-Za-z0-9_\-]{24,}`. Exit 1 with file and line on a hit. `.githooks/pre-commit` runs it. `scripts/postinstall.mjs`, wired as the `postinstall` script in `package.json`, sets `git config core.hooksPath .githooks` on every `npm install`, so a clone on a second machine is protected before its first commit; it is a no-op outside a git checkout (Decision 39).
- The pattern list lives in `lib/security/secrets.ts`; `scripts/check-secrets.mjs` imports it. One definition, because the scanner that refuses a commit and the history log that records the refusal have to agree on what a credential looks like, and a second copy would drift silently.
- The scanner reports **file, line, and pattern name — never the matched text**. Its output reaches a terminal, a CI log, and git's error message; echoing the line it found would copy the secret into all three. `scripts/check-secrets.test.ts` asserts it.
- **The write path refuses first.** `runBatch` scans the summaries, `meta`, target paths, and both sides of every snapshot with `findSecret` before appending a line, and refuses the whole batch on a hit — rolled back, nothing logged, nothing committed, `StoreError("secret_rejected")` → 422. `findSecret` returns the pattern *name*, never the match, so a rejection message cannot echo a credential any more than the scanner can. The UI obligation is §13.5's: a refused save leaves the composer, the editor, and the file exactly as they were (Decision 50).
- `scrubSecrets` redacts those patterns, plus credentialed URLs (`://user:token@`), and caps the result at 500 characters. Everything a subprocess produced passes through it before being written under `data/` — today that is `meta.commitError` in `markCommitFailed`, which carries git's own error and the commit subject inside it. Redaction runs **before** the cap: truncating first can leave a key fragment too short to match, which the scrubber would then pass as clean. The reason this matters more than an ordinary log leak is that `actions.jsonl` is append-only and committed, so a credential landing in it is found by the hook on the *next* commit and refuses every commit after that until someone edits history by hand.

---

## 12. Project versus user changes

- `seed/` mirrors `data/`: empty `tasks/`, `chats/`, `files/{images,docs,other}` with `.gitkeep`, `files/index.md` header only, `knowledge/index.md` explaining the layout, empty profile files with a comment header each, the four maps, empty `notes/`, `collections/`, `sessions/`, `settings/settings.json` (§4.9 values with `weather.query` empty and no coordinates, so the public seed ships with weather off), `settings/themes/.gitkeep`, `history/actions.jsonl` (empty) and `action-history.md` (header only).
- `npm run init` copies `seed/` → `data/` and refuses if `data/` exists and is non-empty (exit 1, message names the directory). It does not touch git configuration; the hook path is installed by `postinstall` (§11.5), which is what makes it land on a clone whose `data/` is already populated.
- Every batch carries `scope`, and it records **whose change this is**, not where the file sits. **`user` is anything personal to the owner — everything under `data/`, plus `.env.local`; `project` is code, `seed/`, and docs.** `code.change` is `project` unless every touched path is under `data/`. The key writes of §11.5 are the case that made the wording matter: `.env.local` is outside `data/` and is as personal as anything in it (Decision 57).
- **When the assistant cannot tell** (a new theme, a new category, a seed change), the Build-mode prompt tells it to ask "Should this ship with the project or stay yours?" before writing, and the answer sets where the file goes (`seed/` vs `data/`).
- `npm run publish-check`: greps `app/ components/ lib/ scripts/` for `data/` string literals outside `lib/store/paths.ts`; greps for the identity name and weather label from the current `settings.json`; verifies every path `lib/store` reads has a counterpart in `seed/`; verifies `.env.local` is ignored; runs `check-secrets --all`; greps the **published file set** (the repo minus `data/`, `BUILD_PROMPT.md`, and `HANDOFF-CHAT.md`, exactly what `publish` ships) for AI-authorship strings (`Co-Authored-By`, `Generated with`, `Claude Code`, `Anthropic`), skipping only `lib/agent/`, `package.json`, `package-lock.json`, `PROJECT.md`, and `AGENTS.md`, which name providers and SDKs legitimately. `BUILD_PROMPT.md` would trip this grep if it were included; that is a symptom of it being published at all, never a reason to lengthen the skip list; **the four strings are assembled from fragments at runtime rather than written literally in the script**, because a grep for literal text held literally in the file that greps for it finds itself first, and the skip list is not the fix (`AGENTS.md` amendment `r`); then, in a temp directory, clones the repo, runs `init`, `build`, and starts the server to hit `/api/tasks` once. Exit 1 on any failure.
- `npm run publish` (Decisions 22, 41): creates a temporary worktree, removes `data/`, `BUILD_PROMPT.md`, and `HANDOFF-CHAT.md` from the index, adds all three to `.gitignore` in that tree, commits as a single orphan commit `Publish`, and force-pushes to the `public` remote's `main`. Refuses if `publish-check` fails. Everything else, including `PROJECT.md` and `AGENTS.md`, ships.
- `README.md` (Phase 11): setup, layout, bring-your-own-key, no personal content.

---

## 13. Assistant integration (`lib/agent/`)

### 13.1 Context assembly

```ts
interface ContextBlock { label: string; source: string; text: string; tokens: number; cache?: boolean }
assembleContext(input: {
  mode: "ask" | "tasks" | "build" | "schedule" | "theme";
  conversation?: Conversation; viewDate?: string; range?: [string, string];
  openFile?: string; taskIds?: string[];
}): Promise<{ system: ContextBlock[]; total: number }>
```

Order: **stable settings** · `index.md` · profile files (these five are `cache: true` and are sent as one system block with `cache_control: { type: "ephemeral" }`) · mode instructions (`prompts.ts`) · **current time** · view tasks table · open file · referenced tasks. The debug view (§10.2) renders exactly this array.

The settings preamble is **two blocks, not one**, and the split is what makes the cache breakpoint worth setting. **Stable settings** — name, nickname, timezone, day shape, categories, the date formats — change when the owner changes them, which is close to never, and sit inside the cached prefix. **Current time** carries the one line that differs on every request and sits *behind* the breakpoint, immediately before the view tasks table. Caching is prefix-based: anything volatile ahead of the breakpoint invalidates everything behind it, so the original order paid the cache-write premium on every call and could never take a hit (Decision 59).

### 13.2 The chat loop

```ts
runChatTurn(input: {
  conversationId: string; userMessageId: string; assistantMessageId: string;
  mode: "ask" | "tasks"; model: string; effort: Effort; signal: AbortSignal;
}): AsyncIterable<TurnEvent>
type TurnEvent =
  | { type: "delta"; text: string }
  | { type: "tool"; name: string; input: unknown }
  | { type: "proposal"; proposal: Proposal }
  | { type: "done"; stopReason: string }
  | { type: "error"; message: string };
```

Implementation: build `messages` from `activePath()` (user/assistant text, attachments as image or document blocks where the model supports them, annotations with `includeInContext` inserted as a trailing note in the user turn they anchor to). Loop: `client.messages.stream({ model, max_tokens: 64000, system, messages, tools, output_config: { effort } })`, forward `text_delta` events, collect `tool_use` blocks; on `stop_reason === "tool_use"` execute read-only tools locally, append results as one user message, continue; proposal tools return "recorded" as their result and emit a `proposal` event. Maximum 8 tool rounds per turn. Streaming text is written to the assistant message file at most every 500 ms and on every tool round (§8).

**`max_tokens: 64000` is above the SDK's non-streaming ceiling, and that is why every provider call in this app streams** — the structured-output ones in §9.4 and §11.3 included, not only this loop. The installed client refuses a non-streaming request before it is sent once `max_tokens` passes `128000 / 6 ≈ 21333`, so `messages.parse` is unusable at this number and `messages.stream` with `output_config.format` is the path for both (Decision 27). Lowering `max_tokens` to reach `parse` is the wrong trade: it would cap a chat turn to buy back an API that offers nothing `stream` does not. Finality (§16.3) is decided in one place, `finalizeTurn()`, from the loop's exit: `message_stop` reached → `complete`; abort or thrown error → `failed` with `error` set.

### 13.3 Tools

Read-only: `read_knowledge({ path })`, `search_knowledge({ query })`, `read_file({ path })` (any `data/` path), `list_tasks({ from, to })`. Proposal collectors: `propose_tasks({ items: TaskDraft[] })`, `propose_knowledge_write({ writes: KnowledgeWrite[] })`, `propose_collection_append({ collection, items })`. All defined with `strict: true` JSON schemas. Tasks mode offers all seven; Ask mode offers all seven with a prompt that says to prefer answering; Build mode uses none (Agent SDK).

```ts
type KnowledgeWrite = { path: string; op: "create" | "append" | "replace"; content: string; reason: string; mapLink?: string }
type Proposal = { kind: "tasks"; items: TaskDraft[] } | { kind: "knowledge"; writes: KnowledgeWrite[] } | { kind: "collection"; collection: string; items: string[] }
```

### 13.4 Build mode

`lib/agent/build.ts` uses `@anthropic-ai/claude-agent-sdk`'s `query()`. Verify the installed version's option names before implementing; the shapes below are from the docs as of 2026-09-03.

```ts
runBuild(input: { prompt: string; approval: "plan" | "auto"; conversationId: string; signal: AbortSignal }): AsyncIterable<BuildEvent>
```

Common options: `cwd: REPO_DIR`, `model: settings.models.build.model`, `maxTurns: 40`, `disallowedTools: ["Edit(data/**)", "Edit(.env.local)", "Bash(git push*)", "Bash(git commit*)", "Bash(rm -rf*)"]`, `abortController`, and `env` carrying `ANTHROPIC_API_KEY` from `.env.local` when set (otherwise the SDK uses the machine's Claude Code login). The system prompt appends: repo conventions from `AGENTS.md`, "ask whether a change is project or personal when unclear," and the no-attribution rule.

- **Plan first:** stage 1 runs with `permissionMode: "plan"` and a `canUseTool` that denies every write; the final text is the plan, shown for approval. Stage 2 runs with `permissionMode: "acceptEdits"` and the prompt "Apply this plan exactly: <plan>"; on completion `git status --porcelain` and `git diff` are shown with **Commit** and **Revert**. Commit → `runBatch` with one `code.change` action whose snapshots are `{ git: true }`, `meta.plan`, summary from the first line of the plan. Revert → `git checkout -- <paths>` and `git clean -f <untracked paths>` limited to the changed set.
- **Auto:** one run with `acceptEdits`, then the same capture and an automatic commit; the diff is shown after the fact with a one-click Undo (which is the ordinary undo of a `code.change`).
- Build turns are persisted as messages in the conversation with `model` set to the build model; the plan and diff are the assistant message body.

### 13.5 Failure

A provider error before any delta discards the optimistic message files (never committed) and restores the composer text. An error after deltas marks the assistant message `failed` and commits (§16.3). Keys missing → a single toast "No API key set. Add one in Settings → API keys." and no request is made.

**Where an error is shown**, everywhere in the app and not only here. The question is not which surface raised it but **where the remedy is**. **Authentication and configuration errors raise a toast** (§10.0) — a missing or rejected API key, an unreachable provider, a setting that is not set — because the fix is on another screen and the text in the box did not cause them; the toast names the screen that fixes it. **Every other error raised while a surface is open is shown inline on that surface**, next to the text that caused it and the buttons that would retry it, and so is every error with no on-screen origin at all — a background write, a poll, an action fired from a row menu — which has nowhere else to go and raises a toast. A message about text someone can still see belongs beside that text; a message whose fix is somewhere else belongs where it can point there. Today's inline task edit, this composer, and Phase 8's document view all follow this and none of them needs its own exception, and it is what makes §17's "a wrong key produces one toast" and the inline rule the same rule rather than two.

A `secret_rejected` refusal from any write (§11.5, Decision 50) is the case that makes the rule matter, and the rule above decides only *where* the message appears. Wherever it appears it names the file and the pattern and never the match, the text stays exactly where it was typed, and nothing is discarded on the user's behalf.

---

## 14. API routes

Every route lives in `app/api/**/route.ts`, validates its input with zod through `parseInput` (a mismatch is 400 `code: "invalid"` with a fixed message; the details stay on the server — Decision 78), calls one `lib/` function, and returns JSON (`{ ok: true, ... }` or `{ ok: false, error, code }`) or a streaming body. No route imports the filesystem.

| Route | Method | Calls |
|---|---|---|
| `/api/tasks?date=` | GET | `rankDay(listTasks(), date, settings, now)` — the four §10.1 sections and nothing else; a flat list is a concatenation |
| `/api/tasks` | POST | `runBatch` with `task.create` × N (`{ items: TaskDraft[], source }`) |
| `/api/tasks/[id]` | GET · PATCH · DELETE | read · `task.update` · `task.delete` |
| `/api/tasks/[id]/complete` | POST | `task.complete` (+ `task.create` for repeats) |
| `/api/collections/[slug]/promote` | POST | `{ item }` — one batch: `task.create` with `collection: <path>#<item-slug>`, the id appended to the collection's `tasks`, and ` → [[t_…]]` appended to the item line (§4.5). Filed under the collection because the task does not exist until this creates it |
| `/api/calendar?from&to` | GET | grouped tasks |
| `/api/history?scope&type&before` | GET | `readActions` grouped by batch |
| `/api/history/undo` · `/redo` | POST | `undoBatch` · `redoBatch` |
| `/api/settings` | GET · PUT | settings |
| `/api/settings/themes` · `/[name]` | GET · PUT · DELETE | themes |
| `/api/settings/keys` | GET · PUT · DELETE | masked keys |
| `/api/weather` · `/api/weather/geocode?q=` | GET | `lib/weather.ts` |
| `/api/files/tree?all` | GET | `dataTree`, or with `all=1` `repoTree` over `git ls-files` (Decision 88) |
| `/api/files/read?path&repo` · `/raw?path&repo` | GET | `readForBrowser`: the text split into frontmatter and body, its `version` and the path's policy · the bytes, served as Decision 88 says |
| `/api/files/write` | PUT | `{ path, base, fields, body }` or `{ path, base, text }` — `file.write` / `task.update` / `knowledge.write` by path, no batch when unchanged, 409 when `base` is stale; `{ path, checkbox: { line, expected } }` is one click (Decision 86) |
| `/api/files/upload` | POST (multipart) | `file.add` |
| `/api/files/op` | POST | `{ op: "mkdir" | "rename" | "delete", ... }` (Decision 86) |
| `/api/search?q=` | GET | `search` (Decision 87) |
| `/api/knowledge/tree` · `/graph` · `/backlinks?path=` | GET | one reading of the link index (Decision 90) |
| `/api/chats` | GET · POST | list · create |
| `/api/chats/[id]` | GET · PATCH · DELETE | read all · title/pin/leaf/context/model · delete |
| `/api/chats/[id]/messages` | POST | send (streams NDJSON `TurnEvent`s; first line is `{ type: "ids", userMessageId, assistantMessageId }`). A cancelled stream — Stop, a navigation, a closed tab — aborts the turn and lets it finalize; the route never stops iterating it, because an abandoned generator leaves the message `streaming` and unlogged |
| `/api/chats/[id]/messages/[mid]` | DELETE | soft or hard per §16.2 |
| `/api/chats/[id]/annotations` · `/[aid]` | POST · PUT | `annotation.write` |
| `/api/chats/[id]/distill` | POST | session summary proposal |
| `/api/agent/extract` | POST | Tasks-mode turn without a conversation; returns `ExtractResult` |
| `/api/agent/apply` | POST | apply a `Proposal` as a batch |
| `/api/agent/build` · `/build/apply` · `/build/revert` | POST | §13.4 (streams) |
| `/api/agent/schedule` · `/api/agent/theme` | POST | §10.1 · §11.3 |
| `/api/agent/context` | POST | `assembleContext` for the debug view |
| `/api/sync/status` · `/flush` · `/now` | GET · POST · POST | git |

Streams are `Content-Type: application/x-ndjson`; the client reads with `fetch` + `ReadableStream` and aborts with `AbortController`, which the route forwards to the provider.

---

## 15. Definition of done

All of these pass before the project is called finished; each is also an acceptance check of its phase.

- Fresh clone + `npm install` + `npm run init` + `npm run dev` produces a working empty app with no personal data.
- Six tasks from one prompt, then one undo, removes all six; `actions.jsonl` retains the create entries and gains one `undo`.
- Every task file opens in a text editor; an edit there appears in the app on refresh.
- Editing a note in the browser, saving, then undoing restores the previous content byte-for-byte (SHA-256 of the file before the edit equals SHA-256 after the undo; never `git diff`, which normalizes line endings).
- A collection with 200 items produces zero rows on Today.
- An equation sheet with LaTeX renders in preview and survives edit-and-save unchanged (SHA-256 before and after are equal).
- The graph opens on an empty `data/` without crashing and shows the empty state.
- Killing the network mid-response leaves the message `failed`, not `complete`, with a Retry button.
- A rejected send (invalid key) leaves no message file behind and the composer keeps the text.
- A conversation with three branches produces one commit per finalized **turn**; `git log --oneline` on the conversation dir proves it. A turn is the pair — §16.3 commits both files as one `chat.message` batch, so three branches are three commits and not six. This said "per finalized message" until the Phase 6a close, which contradicted §16.3; the specific rule won.
- Branching from the first message works (the new root is a sibling; both appear in the sidebar).
- An annotation on an off-path message shows in the "N notes on other branches" count.
- `lib/chat/tree.ts`, `text-match.ts`, and `anchoring.ts` have unit tests that pass.
- Deleting `settings.json` and reloading restores defaults without a crash.
- Clearing the weather location removes the element with no layout shift.
- The + button is absent on Chat, present on Today and Calendar.
- `Ctrl+C` on `npm run dev` leaves `git rev-list --count @{u}..HEAD` at 0 when a remote is configured and no orphaned `node` process behind. Verified on Windows.
- Every tracked text file checks out with LF (`git ls-files --eol` shows `w/lf` throughout), and no file written by the app contains a CR byte.
- **No credential appears anywhere in history, and the count that establishes it excludes prose.**
  `check-secrets --all` passes over every tracked file, and a scan of `git log -p` for the key
  prefixes in `SECRET_PATTERNS` returns nothing **outside `.md` files**. The exclusion is not a
  courtesy: §11.5's pattern list, §17's Phase 1 check and this line all have to name a prefix in
  order to describe the check, so a count over documentation counts the specification describing
  itself and can never reach zero, and every occurrence of it is prose in this file
  and in `AGENTS.md`. The prefixes come from `lib/security/secrets.ts` at runtime rather than being
  written into the script, the same fix and for the same reason as `AGENTS.md` amendment `r`;
  amendment `x` is this instance and the two others that came with it.
- `grep -ri` for `co-authored-by`, `generated with`, and assistant names over the published file set returns nothing outside `lib/agent/`, lockfiles, and model-id strings.

---

## 16. Chat: branching, sidebar, annotations

This section wins over §10.2 wherever they conflict. `HANDOFF-CHAT.md` is the source for code marked *port*. Read only the `PORTABLE` and `ADAPT` parts it cites; do not read its `DISCARD` sections.

### 16.0 Settled questions (from HANDOFF Part K)

1. Branching ships in v1.
2. Single user, possibly several machines, no concurrent writers. `activeLeafId` is last-write-wins.
3. Auto-commit per batch; write while streaming, commit on finalize (§8).
4. Messages are never edited in place. Edit creates a sibling; a complete message is immutable.
5. Annotations are private marginalia, excluded from context unless `includeInContext` is true.
6. Tens to low hundreds of messages. No virtualization; `scrollIntoView` for navigation. If virtualization ever arrives, the relative-delta glide in HANDOFF Part C becomes mandatory.
7. Chat and tasks connect (§16.9).

### 16.1 Message model

```ts
type MessageId = string;                    // UUIDv7 (lib/chat/uuid.ts, ported from HANDOFF Part B)
interface Message {
  id: MessageId; parentId: MessageId | null; role: "user" | "assistant";
  text: string; createdAt: string; status: "streaming" | "complete" | "failed";
  model?: string; attachments: string[]; refs: string[]; deleted: boolean; error?: string;
}
interface Conversation {
  id: string; title: string; activeLeafId: MessageId | null; pinned: boolean;
  model: string; context: { file?: string; taskIds: string[] }; createdAt: string; updatedAt: string; schema: number;
}
```

Three rules, each with its reason:

- **`parentId` on the child; `children` derived at load.** Appending never modifies an existing file, so a branch is an added file, not a two-file diff with a lost-update race.
- **One file per message.** Messages are immutable once complete; streaming rewrites one small file; UUIDv7 names sort chronologically in `ls`.
- **No integer index.** Sibling order is `createdAt` then `id`; "which is newer" needs no coordinator.

`activeLeafId` lives alone in `conversation.md` because it is the only high-churn mutable field.

### 16.2 Tree and branching (`lib/chat/tree.ts`)

```ts
interface Tree { nodes: Map<MessageId, Message>; children: Map<MessageId | null, MessageId[]> }
buildTree(messages: Message[]): Tree                       // children sorted by createdAt, id; deleted excluded from children
activePath(tree: Tree, leafId: MessageId | null): Message[] // walk parents; `seen` cycle guard; truncates on missing parent
siblingsOf(tree: Tree, id: MessageId): Message[]           // children of the parent (or roots), deleted excluded
latestLeafUnder(tree: Tree, id: MessageId): MessageId      // newest child at each step
buildPairs(path: Message[]): Pair[]                        // §16.5
```

Port `activePath`, `siblingsOf`, `latestLeafUnder` from HANDOFF Part D, replacing the sentinel uuid with `null`, `index` with `(createdAt, id)`, and `isNote` with `deleted`.

**One mutation:** `appendMessage(convId, { parentId, role, text })` creates a file and moves the leaf. Edit = append a user message with `parentId = edited.parentId`, then generate. Regenerate = append an assistant message with `parentId = original.parentId`. **Branch from here = append a user message with `parentId = thisMessage.id`** — a child rather than a sibling, forking the tail below a message that stays where it is; it is not Edit with an empty box, and the reasoning is Decision 68. Edit is offered on user messages and Branch from here on complete assistant messages, so a sibling set never mixes roles. There is no branch entity. Switching = pick a sibling, `latestLeafUnder`, `PATCH activeLeafId`.

**Ids are minted client-side** (`uuidv7()`) and sent with the request; the route echoes them as the first stream line so the client renders optimistically and annotation anchoring knows the id before the model responds.

**Deletion** (Decision 8): `DELETE …/messages/[mid]` → if the message has children, 409 `has_children`; if `status === "failed"` and childless, hard delete; otherwise `deleted: true` written back (a `chat.update` action). If the deleted message was the active leaf, the leaf moves to its parent. Deleted messages are excluded from `children`, siblings, and the path, but their files remain and their annotations report as "on a deleted message".

### 16.3 Streaming, finality, failure

- **One finality contract**, in `finalizeTurn()` (§13.2). Terminal statuses are `complete` (stream reached `message_stop`) and `failed` (anything else). A partial reply is never `complete`.
- **Optimistic inserts roll back.** Send: write user file and assistant file, neither committed; call the provider. **Both are written `streaming` and become `complete` only in the finalizing batch** (Decision 63), so the invariant holds in one direction with no exceptions: a message on disk that is not in the log is `streaming`. If the request is rejected before any delta, delete both files and return the error; the client restores the composer text. If it fails after deltas, mark `failed`, set `error`, commit both files as one `chat.message` batch. Retry = regenerate (a sibling); Discard = hard delete of the failed leaf.
- Stream buffers (`Map<assistantId, string>`) are cleared on every terminal path and when the client navigates away (abort).
- **Stream as plain text; render as markdown once `complete`.**
- Stop generation = `AbortController.abort()` → `failed` with `error: "stopped"`, with the partial text kept.

### 16.4 Annotations

```ts
interface Annotation {
  id: string; kind: "note" | "comment"; targetMessageId: MessageId;
  quote?: string; prefix?: string; suffix?: string; charOffset?: number;   // note
  anchorText?: string; offsetRatio?: number;                               // comment
  includeInContext: boolean; deleted?: boolean; createdAt: string; schema: number;
}
```

- **Port `text-match.ts` verbatim** and `findQuote` / `findAnchorText` from HANDOFF Part E into `lib/chat/`; the DOM half (`indexText`, `rangeFromOffsets`, `offsetOfPoint`, `firstLineRect`) goes in `components/chat/anchoring-dom.ts` with the injected-UI filter changed to `[data-ui]`.
- Use the markdown-insensitive mode: stored text is markdown, displayed text is rendered.
- Cards sit in a right gutter beside the message column (300 px preferred, 200 px minimum, hidden below that rather than overlapping), sorted by anchor y, pushed down on collision, with a connector line. Align to the first line of a multi-line quote via `getClientRects()[0]`. The gutter is outside the message column's 640 px, not inside it; §16.5 has the whole cascade.
- **A hidden gutter owes a count.** When there is no room for it, the conversation header shows "N notes hidden" beside the off-path count, for the same reason the off-path case is not allowed to be silent: an annotation that exists and is not drawn must still say so, and the remedy — widen the window, or collapse the left panel — is one the reader controls.
- Quote not found → card pinned to the message top with an "anchor moved" flag. Target message deleted or missing → "Unanchored" tray. **Target off the active path → a count "N notes on other branches" in the conversation header that opens a list; clicking one switches to that branch.** Silent is not acceptable.
- Soft delete with a restore tray at the bottom of the gutter. Whole-file save per annotation; no shared array.
- Composer: opens in the gutter at the anchor before insertion, focused with `preventScroll`, `Enter` sends, `Shift+Enter` newline, `Esc` cancels, closes on outside pointer-down only when empty; the composer's `top` is handed to the new card so it becomes the card in one frame.

### 16.5 Sidebar

- The list is `buildPairs(activePath())`: `{ prompt: Message; response: Message | null }[]`, recomputed on every render, nothing stored. A pair whose prompt has more than one sibling becomes a section header showing its own branch number; beneath it only the *other* branches, each with its real 1-based number, first two shown, rest behind "N more".
- **Current-message tracking:** the current message is the last row whose top is at or above the scroller's top plus an 80 px reading margin. Exceptions: parked at the bottom with the true last message on screen → that message; parked at the top with the first message mounted → the first message. Zero-height rows never win. Assistant messages normalize to their prompt.
- Auto-center the current entry; pause when the user scrolls the sidebar; resume when the current message changes. A guard flag distinguishes programmatic scroll.
- **Width mode from available space only**: full (280 px) when the message column can keep ≥ 640 px, strip (36 px) otherwise, never from conversation length. A persisted collapse preference forces strip.
- **The width cascade, in order, because §16.4 and §16.5 do not compose if each is read alone.** The 640 px is the *message column*; the annotation gutter sits beside it, not inside it — a 300 px gutter taken out of 640 would leave a 340 px reading column, which is not what either section means. So the main pane is divided in this order: **message column first** (640 px, its reserved share), **then the gutter** (300 preferred / 200 minimum / hidden below), **then the sidebar** (280 full / 36 strip). Each step takes what is left after the ones above it. The yield order follows: the gutter hides before the sidebar drops to strip, and a hidden gutter says so (§16.4). The **left panel's collapse is the release valve**, and it is deliberately the one the reader already controls rather than something the layout does on their behalf: 240–420 px come back the moment they ask for them.
- Skip the render-signature guard and summary memo in v1; HANDOFF Part C has both and they are the first optimizations to reach for.

### 16.6 Quote replies

`parseQuoteReply(text)` (port from HANDOFF Part J) recognizes a leading blockquote; the source is the nearest earlier message on the path whose markdown contains the quote, matched markdown-insensitively. Render a clickable bar on the quote, show the source on hover, jump to the span on click. Recompute only when the path signature changes; unmount the feature entirely when the path has no quote replies.

### 16.7 Conventions adopted wholesale

- **Z-index tiers:** 20 in-scroll surfaces (gutter cards, drop overlays), 30 panels and bars (composer sheet, sidebar, + button), 40 toasts and modals. Nothing else.
- **"Failure behavior:" paragraph in every module header.** House rule in `AGENTS.md`.
- **Degrade one feature, never break the page.** Each chat feature (sidebar, annotations, quote replies, read-aloud, voice) mounts in its own error boundary and, on failure, unmounts itself and toasts once.
- **Timers are never used for correctness.** Wait on the observable consequence, with a timeout as the failure guard.
- **Dirty-check every write:** never write a value already set; store functions compare before writing and skip a no-op.
- **CSS custom properties** for the palette; nested components inherit.
- Keyboard: `Enter` sends, `Shift+Enter` newlines, `Esc` closes.

### 16.8 Explicit non-goals

Do not reproduce: phantom messages after a failed send; an interrupted stream stored as complete; concurrent annotation saves clobbering each other; stream buffers leaking on failure; `children[]` stored on the parent; a global integer index; message-id-plus-offset anchoring; shipping without a schema version; multi-tab editor groups; per-message graph nodes; a filesystem watcher; drafts in the repo.

### 16.9 Where chat meets the rest

- `extractRefs(text)` (`lib/chat/refs.ts`) finds task ids (`\bt_\d{8}_[0-9a-f]{4}\b`) and `data/`-relative paths in markdown links. They are stored in `refs`, rendered as links, counted as graph edges from the conversation node, and listed in a task's backlinks.
- `conversation.context` records the file or tasks a conversation is about (§4.7). Reopening the conversation shows the conversation, with that file as a chip in its header that opens it in the document view; the file stays in context for every turn. It does not reopen the file in place of the messages, which would put a document where someone opening a conversation expects to read what was said.
- Conversations live only in `data/chats/`.

### 16.10 Tests

Unit tests with vitest for `lib/chat/tree.ts` (build, path with cycle guard, siblings, latest leaf, pairs with branch headers, deleted exclusion), `lib/chat/pane-layout.ts` (§16.5's cascade, including that narrowing the window never brings a hidden gutter back), `lib/chat/current-message.ts` (the reading margin and its three exceptions), `lib/chat/annotations.ts` (the four fates, and that every annotation lands in exactly one), `lib/agent/attachments.ts` (which kinds each model may be handed, and what the refusal says), `lib/chat/text-match.ts` (whitespace and markdown modes, block-boundary newlines, repetition limit), `lib/chat/anchoring.ts` (prefix/suffix scoring beats offset; offset breaks ties), `lib/chat/refs.ts`, `lib/schedule/rank.ts` (the worked example in §10.1 as a fixture), `lib/schedule/calendar.ts` (grid shape and alignment for each view, both `firstDayOfWeek` values, months of four, five and six rows, both 2026 DST transitions, and the due/scheduled/completed grouping), `lib/store/frontmatter.ts` (LaTeX round trip), and `lib/history/undo.ts` (fields, content, null snapshots; conflict detection) against a temp directory. Everything else: `docs/CHECKLIST.md`.

---

## 17. Build phases

Each phase ends in a working, committed app. Plan → approve → build → run the phase's checks → report honestly → commit → stop.

### Phase 1 — Skeleton

Next.js app, TypeScript strict, `app/theme.css` with both base themes, the shell with three empty tabs and the settings page stub, `seed/` complete per §12, `.gitattributes` with `* text=auto eol=lf` followed by `git add --renormalize .`, `scripts/init.mjs`, `scripts/postinstall.mjs` wired as `postinstall`, `scripts/dev.mjs` with the shutdown handling of §8, `.gitignore` (`data/` is **not** ignored; `.env.local`, `node_modules`, `.next` are), `.githooks/pre-commit` (`#!/bin/sh`, LF, executable bit set with `git update-index --chmod=+x`) + `scripts/check-secrets.mjs`, `lib/store/paths.ts`, `frontmatter.ts`, `settings.ts`, `vitest` configured.
**Checks:** `npm run init` on an empty `data/` succeeds and refuses a second time; `npm run dev` serves three tabs; `GET /api/settings` returns defaults; deleting `settings.json` and reloading restores defaults; a staged file containing `sk-ant-…` is refused by the hook, **verified on Windows from both PowerShell and Git Bash**; on a second clone whose `data/` is already non-empty, a fresh `npm install` alone installs the hook (`git config core.hooksPath` prints `.githooks`) and a staged `sk-ant-…` is still refused; a settings write through the store yields a file with zero CR bytes, and `git ls-files --eol` shows `w/lf` for every tracked text file; with a local bare repository as `origin`, `Ctrl+C` on `npm run dev` after a commit leaves `git rev-list --count @{u}..HEAD` at 0 and no surviving `node` process from the dev tree, **verified on Windows in both PowerShell and Git Bash**; frontmatter round-trip test passes with a LaTeX body.

### Phase 2 — Store, history, git

`lib/store/tasks.ts`, `files.ts`, `events.ts`; all of `lib/history/`; `scripts/history.mjs`; `/api/tasks`, `/api/history`, `/api/sync/*`; the sync indicator in the shell.
**Checks (CLI, before any UI depends on it):** create three tasks via a script through `runBatch`, `git log` shows one commit; `history undo <batch>` removes all three and adds an `undo` line and commit; `history redo` restores them; a fields-level update undoes to the exact prior frontmatter; the conflict check fires when a later batch touched the same file; killing `npm run dev` with `Ctrl+C` after a commit leaves `@{u}..HEAD` at 0 (with a test remote); `action-history.md` regenerates.

### Phase 3 — Today

`lib/schedule/*`, `lib/weather.ts`, `components/today/*`, task menu actions, day navigation, first-run card, weather.
**Checks:** the §10.1 worked example is a passing test; rendering twice yields identical order; complete/undo round-trips; a repeating task completes and materializes the next instance in the same batch, and undo removes both; a task with `repeat` set and no `due` and no `scheduled` is refused by the store and nothing is written (Decision 52); clearing the weather location removes the element with no layout shift; Ask about this opens the composer stub in Ask mode — a toast or small inline panel reading `Ask mode · <task title>`, no provider call and nothing written. The sheet itself is Phase 5's (§9.1), and is deliberately not built here so Phase 5 does not inherit its geometry from outside its own plan.

### Phase 4 — Calendar

Rolling/Month/Week, past-day completed display, "+N more", drag to reschedule.
**Checks:** a task completed yesterday appears in yesterday's darkened cell; dragging to another day writes `scheduled` and one commit; Shift-drag writes `due`; undo restores.

### Phase 5 — Composer

Button, sheet, attachments, voice, modes, `lib/agent/registry.ts`, `anthropic.ts`, `context.ts`, `tools.ts`, `prompts.ts`, `chat.ts` (Tasks mode path), `/api/agent/extract`, `/api/agent/apply`, preview panel with the full loop, API-key settings section (needed to run it).
**Checks:** + absent on Chat, present elsewhere; six tasks from one prompt → one batch → one undo removes all six; a follow-up revises the preview in place; "add these three movies to my watchlist" proposes a collection write; "read Dune" returns a question; a wrong key produces one toast and no files; the context debug endpoint returns the blocks and total.

### Phase 6 — Chat

In this order, each step verified before the next: (a) `lib/chat/tree.ts`, `uuid.ts`, `refs.ts` with tests; (b) `lib/store/chats.ts` and a round-trip test through a temp dir; (c) linear chat: send, stream, finalize, the failure path, retry, discard, stop; (d) branching: edit, regenerate, branch from here, switching; (e) sidebar; (f) annotations, quote replies, read aloud, model selector, context debug view.
This is the largest phase; if (c) or (f) grows past a day of work, it splits into 6a/6b at plan time.
**Checks:** the §15 chat items (failed not complete; rejected send leaves nothing; one commit per finalized turn across three branches; branch from the first message; off-branch annotation count); tree, text-match, and anchoring tests pass.

### Phase 7 — Knowledge base and collections

`lib/knowledge/*`, `lib/store/knowledge.ts`, `lib/agent/memory.ts`, knowledge proposals in the preview panel, auto-apply rule, collections with promote-to-task, distill-to-knowledge, `npm run kb:check`.
**Checks:** a proposal for a note without a map link is rejected by `runBatch`; a three-line append to `habits.md` auto-applies with a toast and an Undo (on the marker under the reply, Decision 84); a 200-item collection yields zero Today rows; promote creates a task linked both ways in one batch; `kb:check` reports a deliberately orphaned note and exits 1.

### Phase 8 — Knowledge browser

Rail, Tree (both panels), document view with edit/save/frontmatter table/checkboxes/backlinks/KaTeX, file operations, search. The graph is Phase 8b's.
**Checks:** edit-save-undo restores the file byte-for-byte (SHA-256 equal); LaTeX survives a round trip (SHA-256 equal); clicking a checkbox in a collection saves one action; backlinks list the linking files; a document open in the main pane is in the next turn's context (debug view shows it).

### Phase 8b — Graph view

The graph view of §10.2, after Phase 8's backlinks have proven the index. Split out of Phase 8 at its plan's approval: it is the one part with a new dependency and a canvas rendering path, and nothing else in Phase 8 depends on it.
**Checks:** the graph opens on empty `data/` with the empty state and on a populated one shows edges matching backlinks.

### Phase 9 — Build mode

`lib/agent/build.ts`, both approval paths, diff view, commit and revert, `code.change` undo.
**Checks:** plan-first shows a plan, then a diff, then commits one `code.change`; revert leaves `git status` clean; undo of a `code.change` reverts the commit; Auto commits and shows the diff with Undo; the agent cannot edit `data/` or `.env.local` (a prompt asking it to do so is refused by the deny rule).

### Phase 10 — Settings and themes

Every settings section, protected base themes, duplicate/edit/delete custom themes, create-by-prompt, key management with masked display, geolocation flow.
**Checks:** base themes cannot be edited or deleted; a custom theme applies live and persists; a key change logs the name only (`grep` the log for the value returns nothing); changing focus size changes the Today list immediately.

### Phase 11 — Publish readiness

`publish-check`, `publish`, README, `docs/CHECKLIST.md`, seed audit, fresh-clone test.
**Checks:** `publish-check` passes; a fresh clone into a temp dir with `init` and `dev` shows an empty app; every §15 item is ticked in `docs/CHECKLIST.md` with the date it was verified.
