// Owns: the seven tools a turn may call (PROJECT.md §13.3) — what each one is called, what shape it
// takes, and what running it does. Four read; three collect a proposal and write nothing at all.
// The split is the point: nothing a model can invoke here reaches `runBatch`, so a turn cannot
// change a file. Every write in this app still starts with a person pressing a button (§9.5).
//
// Failure behavior: a tool that fails returns its message as the tool's *result* rather than
// throwing, because a thrown error ends the turn and a returned one lets the model try a different
// path — a mistyped note path should cost a round, not the answer. The exception is a path outside
// `data/`, which `resolveData` refuses; that also comes back as a result, so the refusal is visible
// in the transcript instead of being silently retried.

import { z } from "zod";
import { listTree, readText } from "../store/files.ts";
import { listTasks } from "../store/tasks.ts";
import { TaskDraftSchema } from "../history/actions.ts";
import { existingNotes, filterWrites } from "./memory.ts";
import type { ProposedWrite } from "./memory.ts";
import { tasksInScope, tasksTable } from "./context.ts";
import type { ToolDefinition } from "./registry.ts";
import type { TreeNode } from "../store/files.ts";

/**
 * §9.4's `TaskDraft`, as the model must send it: every field present, absent ones sent as null.
 * Derived from the route's schema with `.required()` so the field list exists once (see
 * `TaskDraftSchema`). `inferred` is the extra §9.4 asks for — the fields filled from context rather
 * than from the prompt, which is what the preview panel underlines.
 */
export const ModelTaskDraft = TaskDraftSchema.required().extend({
  inferred: z.array(z.string()),
});

export type ModelTaskDraft = z.infer<typeof ModelTaskDraft>;

export const KnowledgeWriteSchema = z.object({
  path: z.string(),
  op: z.enum(["create", "append", "replace"]),
  content: z.string(),
  reason: z.string(),
  mapLink: z.string().nullable(),
});

export type KnowledgeWrite = z.infer<typeof KnowledgeWriteSchema>;

export type Proposal =
  | { kind: "tasks"; items: ModelTaskDraft[] }
  /** After `filterWrites`: a duplicate note arrives as the append it became, saying why (§6.3). */
  | { kind: "knowledge"; writes: ProposedWrite[] }
  | { kind: "collection"; collection: string; items: string[] };

const ReadKnowledge = z.object({ path: z.string() });
const SearchKnowledge = z.object({ query: z.string() });
const ReadFile = z.object({ path: z.string() });
const ListTasks = z.object({ from: z.string(), to: z.string() });
const ProposeTasks = z.object({ items: z.array(ModelTaskDraft) });
const ProposeKnowledge = z.object({ writes: z.array(KnowledgeWriteSchema) });
const ProposeCollection = z.object({ collection: z.string(), items: z.array(z.string()) });

/**
 * `z.toJSONSchema` already emits `additionalProperties: false` and lists every non-optional key in
 * `required`, which is what `strict: true` wants (§13.3). Only the `$schema` line is dropped: it
 * describes the document rather than the tool's input.
 */
function schemaFor(shape: z.ZodType): Record<string, unknown> {
  const { $schema, ...rest } = z.toJSONSchema(shape) as Record<string, unknown>;
  void $schema;
  return rest;
}

export const TOOLS: ToolDefinition[] = [
  {
    name: "read_knowledge",
    description:
      "Read one file from the knowledge base. `path` is relative to the data directory and starts " +
      "with knowledge/ — the paths in the index and the maps are already in this form.",
    schema: schemaFor(ReadKnowledge),
  },
  {
    name: "search_knowledge",
    description:
      "Search the knowledge base for a word or phrase. Returns the matching files with the lines " +
      "that matched. Use this before proposing a new note, to find the one that already exists.",
    schema: schemaFor(SearchKnowledge),
  },
  {
    name: "read_file",
    description:
      "Read any file under the data directory — a task, an uploaded document, a note. `path` is " +
      "relative to it, as the paths in task `links` and in the file index already are.",
    schema: schemaFor(ReadFile),
  },
  {
    name: "list_tasks",
    description:
      "List the user's open tasks whose due or scheduled date falls between `from` and `to`, " +
      "inclusive. Both are YYYY-MM-DD.",
    schema: schemaFor(ListTasks),
  },
  {
    name: "propose_tasks",
    description:
      "Propose tasks for the user to review. This writes nothing: the user sees each one in a " +
      "preview panel, edits what they want, and chooses which to keep.",
    schema: schemaFor(ProposeTasks),
  },
  {
    name: "propose_knowledge_write",
    description:
      "Propose a note to create, append to, or replace, so something learned here does not have " +
      "to be worked out again. A new note must name the map that will link to it. Writes nothing.",
    schema: schemaFor(ProposeKnowledge),
  },
  {
    name: "propose_collection_append",
    description:
      "Propose adding items to a collection — a reading list, a watchlist. `collection` is a path " +
      'under knowledge/collections/, or "new:<title>" when none of them fits. Writes nothing.',
    schema: schemaFor(ProposeCollection),
  },
];

