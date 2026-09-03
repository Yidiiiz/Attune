# Spec Request: File-Backed AI To-Do App

## FILL THESE IN BEFORE PASTING

- **Project name:** `Attune` (used for the folder, package name, and page title)
- **GitHub repo:** `Attune` (must be **private** — this repo will contain personal data)
- **Default timezone:** `America/New_York`
- **Default weather location:** `New York City` (city name, or leave blank to ship with weather off)

---

## 0. What I want from you in this session

Write the specification only. **Do not write application code yet.**

Produce exactly two files in the repo root:

1. `PROJECT.md` — the complete, self-contained build specification. Someone should be able to read only this file and build the app correctly.
2. `AGENTS.md` — a short (30–60 line) working-rules file for whatever coding agent later builds and maintains this repo: stack, commands, file conventions, the hard rules from §2, and where to look things up. Keep it lean; it is not a second copy of `PROJECT.md`.

**There is a third file already in this repo: `HANDOFF-CHAT.md`.** It is an extraction from an earlier project of mine that solved the chat-tab problems — conversation branching, a history sidebar, and anchored margin notes. **Read it in full before you write §16, and consult it while writing §5, §7 and §10.** It carries verbatim TypeScript for the parts worth porting and explicit warnings about the parts that are not. It is a reference, not a specification: `PROJECT.md` must still stand alone, citing `HANDOFF-CHAT.md` for code to copy rather than restating it.

`PROJECT.md` must expand every section below into implementable detail: concrete file paths, concrete field names and types, concrete function signatures where behavior is non-obvious, and concrete acceptance criteria. Where I have left a decision to you, make the decision, state it, and give a one-line reason in a **Decisions** section near the top of `PROJECT.md`.

Where something below is genuinely ambiguous and the wrong guess would be expensive to unwind, ask me before writing rather than guessing. Otherwise decide and note it.

When you are done, stop and summarize the decisions you made. I will review before we start Phase 1.

---

## 1. What this is

A personal to-do and scheduling app, run locally, whose entire state lives in plain files in a git repository. An AI assistant is a first-class part of the interface: it creates and edits tasks, answers questions, maintains a knowledge base about me, and can modify the app's own code.

Three tabs: **Today** (daily list / schedule), **Chat** (full assistant interface), **Calendar**. A floating composer button on Today and Calendar opens an assistant prompt for quick capture.

Two properties matter more than any feature:

- **Everything is a file.** No database. Human-readable, hand-editable, greppable, diffable.
- **Everything is reversible.** Every state change is logged with enough information to undo it, and is a git commit.

---

## 2. Hard rules

These override anything else in this document.

1. **Do not overcomplicate.** Prefer the boring solution. No abstraction until there are three concrete uses for it. No state-management library, no ORM, no component library, no CSS framework. If a feature can be a function in an existing file, it does not get a new file.
2. **Dependency budget: 12 runtime dependencies**, not counting `next`, `react`, `react-dom`. Pre-approved and already counted: the Anthropic SDK and Agent SDK, a markdown renderer plus an HTML sanitizer, a frontmatter parser, KaTeX (§10), and `d3-force` (§10). That leaves about five. Adding one beyond the budget requires writing down what it replaces and why hand-rolling is worse.
3. **No AI-authorship attribution anywhere in this project.** No `Co-Authored-By` trailers, no "generated with" footers, no assistant name in commit messages, README, code comments, docs, or UI copy. Commits read as if I wrote them. *(This is about authorship only — the app calls model APIs and must name model IDs in code and settings. That is fine.)*
4. **Secrets never touch the data directory.** See §11.
5. **File length:** no source file over ~300 lines. Split by feature, not by layer.
6. **Every write goes through the history layer.** No component writes to disk directly. See §7.

---

## 3. Stack and architecture

**Next.js (App Router, TypeScript), single process.** `npm run dev` serves the UI and the API routes that read and write files and run the assistant. One command, one process, one port.

The app runs locally today but should be able to become a hosted product later without a rewrite. Achieve that with **two seams, and nothing more**:

- **`lib/store/`** — the only module that touches the filesystem. Every read and write in the app goes through its exported functions (`listTasks`, `writeTask`, `readSettings`, `appendAction`, …). Swapping local files for object storage or a database later means replacing this module's internals, not hunting through components. Do not build a plugin system or an interface hierarchy for this — one module with a documented function surface is the whole seam.
- **`lib/agent/`** — the only module that talks to a model provider or runs the coding agent. Same reasoning: a hosted version runs this on a worker instead of in-process.

Everything else (components, routes, scheduling logic) may assume it is calling ordinary async functions.

**Styling:** plain CSS with CSS custom properties as theme tokens, in one `theme.css` plus per-component CSS modules. This is deliberate — user-authored themes (§11) are just a list of custom-property values, which is only simple if the styling layer is plain CSS.

**Server-side rendering:** keep it simple. Client components with `fetch` to API routes is acceptable and probably preferable to threading server actions everywhere.

---

## 4. Repository layout

Propose a layout equivalent to this. Adjust if you have a better answer, but preserve the separation between **project** (shipped) and **data** (mine).

