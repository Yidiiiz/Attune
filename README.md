# Attune

A personal to-do and scheduling app that runs on your own machine. Everything it knows — tasks,
notes, conversations, settings — is plain Markdown and JSON in a git repository you own. There is no
database, no account, and no server but the one on your laptop.

An assistant is part of the interface rather than a panel bolted to the side: it creates and edits
tasks, answers questions about your own files, and keeps a small knowledge base for you. Every change
it makes is a commit you can read and undo.

## What it does

- **Today** — a ranked list of what is due, scheduled, or worth doing, with a timeline you can drag.
- **Calendar** — rolling, month and week views; drag a task to schedule it.
- **Chat** — conversations that branch, with annotations in the margin and full history on disk.
- **Knowledge** — notes, maps, and collections, with backlinks and a link checker.
- **Browser** — read and edit any file under `data/` in the app, with undo for every write.
- **Undo** — every write goes through one transaction log. `npm run history -- undo <batch>` reverses
  any of them, and the app restores the previous bytes exactly.

## Run it

Node 24 or newer, and git.

```
npm install
npm run init     # copies seed/ into data/ — refuses if data/ already has anything in it
npm run dev      # http://localhost:3000
```

`npm run init` creates your `data/` directory from the shipped seed. It is yours: nothing in it is
tracked by this repository, and nothing leaves your machine.

**Bring your own key.** The assistant talks to the Anthropic API and there is no key in this
repository. Open Settings and paste one, or put it in `.env.local` yourself. Without a key everything
except the assistant works, and a missing key gives you a plain error rather than a broken page.

## What is built, and what is not

Phases 1 through 8 are done. **Phases 8b, 9, 10 and 11 have not been started**, so this is a working
app with four known holes in it:

| Working | Not built yet |
|---|---|
| Today, Calendar, the task composer | **Graph view** — the Knowledge rail has no Graph icon yet (8b) |
| Chat with branching, annotations, attachments | **Build mode** — the assistant cannot edit the app's own code (9) |
| Knowledge base, collections, link checking | **Settings** — only the API-key section is live; the rest is a stub (10) |
| The file browser, editing and saving, search | **Publishing** — `publish-check` and `publish` do not exist (11) |

Do not read the phase numbers as a promise. They are the order the work happened in, and the table
above is the current state, not a roadmap.

## Where things are

```
app/          routes and pages
components/   the UI, one folder per surface
lib/store/    the only code that touches the filesystem
lib/history/  the transaction log, undo, and git
lib/agent/    the only code that talks to a model provider
seed/         what `npm run init` copies into data/
PROJECT.md    the full specification — every decision, with the reasoning
AGENTS.md     how the work is done, and the record of every phase
```

`PROJECT.md` is long and it is the real documentation. If you want to know why something is the way
it is, the answer is in there under a numbered Decision.

## Checks

```
npm test         # unit and route tests
npm run check:ui # Playwright, needs `npx playwright install chromium` first
npm run kb:check # orphaned notes, broken links, size caps
```

`npm test` is deterministic: the same count every run. If it is not, that is a bug worth reporting.

## Licence

**Proprietary — see [LICENSE](LICENSE), and that is deliberate rather than an oversight:** the
source is here to be read, and any reuse needs written permission first. GitHub shows a repository
with no open licence as unlicensed, which is this sentence said less clearly.
