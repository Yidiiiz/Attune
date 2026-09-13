// Owns: the words. Every instruction this app sends a model lives here as a plain string, so the
// behaviour of a mode can be read and changed in one place instead of being spread through the
// code that assembles a request (PROJECT.md §13.1, §6.2, §9.4).
//
// Failure behavior: nothing here can fail — these are constants. The risk they carry is different
// in kind: a prompt that drifts from the spec changes what the app does without changing any code
// path, so each block below cites the section it implements and says nothing the spec does not.
//
// §6.4's heuristic is the one block not written here: it is `memory.ts`'s, word for word, because
// that file is where what happens to a proposal is decided and the two must not drift apart.

import { HEURISTIC } from "./memory.ts";

/** §6.2 step 2, verbatim in intent: how the model should use the two knowledge-reading tools. */
const RETRIEVAL = `Reading the knowledge base:
- Read a map before you read the notes it links to.
- Read only what the question needs. Every read costs the user time.
- Do not read anything under sessions/ unless the user refers to a past conversation.
- Paths are relative to the data directory, exactly as they appear in the index and the maps.`;

/** §12: the assistant does not decide by itself where a new file belongs. */
const SCOPE = `If you are about to propose a file and it is not obvious whether it should ship with
the project or stay personal to this user, ask "Should this ship with the project or stay yours?"
before writing anything.`;

const TASKS = `You turn what the user typed into task drafts.

${RETRIEVAL}

Fill in fields from what you know about the user when the prompt does not say — a due date implied
by "Friday", a category that matches how they file similar work, an estimate from how long they say
these take. List every field you filled in this way in "inferred", naming the field. Fields the
prompt stated outright do not belong in "inferred".

Do not invent a due date, a priority, or an estimate to look thorough. An empty field is a fact
about the prompt; a guessed one is a claim the user has to check.`;

/** §9.4: what the three answers mean and when each is the honest one. */
export const EXTRACTION = `${TASKS}

Answer with exactly one of three kinds:

- "tasks" — the default. The user described work to do. Return one item per task.
- "collection" — the content is plainly list or reference material rather than work: films to
  watch, books to read, places to go, things to buy. Name the collection: an existing path under
  knowledge/collections/ if one fits, or "new:<title>" if none does.
- "question" — a phrase is genuinely ambiguous and the two readings lead to different files.
  "read Dune" is the case: it is either a task or a line in a reading list, and nothing in the
  prompt settles it. Ask the shortest question that would settle it. Do not use this to check
  work you could simply do.

When a follow-up revises a previous draft, return the whole revised list, not only what changed.
Leave every field the follow-up did not mention exactly as it was.`;

/** §6.3 and §6.4: what is worth a knowledge proposal, and the search that comes before a new note. */
const MEMORY = `Proposing knowledge writes:
${HEURISTIC}
- Before proposing a new note, call search_knowledge for its topic. If a note already covers it,
  propose an append to that note instead of a second one.
- A new note names the map that will link to it in mapLink, a path under knowledge/maps/.
- A short append to knowledge/profile/habits.md or preferences.md — three lines or fewer — is
  applied without a card and the user is told; everything else waits for the user to approve it.`;

const ASK = `You answer the user's question about their own tasks, notes and schedule.

${RETRIEVAL}

Prefer answering to proposing. You have tools that collect proposals — tasks, knowledge writes,
collection appends — and they are for things the user would otherwise have to write down again
themselves. A proposal the user did not ask for is work you have handed back to them.

${MEMORY}

${SCOPE}`;

/**
 * §6.3's last rule: a profile file over its cap makes this turn propose distilling it. Per request,
 * so it sits in the Instructions block behind the cache breakpoint, never in the cached prefix
 * (Decision 59): a line that comes and goes with a file's length would invalidate the cache.
 */
const distill = (files: string[]): string =>
  `These profile files are over 150 lines: ${files.join(", ")}. In this turn, propose one ` +
  "knowledge write per file that replaces it with a shorter version, and propose notes for the " +
  "detail that moves out of it. Answer the user's question as well; this is in addition to it.";

/** §4.6 and Decision 18: a session summary, made only when the user asks for one. */
export const DISTILL = `You write a session summary of the conversation you are given, for the user's
knowledge base. It is read later, by the user and by you, to recall what was worked out without
re-reading the whole conversation.

- Lead with what was decided or learned, then what is still open.
- Keep names, numbers, paths and dates exactly as they were said.
- Leave out greetings, false starts, and anything only the moment needed.
- Plain markdown, no frontmatter, no title line: the app adds both. Under 200 words.`;

/** The last user turn of a distill request, after the conversation itself. */
export const DISTILL_REQUEST = "Write the session summary of the conversation above.";

const BUILD = `Build mode runs through the Agent SDK and is not assembled here (§13.4, Phase 9).`;
const SCHEDULE = `Schedule mode proposes times for a day's tasks (§10.1). Not built yet.`;
const THEME = `Theme mode returns a token map for a described theme (§11.3). Not built yet.`;

export type Mode = "ask" | "tasks" | "build" | "schedule" | "theme";

const BY_MODE: Record<Mode, string> = {
  ask: ASK,
  tasks: EXTRACTION,
  build: BUILD,
  schedule: SCHEDULE,
  theme: THEME,
};

/**
 * The mode instructions block §13.1 puts fourth, after the profile and before the view. `overCap`
 * names the profile files past §6.3's cap; only Ask can act on it, since only Ask has the tools.
 */
export function modeInstructions(mode: Mode, overCap: string[] = []): string {
  return mode === "ask" && overCap.length > 0 ? `${BY_MODE[mode]}\n\n${distill(overCap)}` : BY_MODE[mode];
}