```
app/                      # Next.js routes: /(today), /chat, /calendar, /settings
  api/                    # tasks, chat, agent, history, settings, weather, files
components/
lib/
  store/                  # ONLY module that touches the filesystem
  agent/                  # ONLY module that talks to model providers
  schedule/               # deterministic ranking + day-planning logic
  history/                # action log, undo/redo, git sync
  knowledge/              # knowledge-base read/write/index
seed/                     # blank-slate copy of every data file — SHIPPED
data/                     # my content — private repo only
  tasks/
    2026-09-03-linear-algebra-pset.md
  days/
    2026-09-03.md         # optional per-day notes + manual ordering overrides
  chats/                    # see §16 — one file per message, not one per thread
    <conv-id>/
      conversation.md       # id, title, activeLeafId, schema, createdAt — small and hot
      messages/
        019f3e54-….md       # one message; frontmatter carries parentId
      annotations/
        019f3f71-….md       # notes and comments, anchored by message id
      attachments/
  knowledge/
    index.md              # master map — links to every map below
    profile/
      about-me.md
      habits.md
      preferences.md
    maps/                 # courses.md, projects.md, people.md, tools.md
    notes/                # atomic notes
    collections/          # curated lists + reference docs (watchlist, equation sheets)
    sessions/             # distilled summaries of past chats
  files/
    images/2026-09/
    docs/2026-09/
    index.md              # manifest: path, added, source, description, used-by
  settings/
    settings.json
    themes/               # user-authored themes
  history/
    actions.jsonl         # append-only machine log
    action-history.md     # generated human-readable mirror
.env.local                # API keys — gitignored, never committed
```

`data/` **is** committed (that is what makes undo and sync work), which is why the repo must be private.

---

## 5. Data model

### Task file

One markdown file per task: `data/tasks/<due-or-created-date>-<slug>.md`. YAML frontmatter for structured fields, markdown body for details.

```markdown
---
id: t_20260903_7fa2
title: Linear algebra problem set 4
status: todo            # todo | doing | done | archived
priority: 2             # 1 critical, 2 high, 3 normal, 4 someday
estimate_min: 90
due: 2026-09-10          # date, or date+time, or empty
scheduled: 2026-09-08    # the day it should surface on; empty = auto
completed_at:            # ISO timestamp, set on check-off
category: school         # school | personal | <user-defined>
context: MATH 221        # class, project, or area — shown as a subheader
tags: [pset, weekly]
links:
  - ../files/docs/2026-09/pset4.pdf
blocked_by: []
created_at: 2026-09-03T14:12:00-04:00
updated_at: 2026-09-03T14:12:00-04:00
created_by: agent        # user | agent
---

Chapters 4.1–4.3. Office hours Thursday if 4.3 is still unclear.

- [ ] 4.1 problems
- [ ] 4.2 problems
```

Required: `id`, `title`, `status`, `created_at`, `updated_at`. Everything else optional and safely empty. Define sensible defaults for every optional field so a hand-written file with only a title still loads.

**Field inference.** When the assistant creates a task, it fills in `priority`, `estimate_min`, `category`, `context`, `due`, and `tags` from the prompt plus the knowledge base. Every inferred value is shown in the preview (§9) and is editable before the task is saved. Inference is never silent.

Specify in `PROJECT.md`: the exact enum values, the id format, the slug rules, and what happens on a filename collision.

### Settings

`data/settings/settings.json` — typed JSON, not markdown. **This is a deliberate deviation from "everything is markdown":** settings are machine-read on every render, and a typed file removes a whole class of parse bugs. Everything humans and models read stays markdown.

---

## 6. Knowledge base

This is the part I care most about getting right, so it is specified in more detail. The goal is a knowledge store that grows as I use the app, that the assistant can traverse *selectively* instead of loading wholesale, and that stays useful rather than turning into a junk drawer.

Structure follows a **maps-and-notes** model (Maps of Content over atomic notes), with a small always-loaded profile layer:

