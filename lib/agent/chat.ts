// Owns: the two shapes a Tasks-mode request can take. `runExtract` is one structured answer — the
// §9.4 routing the composer's preview panel is built on. `streamModelTurn` is the model half of
// PROJECT.md §13.2's loop: stream, run the tools the model asks for, stream again, up to eight
// rounds.
//
// Scope, deliberately: the loop runs over a message array it is *given*, and reads and writes no
// conversation. §13.2's `runChatTurn` — the one that takes conversation and message ids and writes
// deltas to a message file as it goes — is `lib/agent/turn.ts`, and it drives this function. The
// split is why this one was renamed in Phase 6a: §13.2's name belongs to the function §13.2
// describes, and two functions cannot both have it.
//
// The provider and the tool executor are both parameters with defaults. That is not a general
// seam-for-its-own-sake: it is what lets the routing above be tested against a scripted provider
// with no API key and no network, which is the only way this file is covered at all before a key
// exists.
//
// Failure behavior: a provider failure ends the turn with an `error` event carrying the code, so
// the caller can apply §13.5 — authentication and configuration toast, everything else goes inline.
// A *tool* failure does not end anything: it goes back to the model as that tool's result. Running
// out of tool rounds ends the turn with `stopReason: "max_tool_rounds"` rather than silently
// looping, because a turn that never finishes is worse than one that says it gave up.

import { z } from "zod";
import { AgentError, effortFor, providerFor } from "./registry.ts";
import { executeTool, ModelTaskDraft, toolsFor } from "./tools.ts";
import type { ContentPart, Effort, Provider, ProviderMessage } from "./registry.ts";
import type { ContextBlock } from "./context.ts";
import type { Proposal, ToolOutcome } from "./tools.ts";

/** §13.2. `max_tokens` for a turn; the same number for both shapes. */
const MAX_TOKENS = 64000;

/** §13.2: "Maximum 8 tool rounds per turn." */
const MAX_TOOL_ROUNDS = 8;

export type TurnEvent =
  | { type: "delta"; text: string }
  | { type: "tool"; name: string; input: unknown }
  | { type: "proposal"; proposal: Proposal }
  | { type: "done"; stopReason: string }
  // §13.2 spells this `{ type: "error"; message: string }`. The code is added, not substituted:
  // §13.5 decides between a toast and an inline message from *what kind* of error it was, and a
  // caller that has only the message has to match on prose to find out.
  | { type: "error"; message: string; code: string };

export interface TurnInput {
  mode: "ask" | "tasks";
  model: string;
  effort?: Effort;
  /** Exactly what `assembleContext` returned. */
  system: ContextBlock[];
  /** The conversation so far, in memory. Phase 6 supplies this from the message files. */
  messages: ProviderMessage[];
  signal: AbortSignal;
  provider?: Provider;
  execute?: (name: string, input: unknown) => Promise<ToolOutcome>;
}

export async function* streamModelTurn(input: TurnInput): AsyncIterable<TurnEvent> {
  const provider = input.provider ?? providerFor(input.model);
  const execute = input.execute ?? executeTool;
  const tools = toolsFor(input.mode);
  const messages = [...input.messages];

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      const said: ContentPart[] = [];
      const calls: Array<{ id: string; name: string; input: unknown }> = [];
      let stopReason = "end_turn";

      for await (const event of provider.streamChat(
        {
          model: input.model,
          effort: effortFor(input.model, input.effort),
          system: input.system,
          messages,
          tools,
          maxTokens: MAX_TOKENS,
        },
        input.signal,
      )) {
        if (event.type === "text") {
          said.push({ type: "text", text: event.text });
          yield { type: "delta", text: event.text };
        } else if (event.type === "tool_use") {
          calls.push({ id: event.id, name: event.name, input: event.input });
          said.push({ type: "tool_use", id: event.id, name: event.name, input: event.input });
        } else {
          stopReason = event.stopReason;
        }
      }

      if (stopReason !== "tool_use" || calls.length === 0) {
        yield { type: "done", stopReason };
        return;
      }

      // One assistant turn holding everything it said and asked for, then one user turn holding
      // every result — §13.2's "append results as one user message".
      messages.push({ role: "assistant", content: said });
      const results: ContentPart[] = [];
      for (const call of calls) {
        yield { type: "tool", name: call.name, input: call.input };
        const outcome = await execute(call.name, call.input);
        if (outcome.proposal !== undefined) yield { type: "proposal", proposal: outcome.proposal };
        results.push({
          type: "tool_result",
          toolUseId: call.id,
          content: outcome.result,
          ...(outcome.isError === true ? { isError: true } : {}),
        });
      }
      messages.push({ role: "user", content: results });
    }

    yield { type: "done", stopReason: "max_tool_rounds" };
  } catch (err) {
    const error = err instanceof AgentError ? err : new AgentError("provider", (err as Error).message);
    yield { type: "error", message: error.message, code: error.code };
  }
}

