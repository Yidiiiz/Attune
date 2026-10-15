# Attune

A local task, scheduling and knowledge app. Tasks, notes, conversations and settings
are Markdown and JSON files. There is no database or app account.

## Run

Node 24 or newer and Git are required.

```sh
npm install
npm run init
npm run dev
```

For everyday use without first-visit development compilation, run `npm run build`
then `npm run start` instead of `npm run dev`. The shared palette and control rules
are documented in [docs/DESIGN.md](docs/DESIGN.md).

Open http://localhost:3000. Initialization copies `seed/` into `data/` and refuses
to replace an existing nonempty directory. On Windows PowerShell with a restricted
script policy, use `npm.cmd` in place of `npm`.

## Features

- Today ranks tasks and offers a draggable timeline; Calendar has rolling, month and week views.
- Chat branches, keeps attachments and marginal annotations, and connects replies to tasks and notes.
- The knowledge browser supports editing, search, backlinks, collections and a force-directed graph.
- Build offers Plan first → apply → review diff → Commit/Revert, or explicitly enabled Auto, with Undo.
- Settings includes weather, day shape, list behavior, categories, models, protected/custom themes,
  API keys and project sync. History opens from Settings or Ctrl/Cmd+Z outside an editor.

## Assistant and privacy

Chat, task extraction and theme generation default to GPT-6.1 Sol through the
OpenAI Responses API; Claude Opus 5.5 is also available. Set the matching OpenAI
or Anthropic key in Settings; keys are stored only in ignored `.env.local` and
displayed masked. Build uses Claude through the installed Agent SDK and can use
a saved Claude login when no Anthropic API key is set.
Requests send the prompt and relevant context to the provider. Local task and file
features work without provider access.

`data/` is ignored and never committed or pushed by the app. Its transaction log,
small text snapshots and content-addressed blobs support local Undo; personal data
is not version-controlled and has no automatic off-machine backup. Project Build
changes are real Git commits and follow the Settings sync policy.

## Checks and release tooling

```sh
npm test
npm run check:ui
npm run kb:check
npm run publish-check
npm run publish -- --prepare
```

Browser checks require `npx playwright install chromium` once and run against a
throwaway checkout. They are separate from deterministic tests and never invoked
by `publish-check`. The known Stop flake is reported separately and does not gate.

`publish-check` audits the approved license, canonical seed, personal/credential
boundaries, source history and attribution phrases, then installs locked dependencies
from the local npm cache in a fresh clone, initializes it, builds production and checks
an empty task response. A missing cached package fails with an npm diagnostic; populate
the cache using the ordinary install before retrying. It performs no remote write.

`publish -- --prepare` produces a local, inspectable orphan export without changing
the source checkout. Actual remote replacement is separately explicit, requires a
configured `public` remote and passing checks, and uses a force-with-lease. No remote
is created automatically. Private handoffs and personal data are excluded.

Automated checks cover scripted provider behavior. Real provider outcomes and remaining
manual acceptance checks are listed honestly in [docs/CHECKLIST.md](docs/CHECKLIST.md);
the project is not declared fully accepted while those rows remain pending.

## Supervisor startup

The bounded foreground workflow, strict task contracts and review/budget rules are
in [docs/SUPERVISOR.md](docs/SUPERVISOR.md). It includes the one-session startup prompt.
Offline runner checks pass; the live signed-client probe remains unrun pending approval
of repository transmission. Do not interpret that as unattended background execution.

## Layout

`app/` contains routes, `components/` the UI, `lib/store/` filesystem access,
`lib/history/` transactions/Undo/Git, `lib/agent/` provider traffic, and `seed/` the
empty initial state. [PROJECT.md](PROJECT.md) is the specification;
[AGENTS.md](AGENTS.md) records working rules and phase evidence.

## Licence

**Proprietary — see [LICENSE](LICENSE).** The existing notice is preserved. Reuse
requires the copyright holder's written permission as stated in that file.