- **`profile/`** — small, stable, always in context. `about-me.md` (name, school, timezone, working hours, hard constraints), `habits.md` (observed patterns: "starts assignments the night before", "never schedules before 10am"), `preferences.md` (stated preferences: tone, how I like tasks broken down, what I don't want reminders about). Hard cap: 150 lines each. When one grows past the cap, the assistant distills it and moves detail into `notes/`.
- **`notes/`** — atomic notes, one idea each, ~200 words max. Frontmatter: `id`, `title`, `type` (fact | how-to | reference | decision | person | course | project), `tags`, `links` (relative paths to related notes), `source` (chat id, file, or `manual`), `updated_at`, `confidence` (low | medium | high).
- **`maps/`** — one map per domain (courses, projects, people, tools). Each is a curated markdown file of links to notes with a one-line description of why each matters. Maps are the entry points; they are edited, not generated.
- **`index.md`** — the master map. Links to every map and to `profile/`. Auto-regenerated whenever a map or profile file changes.
- **`collections/`** — curated documents I return to, distinct from both tasks and atomic notes. Two shapes, set by a `kind` field in frontmatter:
  - **`kind: list`** — a checkable list. Movies to watch, TV shows, books, restaurants, gift ideas. Items are ordinary markdown `- [ ]` checkboxes in the body, each optionally followed by a short note.
  - **`kind: reference`** — a freeform document. An equation sheet for a class, a cheatsheet, a packing-list template.

  Frontmatter: `id`, `title`, `kind`, `context` (course or project — the **same field name as tasks**, so a collection and its coursework associate automatically), `tags`, `links`, `created_at`, `updated_at`.

  **Collection items are never tasks and never enter the daily ranking.** This is the rule that keeps a 200-item watchlist out of my to-do list. Every list item instead has a **"Make this a task"** action that creates a real task file (§5) and links the two together in both directions, so the collection shows what has already been scheduled.

  Collections can be created by prompting — *"start a list of movies to watch"*, *"build me an equation sheet for MATH 221"* — or by hand. On creation the assistant links the collection from the appropriate map, the same rule that applies to notes. Adding to one by prompt works from anywhere: *"add Dune to my movies list"* appends an item, shown in the same preview-and-approve panel as task writes.

- **`sessions/`** — one distilled summary per past chat thread, kept separate from `notes/` so raw conversation history never pollutes curated knowledge. Facts worth keeping get **promoted** from a session summary into a note, with the session id as `source`.

**Retrieval contract** (this is where the token savings come from — specify it explicitly):

1. Always load: `index.md` + all of `profile/` (target: under 2,000 tokens combined).
2. From those, the assistant selects the maps and notes it actually needs and loads only those.
3. Never load `sessions/` unless the user references a past conversation.
4. If a needed note does not exist, the assistant may create it rather than re-deriving the same thing next time.

**Write rules** (this is what stops it becoming a junk drawer):

- Every new note must be linked from at least one map at creation time, or it does not get created.
- Notes are updated in place, not duplicated. Before writing, check for an existing note on the topic.
- The assistant proposes knowledge writes in the same preview panel as task writes (§9). Low-risk appends to `habits.md`/`preferences.md` may auto-apply, but appear in the action history and are undoable.
- Every knowledge write is an entry in the action log like any other change.
- Include a `npm run kb:check` script that reports orphan notes (linked from no map), broken links, notes over the word cap, and profile files over the line cap.

Specify how the assistant decides that something I said in chat is worth remembering. A simple, stated heuristic is fine and better than a vague one — e.g. remember stable facts, recurring patterns, and explicit preferences; do not remember one-off task content, transient state, or anything already captured in a task file.

---

## 7. Action history and undo

The backbone. Get this right before building UI on top of it.

**`data/history/actions.jsonl`** — append-only, one JSON object per line:

```json
{"seq":142,"ts":"2026-09-03T14:12:00-04:00","batch":"b_20260903_141200","actor":"user","scope":"user","type":"task.update","summary":"Moved 'Pset 4' due date to Sep 12","targets":["data/tasks/2026-09-10-pset-4.md"],"before":{"due":"2026-09-10"},"after":{"due":"2026-09-12"},"commit":"a1b2c3d"}
```

- `type` values: `task.create`, `task.update`, `task.delete`, `task.complete`, `knowledge.write`, `settings.update`, `file.add`, `code.change`, `undo`, `redo`.
- `scope` is `project` or `user` (see §12).
- `batch` groups changes that must undo together — e.g. adding six tasks from one prompt is one batch.
- `before`/`after` hold only the changed fields for small edits; for whole-file changes, store the file path plus the git commit and reconstruct from git.

**Undo** applies the inverse of a batch, newest first, then **appends** an `undo` entry. History is never rewritten or truncated. Redo re-applies. A new action after an undo does not clear the redo stack — it just appends; redo becomes unavailable and the UI says so.

**`data/history/action-history.md`** is a generated, reverse-chronological human-readable mirror, grouped by day, one line per batch with the summary and commit hash. Regenerated on write. It is a view, not a source of truth.

**History UI:** reachable from Settings and via `Cmd/Ctrl+Z` globally. Shows batches, filterable by scope (project / user) and type, with an undo button per batch. Undoing a non-latest batch warns if later batches touched the same files.

---

## 8. Git sync

- One commit per batch, immediately, with a message derived from the batch summary (`task: add 6 tasks from prompt`, `settings: change theme to dark`, `code: add week view to calendar`).
- **Never commit a streaming message.** An assistant reply is written to its file as it streams but is not committed until it reaches a terminal status (§16.3). Committing per chunk would produce hundreds of commits per conversation and make undo meaningless. This is the one place where "commit per change" is deliberately relaxed, and `PROJECT.md` must state it as a rule rather than leaving it to be discovered.
- The commit hash is written back into the action log entry.
- **Push is debounced** (~30s of idle after the last commit) and also **flushed on shutdown** — on `SIGINT`/`SIGTERM`, on process exit, and on a `beforeunload`-triggered `/api/sync/flush` call from the browser. A `dev` shutdown must not leave unpushed commits.
- Failures (offline, auth, conflict) never block the UI. Show an unobtrusive sync status indicator with states: synced / pending / offline / error, and a manual **Sync now** button.
- On conflict, do not auto-resolve. Stop pushing, surface the error, and tell the user the exact command to run.

---

## 9. The composer button

A fixed circular **+** button, bottom-right, above all content, on **Today** and **Calendar** only. **Never on the Chat tab.**

Clicking it slides a composer sheet up from the bottom edge to rest along the bottom of the screen. Clicking **+** again, pressing `Esc`, or clicking outside closes it. While open, the button either moves out of the way or becomes the close affordance — your call, state it.

**Input:** multiline text that grows, paste of text/images/files, drag-and-drop anywhere on the window while open, an attach button, and voice input if it is cheap to add. Attachments are written to `data/files/…` and registered in the manifest.

**Three modes**, selected in the composer:

| Mode | Default | What it does |
|---|---|---|
| **Tasks** | ✅ | Turns the prompt into tasks. The default posture: assume I want items added. |
| **Ask** | | Normal assistant conversation. No writes unless I approve them. |
| **Build** | | Changes the app's own code. |

**Routing within Tasks mode.** The mode assumes I want tasks, but when the content is plainly list or reference material — *"add these three movies to my watchlist"* — it proposes a **collection write** (§6) instead and says which collection in the preview. When it genuinely cannot tell (*"read Dune"* is either a task or a list item), it asks rather than guessing.

**Build mode approval toggle**, shown in the composer next to the mode selector:

- **Plan first** — *default.* Shows a plan and a diff; nothing is written until I approve. Every applied change is a git checkpoint.
- **Auto** — applies changes directly, git as the safety net.

The toggle is sticky per mode and its state is visible at a glance (label + color), so I never mistake which one is active. Switching to Auto shows a one-time confirmation explaining the tradeoff.

**Tasks-mode preview loop** — this is the important interaction:

1. I prompt (e.g. *"add my finals schedule and study blocks for the next two weeks"*).
2. If the request is underspecified, the assistant asks a clarifying question rather than guessing at volume.
3. It returns a **preview list of task cards**, each showing the full inferred field set from §5.
4. Every field on every card is editable inline.
5. I can also type a follow-up (*"make the study blocks 45 minutes, not 2 hours"*) and the **existing preview updates in place** — it does not append a second set.
6. **Add all** / **Add selected** commits them as one batch. **Discard** asks for confirmation.
7. The preview itself is ephemeral, but the resulting add — and the discard — are both logged.

Ask mode and Build mode have the same preview-and-approve treatment for any writes they propose.

---

## 10. The three tabs

A persistent top-level shell holds the three tabs, a global search field (fuzzy match across task titles and bodies, knowledge notes, and collections — this is a file-based app, so search is just a scan and should not need an index; results open in the document view of §10), and the sync-status indicator from §8.

### Left — Today

Header: date, weekday, and current weather (temperature + condition icon). A back arrow at the **top left** and a forward arrow at the **top right** step the day backward and forward; a "today" button returns. Weather shows only for today and the near-future forecast window, and disappears entirely if no location is set.

Body, in order:

1. **Overdue** — anything past due and not done, at the top, visually marked.
2. **Today's focus** — the ranked list for this day.
3. **Also possible** — everything else that could be worked on, visually de-emphasized (grayed), collapsible.

Each row: a checkbox on the **left** to complete, title, context subheader, and compact metadata (due, estimate, priority). A **⋯** menu per row with: Edit, Duplicate, Reschedule, Delete, and **Ask about this** — which opens the composer in Ask mode pre-loaded with that task as context, for insight or advice.

**Ranking must be deterministic, not a model call.** Define a scoring function in `lib/schedule/`: urgency from due-date proximity, priority weight, an overdue boost, a small nudge for tasks matching the day's available time, and stable tie-breaking. Write the formula out in `PROJECT.md` with a worked example. It must produce the same order on every render and be adjustable in settings (how many items count as "focus", how far ahead to look).

**Schedule mode** — a toggle in the Today header. Renders the remainder of the day as a timeline from the current time to the configured day end (default midnight, adjustable, and permitted to run past midnight when the user works late). Packs focus tasks by `estimate_min` with configurable breaks, respects fixed-time commitments, and shows unallocated gaps. First pass is deterministic; a **Refine with AI** button optionally reorders it with reasoning. Blocks are drag-adjustable; adjustments are logged.

### Center — Chat and knowledge browser

This tab is both the conversation surface and the way I browse everything the app stores. The layout is VS Code shaped: a narrow icon rail on the far left, a panel beside it, and a main pane.

#### Sidebar rail — four panels

1. **Chats** — previous threads, searchable, grouped by recency, with rename / delete / pin.
2. **Knowledge** — a *curated* view, not a raw tree. The top level is the maps from §6 (Courses, Projects, People, Tools) plus **Collections**; expanding a map lists the notes it links to. This deliberately mirrors the assistant's retrieval structure from §6, so what I see in the sidebar is what the assistant navigates.
3. **Files** — the raw tree, VS Code style: expand/collapse, type icons, and a context menu for new file, new folder, rename, delete, and reveal-in-graph. Scoped to `data/` by default, with a toggle to reveal the whole repo. Files outside `data/` are read-only unless the composer is in Build mode.
4. **Graph** — the link visualization, described below.

Panel state — which panel is active, which folders are expanded, scroll position — persists across restarts.

#### Main pane

Shows either a conversation or a document. Opening anything from the rail swaps the main pane to the document view; a strip at the top names what is open and offers a back-to-chat control. **Do not build multi-tab editor groups** — one open document at a time is enough, and tab management is a lot of state for very little gain.

**The chat composer stays docked at the bottom in document view, and the open document is automatically part of the assistant's context.** Opening `equations-math221.md` and typing *"add the change-of-basis formula"* edits that document. This is the whole reason the browser lives inside this tab instead of getting its own.

#### Document view

- Markdown rendered by default, with an **Edit / Preview** toggle. Editing is a plain monospace textarea — no rich text, no WYSIWYG, no editor framework.
- **Saves go through the store and history layers (§7) exactly like every other write:** logged, undoable, auto-committed. `Cmd/Ctrl+S` saves; unsaved changes warn before navigation.
- Frontmatter renders as an editable field table above the body rather than as raw YAML.
- Checkboxes are clickable directly in preview mode and save immediately — this is how a watchlist gets used.
- Markdown links to other files under `data/` are clickable and navigate in place. Every document lists its **backlinks** ("linked from") at the bottom.
- Images render inline. PDFs open in the browser viewer. Anything else offers a download.
- **Math renders via KaTeX**, so equation sheets actually work. LaTeX must round-trip through edit and save unchanged.

#### Graph view

Opens in the main pane at full width.

- **Nodes:** every file under `data/` — tasks, notes, maps, collections, chats, media — colored by type and sized by connection count.
- **Edges:** markdown links in bodies, `links:` frontmatter arrays, task `links`, and note-to-map membership.
- The link index is built by `lib/knowledge/` scanning `data/`, cached, and invalidated on write. It is the **same index** that powers backlinks and `kb:check`, so orphan notes show up here as unconnected nodes rather than needing a separate report.
- Click a node to open it. Hover highlights its neighbors. Filter by type; search dims non-matching nodes.
- **Rendering: `d3-force` for the simulation, plain canvas for drawing.** One dependency, no charting or graph framework.
- Be honest about scale: past a few hundred nodes, default to the neighborhood of a focused node instead of drawing the whole graph.

#### Conversation behavior

- **Per-message actions:** copy, edit-and-resend, regenerate, branch from here, annotate, delete. Edit, regenerate and branch are **one operation** in the data model — see §16.2.
- **Composer:** attachments per model capability, paste, drag-drop, voice input, stop generation.
- **Read aloud:** per-message text-to-speech via the browser's speech synthesis API — no extra dependency, no key.
- **Model selector:** switch providers and models per thread (§11). Show which model produced each response.
- **Branching, the history sidebar, and margin notes are specified in §16**, which is based on a working implementation and supersedes anything sketched here.
- Chats persist under `data/chats/<conv-id>/` as one file per message. Human-readable. **Not one file per thread** — §16.1 gives the reasoning.
- This tab can do everything the floating composer can — create tasks, write collections, change project code — through the same preview-and-approve flow. The **+** button does not appear here because this tab already is that.

### Right — Calendar

- Default view: **rolling**, starting at today.
- Toggles: **Rolling / Month / Week**. Arrows (or up/down for rolling) move by the current unit.
- Each day cell lists its items; cells scroll internally when a day is crowded, with a "+3 more" affordance.
- **Past days are darkened and show tasks completed on that date** (by `completed_at`), so the calendar reads as a progress record looking backward and a plan looking forward.
- Clicking an item selects it and offers the same actions as the Today list (edit, delete, reschedule, ask about).
- Drag an item to another day to reschedule. Logged as a normal update.

---

## 11. Settings

`data/settings/settings.json`, with a Settings screen that edits it. **The whole UI reads from these — nothing hardcodes a value that lives here.**

- **Identity:** name / nickname, used in greetings and by the assistant.
- **Timezone.**
- **Weather location:** free-text place, resolved to coordinates and stored. First run asks permission to use browser geolocation, with manual entry always available. **Empty is valid and removes weather from the Today header entirely.** Units: °C / °F.
- **Theme:** `light` and `dark` ship as base themes and are **protected** — they cannot be deleted or edited. "Duplicate to new theme" makes an editable copy in `data/settings/themes/<name>.json`. New themes can be created by prompting. A theme is a flat set of CSS custom-property values; specify the exact token list.
- **Day shape:** day start, day end (may be after midnight), typical working blocks, break length.
- **List behavior:** focus-list size, lookahead window, whether completed items stay visible.
- **Categories:** editable list, `school` and `personal` as defaults.
- **First day of week.**
- **Models:** default provider and model — **default `claude-opus-5` at high effort** — plus per-mode overrides (a cheaper model for task extraction is reasonable). Support additional providers through a small registry in code; adding one should mean adding an entry, not rewriting the agent module.
- **API keys — read this carefully.** Keys are stored in `.env.local`, which is gitignored, and are **never** written into `data/` or any file under version control, because `data/` is auto-committed and pushed. The Settings UI can add, change, and remove keys by writing `.env.local` through a server route, and displays them masked (last 4 characters only). Key changes are logged in the action history **by name only, never by value.** Include a `npm run check-secrets` script and a pre-commit hook that refuses a commit if anything resembling an API key appears in a staged file.

---

## 12. Project changes vs. user changes

I intend to publish this. Someone else should be able to clone it and start blank, with every feature and no trace of my content.

- **`seed/`** holds a blank-slate version of every file under `data/` — empty task directory, default settings, a starter knowledge base with empty profile files and an explanatory `index.md`. `seed/` is part of the project and is committed to the public repo.
- **`npm run init`** copies `seed/` → `data/` and refuses to run if `data/` already has content.
- Every logged action carries `scope: "project"` or `scope: "user"`. Code, seed files, and docs are project; anything under `data/` is user. **When the assistant cannot tell which a change is, it asks** — for example, "should this new theme ship with the project, or is it just yours?"
- **`npm run publish-check`** verifies before publishing: nothing in `data/` is referenced by code, no personal strings are hardcoded, `seed/` covers every path the app reads, `.env.local` is ignored, and a fresh `npm run init` produces a working app.
- The public README explains setup, the file layout, and how to bring your own keys — with no personal content and no AI-authorship attribution.

---

## 13. Assistant integration

- `lib/agent/` is the only module that talks to a provider. It exposes: send a chat turn (streaming), extract tasks from a prompt, propose knowledge writes, and run a coding change.
- **Coding changes** run through the Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) in-process, scoped to the repo directory, with `permissionMode: 'plan'` by default and direct application only when the composer's Auto toggle is on. Every applied change is committed as its own `code.change` batch so it can be rolled back like anything else. Confirm the current SDK surface before implementing — do not rely on a remembered API shape.
- **Context assembly** is explicit and inspectable: settings + `knowledge/index.md` + `knowledge/profile/*` always; the current view's tasks when relevant; selectively loaded knowledge notes; the current thread. Include a debug view showing exactly what was sent, so context bloat is visible instead of mysterious.
- All model IDs and effort levels come from settings. Nothing hardcodes a model.
- Handle provider failure gracefully: a failed call never loses my typed input and never leaves a half-written file.