/** §13.3: Tasks and Ask both offer all seven. Build mode uses the Agent SDK and none of these. */
export function toolsFor(mode: "ask" | "tasks" | "build" | "schedule" | "theme"): ToolDefinition[] {
  return mode === "ask" || mode === "tasks" ? TOOLS : [];
}

export interface ToolOutcome {
  /** What goes back to the model as the tool's result. */
  result: string;
  isError?: boolean;
  /** Set by the three collectors, for the caller to surface in the preview panel. */
  proposal?: Proposal;
}

const KNOWLEDGE_DIR = "knowledge/";
const SEARCH_LIMIT = 8;
const SNIPPET_LINES = 3;

/** Every markdown file under `knowledge/`, flattened. */
async function knowledgeFiles(): Promise<string[]> {
  const found: string[] = [];
  const walk = (nodes: TreeNode[]): void => {
    for (const node of nodes) {
      if (node.type === "dir") walk(node.children ?? []);
      else if (node.path.endsWith(".md")) found.push(node.path);
    }
  };
  walk(await listTree("knowledge"));
  return found.sort();
}

async function search(query: string): Promise<string> {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return "Give a word or phrase to search for.";

  const hits: Array<{ path: string; score: number; lines: string[] }> = [];
  for (const path of await knowledgeFiles()) {
    let text: string;
    try {
      text = await readText(path);
    } catch {
      continue;
    }
    const matched = text.split("\n").filter((line) => line.toLowerCase().includes(needle));
    const inPath = path.toLowerCase().includes(needle) ? 1 : 0;
    if (matched.length === 0 && inPath === 0) continue;
    hits.push({ path, score: matched.length + inPath * 5, lines: matched.slice(0, SNIPPET_LINES) });
  }

  if (hits.length === 0) return `Nothing in the knowledge base matches "${query}".`;
  hits.sort((a, b) => b.score - a.score);
  return hits
    .slice(0, SEARCH_LIMIT)
    .map((hit) => (hit.lines.length === 0 ? hit.path : `${hit.path}\n  ${hit.lines.join("\n  ")}`))
    .join("\n\n");
}

async function run(name: string, input: unknown): Promise<ToolOutcome> {
  switch (name) {
    case "read_knowledge": {
      const { path } = ReadKnowledge.parse(input);
      if (!path.startsWith(KNOWLEDGE_DIR)) {
        return { result: `${path} is not in the knowledge base; use read_file for it.`, isError: true };
      }
      return { result: await readText(path) };
    }
    case "search_knowledge":
      return { result: await search(SearchKnowledge.parse(input).query) };
    case "read_file":
      return { result: await readText(ReadFile.parse(input).path) };
    case "list_tasks": {
      const { from, to } = ListTasks.parse(input);
      return { result: tasksTable(tasksInScope(await listTasks(), from, to)) };
    }
    // The three collectors answer "recorded" and nothing else (§13.2). A summary here would be the
    // model reading its own proposal back as though something had happened to it.
    case "propose_tasks":
      return { result: "recorded", proposal: { kind: "tasks", ...ProposeTasks.parse(input) } };
    case "propose_knowledge_write": {
      // Filtered here rather than on the card, so every surface that shows a knowledge proposal shows
      // the write that will actually be applied — never the one the model sent, if they differ.
      const { writes } = ProposeKnowledge.parse(input);
      return { result: "recorded", proposal: { kind: "knowledge", writes: filterWrites(writes, await existingNotes()) } };
    }
    case "propose_collection_append":
      return { result: "recorded", proposal: { kind: "collection", ...ProposeCollection.parse(input) } };
    default:
      return { result: `There is no tool called ${name}.`, isError: true };
  }
}

/** Run one tool call. Never throws: a failure is a result the model can read and act on. */
export async function executeTool(name: string, input: unknown): Promise<ToolOutcome> {
  try {
    return await run(name, input);
  } catch (err) {
    return { result: (err as Error).message, isError: true };
  }
}