/**
 * §9.4's three answers, as one flat object.
 *
 * The union is what callers get; the wire shape is flat because a discriminated union becomes
 * `anyOf` in JSON Schema, and a structured-output format that must be strict is on firmer ground
 * with one object whose every key is present. Narrowing back to the union happens below, once, so
 * no caller ever sees this shape.
 */
const ExtractSchema = z.object({
  kind: z.enum(["tasks", "collection", "question"]),
  tasks: z.array(ModelTaskDraft),
  collection: z.string().nullable(),
  collectionItems: z.array(z.string()),
  question: z.string().nullable(),
  note: z.string().nullable(),
});

export type ExtractResult =
  | { kind: "tasks"; items: ModelTaskDraft[]; note?: string }
  | { kind: "collection"; collection: string; items: string[]; note?: string }
  | { kind: "question"; text: string };

export interface ExtractInput {
  prompt: string;
  /** §9.5 steps 2 and 4: the answer to a question, or a revision of the current preview. */
  followUp?: string;
  /** The cards currently on screen, so a revision edits them rather than starting again. */
  draft?: ModelTaskDraft[];
  system: ContextBlock[];
  model: string;
  effort?: Effort;
  signal?: AbortSignal;
  provider?: Provider;
}

/** The flat answer, narrowed to §9.4's union. A `kind` its own fields do not support is refused. */
function narrow(answer: z.infer<typeof ExtractSchema>): ExtractResult {
  const note = answer.note === null || answer.note.trim().length === 0 ? undefined : answer.note;

  if (answer.kind === "question") {
    if (answer.question === null || answer.question.trim().length === 0) {
      throw new AgentError("provider", "the model asked a question and did not say what it was");
    }
    return { kind: "question", text: answer.question };
  }

  if (answer.kind === "collection") {
    if (answer.collection === null || answer.collection.trim().length === 0) {
      throw new AgentError("provider", "the model proposed a collection and did not name it");
    }
    return {
      kind: "collection",
      collection: answer.collection,
      items: answer.collectionItems,
      ...(note === undefined ? {} : { note }),
    };
  }

  return { kind: "tasks", items: answer.tasks, ...(note === undefined ? {} : { note }) };
}

export async function runExtract(input: ExtractInput): Promise<ExtractResult> {
  const provider = input.provider ?? providerFor(input.model);

  const messages: ProviderMessage[] = [
    { role: "user", content: [{ type: "text", text: input.prompt }] },
  ];
  if (input.draft !== undefined) {
    // The current cards, replayed as what was proposed last time, so "make them all Friday" has
    // something to edit. The inline edits the user made are in here too — they were sent back.
    messages.push({
      role: "assistant",
      content: [{ type: "text", text: JSON.stringify({ kind: "tasks", tasks: input.draft }) }],
    });
  }
  if (input.followUp !== undefined) {
    messages.push({ role: "user", content: [{ type: "text", text: input.followUp }] });
  }

  const answer = await provider.parse({
    model: input.model,
    effort: effortFor(input.model, input.effort),
    system: input.system,
    messages,
    schema: ExtractSchema,
    maxTokens: MAX_TOKENS,
    ...(input.signal === undefined ? {} : { signal: input.signal }),
  });

  return narrow(ExtractSchema.parse(answer));
}