---

## 14. Build order

Do not build this in one pass. `PROJECT.md` must end with these phases, each with its own acceptance criteria, and each ending in a working, committed app.

1. **Skeleton** — Next.js app, three empty tabs, `data/` + `seed/`, `npm run init`.
2. **Store + history + git** — task read/write, action log, undo/redo, auto-commit and debounced push. *Prove undo works from the command line before any UI depends on it.*
3. **Today tab** — list rendering, completion, ⋯ menu, day navigation, deterministic ranking, weather.
4. **Calendar tab** — rolling/month/week, past-day completion display, drag to reschedule.
5. **Composer** — the + button, sheet, attachments, Tasks mode with the full preview-and-approve loop.
6. **Chat tab** — build in the order §16 gives, which is not the obvious one: message tree and active path first as pure functions with unit tests, then persistence and round-trip, then a linear chat with streaming and its failure path, then branching, then the sidebar. Annotations come last and only once messages are stable.
7. **Knowledge base + collections** — structure, retrieval contract, write rules, collections with promote-to-task, `kb:check`.
8. **Knowledge browser** — sidebar rail, Files tree, document view with edit and save-through-history, backlinks, KaTeX. *Graph view comes last in this phase, after the link index has been proven by backlinks — do not build the visualization before the index it draws.*
9. **Build mode** — Agent SDK integration, plan/auto toggle, code-change checkpoints.
10. **Settings + themes** — full settings surface, protected base themes, custom themes, secrets handling.
11. **Publish readiness** — `publish-check`, seed completeness, README, fresh-clone test.

---

## 15. Definition of done

`PROJECT.md` must include a checklist covering at least:

- A fresh clone + `npm run init` + `npm run dev` produces a working, empty app with no personal data.
- Creating six tasks from one prompt, then undoing once, removes all six and leaves the history intact.
- Every task file is readable and editable in a plain text editor, and edits made there appear in the app.
- Editing a note in the browser, saving, then undoing restores the previous content byte-for-byte.
- A collection with 200 items produces zero rows on the Today tab.
- An equation sheet containing LaTeX renders in preview and survives an edit-and-save round trip unchanged.
- The graph view opens on a fresh clone with an empty `data/` without crashing, and shows an empty state.
- Killing the network mid-response leaves the message marked `failed`, not `complete`, and offers retry.
- A rejected send leaves no message behind.
- A conversation with three branches produces one commit per finalized message, never one per streamed chunk.
- Branching from the first message in a conversation works.
- An annotation on a message that is off the current branch is reported, not silently hidden.
- The tree model, active-path derivation, and anchoring math each have unit tests that pass.
- Deleting `data/settings/settings.json` and re-running does not crash — defaults are restored.
- Clearing the weather location removes the weather element without layout breakage.
- The + button is absent on the Chat tab and present on the other two.
- Killing the dev server with `Ctrl+C` leaves no unpushed commits.
- No API key appears anywhere in git history.
- `grep -ri` for AI-assistant authorship strings across the repo returns nothing outside of model-ID configuration.

---

## 16. Chat tab: branching, sidebar, and annotations

This section extends §10 and **wins over it wherever they conflict**, because it comes from a working implementation rather than from my imagination. `HANDOFF-CHAT.md` in this repo is the source; read it before writing this part of `PROJECT.md`.

**How to use the handoff.** Every component in it is tagged `PORTABLE` / `ADAPT` / `DISCARD`. Port `PORTABLE` code nearly verbatim — it is small, tested by use, and each piece exists because something simpler failed. Take only the idea from `ADAPT`. Do not read past the heading on `DISCARD`; roughly a third of that codebase fights a host page this app does not have, and none of it applies. `PROJECT.md` should cite the handoff for code rather than reproducing it.

### 16.0 Answers to the handoff's open questions

Its Part K asks seven questions. These are the answers — put them in `PROJECT.md` so they are not re-litigated:

1. **Branching in v1: yes.** It is the reason that project existed.
2. **Repo sync:** single user, possibly more than one machine, no concurrent writers expected. `activeLeafId` is last-write-wins and that is acceptable — it is a view pointer, not content.
3. **Auto-commit per change: yes** — that is §8 of this document. So its warning applies directly and becomes the rule in §8: write while streaming, commit on finalize.
4. **Messages are never edited in place.** An edit creates a sibling. The original is immutable once complete.
5. **Annotations are private marginalia, excluded from model context by default**, with a per-annotation "include in context" flag. The prior project was forced into the opposite by its storage medium; this app is not.
6. **Conversation length:** tens to low hundreds of messages. Do not virtualize the sidebar in v1, and use `scrollIntoView` rather than the frame-stepping glide. Note in `PROJECT.md` that if virtualization ever arrives, the glide becomes mandatory and the handoff has it.
7. **Chat and tasks do connect** — see §16.9.

### 16.1 The message model — replaces any chat storage sketched elsewhere

```ts
type MessageId = string;                    // UUIDv7 — time-sortable, so filenames sort chronologically
interface Message {
  id: MessageId;
  parentId: MessageId | null;               // null = root. No sentinel uuid.
  role: "user" | "assistant";
  text: string;
  createdAt: string;                        // ISO. There is no numeric index.
  status: "streaming" | "complete" | "failed";
  model?: string;
}
interface Conversation {
  id: string;
  title: string;
  activeLeafId: MessageId | null;           // the ENTIRE branch state
  schema: number;
}
```

Three rules that carry the weight, each with a reason worth stating in `PROJECT.md`:

- **Store `parentId` on the child; derive `children` at load.** Never store a children array. Appending a message must never modify an existing file — otherwise one logical append becomes a two-file diff, a lost-update race, and a guaranteed git conflict when two branches leave the same point.
- **One file per message, not one per thread.** A branch is then an *added* file rather than a modified one, messages are immutable so they suit one-file-per-record, and streaming rewrites one small file instead of a growing thread file.
- **No global integer index.** An integer counter needs a coordinator and there isn't one. UUIDv7 or `createdAt` answers every "which is newer" question with no coordination.

`activeLeafId` lives alone in the small `conversation.md` because it is the only high-churn mutable field in the system; isolating it keeps diffs legible.

**Ship a `schema:` field in frontmatter from the first commit.** The prior project had no schema version and no migration path, and says plainly that this is the cheapest thing to do better.

### 16.2 Branching

**Edit, branch, and regenerate are one operation:** append a child to some node, then move the leaf. Editing branches on the user side; regenerating branches on the assistant side. Do not build three code paths — the moment they diverge you own three subtly different sets of bugs.

- Branch from message *N* = create a message whose `parentId` is *N*'s `parentId`. **Nothing is copied.** Prior messages are shared structurally because the path is derived.
- **There is no branch entity, no branch id, no branch name.** A branch is a node with siblings. Counts, numbering and options are all computed at render time. Do not add a branch record.
- Port `activePath()`, `siblingsOf()` and `latestLeafUnder()` nearly verbatim from the handoff's Part D — including the `seen` cycle guard, which makes corrupt data truncate a path instead of hanging the UI.
- Switching targets a **leaf**, not a branch: pick the sibling, resolve with `latestLeafUnder`, set the pointer.
- **Sidebar branch UI:** a branch point becomes a section header showing its own branch number; beneath it, only the *other* branches, each labeled with its real 1-based number, first two shown and the rest behind a "N more" caret. The current branch is the row you are already reading — repeating it wastes a line and creates ambiguity. This was revised into that shape and then never touched again.
- **Mint the message id client-side (or at the top of the server action) and return it before the model call resolves**, for regenerations too. Optimistic UI, annotation anchoring and draft correlation all depend on knowing the id early, and the prior project's retry path is broken specifically because it did not.

### 16.3 Streaming, finality, and failure

The prior project has two real bugs here. **Do not reproduce either.**

- **One finality contract, enforced in one place.** It had two paths that disagreed: one stored an interrupted stream as if it were complete. Define terminal status once — reached the terminator, or errored — and never mark a partial reply `complete`.
- **Optimistic inserts must roll back.** It applied the user message and a pending assistant message before forwarding the request, and never removed them on failure, so a rejected send left phantom messages until a full reload. Either insert after the request is accepted, or set `status: "failed"` and offer retry or discard.
- The three-state `status` exists precisely so `failed` is representable. Its predecessor was a boolean `pending`, which could not express failure — and was, in the end, never read by any UI.
- Clean up per-message stream buffers on failure and on navigation, not only on success.
- **Stream as plain text; render as markdown once complete.** This avoids half-parsed tables mid-stream and reads as intentional.

### 16.4 Notes and comments

**One annotation type, two anchor strategies.** Do not build two systems. A `kind: "note" | "comment"` discriminant is the whole difference: a note is anchored to selected text, a comment to a position.

```ts
interface Annotation {
  id: string;
  kind: "note" | "comment";
  targetMessageId: MessageId;
  quote?: string; prefix?: string; suffix?: string; charOffset?: number;   // note
  anchorText?: string; offsetRatio?: number;                               // comment
  includeInContext: boolean;   // default false — see §16.0 answer 5
  deleted?: boolean;
  createdAt: string;
}
```

- **Anchor by quote + 20-char prefix + 20-char suffix + offset, scored — never by a bare character offset.** Prefix and suffix are worth 2 points each; offset distance is a fractional tiebreaker, so position can only break ties between context-equivalent candidates. Message-id-plus-offset is the obvious design and breaks the first time a message re-renders; retrofitting later means re-anchoring everything already stored.
- **Port `text-match.ts` and `findQuote` verbatim.** The dense projection — strip whitespace, optionally markdown syntax, keep a `map[]` back to source offsets — is about fifty lines and is the single highest-value code in the handoff. A DOM selection's `toString()` inserts newlines at block boundaries that the underlying text nodes do not contain, so exact `indexOf` on a selection quote silently fails the first time someone annotates across a list.
- **Use the markdown-insensitive mode.** In this app the stored text is markdown and the displayed text is rendered — exactly the asymmetry that mode exists for.
- Align cards to the **first line** of a multi-line quote via `getClientRects()[0]`, not the bounding box.
- Never index your own injected UI text when building the text index.
- **Fix the one gap it left.** When an annotation's target message exists but is not on the active path, its card silently disappears with no indication anywhere. Show a count — "3 notes on other branches" — that opens them. The handoff is explicit that durable re-anchoring was made *visible* rather than *correct*; visible is an acceptable answer, silent is not.
- **Soft delete, with a restore tray.** It beat hard delete in daily use. Git is already the undo system for everything else — do not build a second one, but do keep the one-click restore.
- Annotations get **one file each**, in the same store as messages. The prior project split anchors from content across two stores and the direct consequence was annotations that appear on one device and not another.
- Save whole-file, not read-modify-write of a shared array — its concurrent saves could clobber each other.

### 16.5 Sidebar behavior

- The list is not a message list. It is a list of **pairs** — a prompt and its response — derived from the active path on every render, with a pair promoted to a section header when its prompt has siblings. That is the entire layout algorithm.
- Nothing about the list is stored. Recompute from the tree.
- **Current-message tracking:** the current message is the last row whose top is at or above the viewport top plus an ~80px reading margin — monotonic in scroll, so it does not flicker between neighbors. Two exceptions, both learned the hard way: parked at the bottom *and* the true last message on screen → that message; parked at the top with the first message mounted → the first message unconditionally, because the reading margin otherwise lets message 2 win at scroll 0.
- Auto-center on the current entry, but pause the moment the user scrolls the sidebar themselves; resume when the current message changes.
- **Sidebar width mode is chosen by available space, never by conversation length.** An earlier version collapsed when the path was short, which hid the tree exactly when branching off the first message made it short.
- Skip the render-signature guard and the summary memo in v1. Note in `PROJECT.md` that they exist in the handoff and are the first optimizations to reach for, because rendering — not tree math — is what hurt.

### 16.6 Quote replies

Worth having and cheap: when a message opens with a blockquote found in an earlier message on the path, mark it as a reference, show the source on hover, and jump to the exact span on click. The recognizer is a dozen lines in the handoff. Match markdown-insensitively on both sides. Tear the feature down entirely when a conversation has no quote-replies rather than idling.

### 16.7 Conventions worth adopting wholesale

- **A three-tier z-index policy stated once and obeyed everywhere.** Trivial, and it saves a week of whack-a-mole.
- **A "Failure behavior:" paragraph in every module header.** Four lines per file, and it is why that codebase could be read cold and fast. Adopt it as a house rule in `AGENTS.md`.
- **Degrade one feature, never break the page.** Each feature constructed in its own try/catch, a failure disabling only itself, with one toast that names what broke and what still works.
- **Timers are never used for correctness.** Wait on the observable consequence with a timeout as a failure guard, not as a schedule.
- **Dirty-check every write** — never write a value that is already set, so stable states settle and idle means zero work.
- **Define the palette as CSS custom properties and let nested components inherit.** Dark mode then costs zero JavaScript. This is already the §3 styling decision; the handoff independently confirms it.
- Small interaction wins: the composer becomes the card in one frame by reusing its exact position; an empty composer closes on outside click but a composer with typed text does not; follow-ups open inside the existing card rather than as a new composer.
- Keyboard: Enter sends, Shift+Enter newlines, Escape closes. Its README documented Ctrl/Cmd+Enter and was simply wrong — trust the code.

### 16.8 Do not reproduce these

List them in `PROJECT.md` as explicit non-goals: phantom messages after a failed send; an interrupted stream stored as complete; concurrent annotation saves clobbering each other; stream buffers leaking on failure; storing `children[]` on the parent; a global integer index; message-id-plus-offset anchoring; and shipping without a schema version.

### 16.9 Where chat meets the rest of the app

The handoff's last question — whether chat and the task model touch — is answered yes, and `PROJECT.md` must say how:

- A message may reference task ids and file paths under `data/`. Those references are links: clickable in the message, counted as edges in the graph view (§10), and listed in a task's backlinks.
- The document view's "open file is in context" behavior (§10) means a conversation can be *about* a specific file. Record that association on the conversation so it can be reopened in the same context.
- Conversations stay in a global `data/chats/`, not inside a task's directory. A reference field is enough, and nesting would make a conversation about three tasks unrepresentable.

### 16.10 Tests

The prior project had no automated tests, and the handoff argues — correctly — that this was defensible there and is not here. The tree model, the active-path derivation, and the anchoring math are pure functions over plain data in this app. **Unit-test those three.** They are where a silent bug is most expensive and where testing is cheapest. Everything else may rely on a manual checklist.

---

## 17. Notes on things I have not decided

Use your judgment and record the choice in **Decisions**:

- Whether a per-day file (`data/days/<date>.md`) is worth having for day notes and manual ordering overrides, or whether ordering should live entirely in the ranking function.
- Whether recurring tasks are in scope for v1 (I suspect yes for school, but not if it complicates the data model much).
- Whether subtasks are checkboxes in the body or separate linked task files.
- The exact weather provider. Open-Meteo needs no API key and has a free geocoding endpoint, which fits the "clone it and it works" goal — but confirm its current terms before committing to it.
- Whether chat threads belong in the graph by default. With one node per message they will drown out everything else — collapsing a conversation to a single node, or defaulting the type filter off, is probably right.
- Deletion semantics for messages. The prior project never implemented deletion at all, so there is nothing to inherit. My instinct: refuse hard deletion of a message with children, soft-delete leaves, and lean on git for the rest. Decide and write it down before shipping rather than after.
- Whether one-file-per-message needs an index file for fast loading, or whether a directory scan is fine at the conversation sizes in §16.0.
- Whether the Knowledge panel and the Files panel are different enough to justify both, or whether one tree with a "curated / all" toggle is simpler. I want both views; I do not necessarily want two components.
- Any task or collection field you think is missing, or any field above you think is dead weight. Say so rather than including it out of politeness.
