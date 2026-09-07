// The routing, against a provider that is a script rather than a service. Written beside `chat.ts`
// rather than after it: the injectable provider exists for this test, so if the shape did not admit
// a fake, that is a fact about the design worth finding while the design is still being written.
//
// Nothing here touches the network, the filesystem, or an API key. What it checks is everything
// this app decides for itself — which of §9.4's three answers came back, what the loop does with a
// tool call, and how a failure leaves the turn.

import { describe, expect, it } from "vitest";
import { runChatTurn, runExtract } from "./chat.ts";
import type { ExtractResult, TurnEvent } from "./chat.ts";
import type { ChatEvent, ChatRequest, ParseRequest, Provider } from "./registry.ts";
import type { ContextBlock } from "./context.ts";
import type { ModelTaskDraft, ToolOutcome } from "./tools.ts";

const SYSTEM: ContextBlock[] = [{ label: "Setup", source: "settings/settings.json", text: "x", tokens: 1 }];

/** A full draft, since the model-facing shape requires every field (nulls for the absent ones). */
function draft(title: string, over: Partial<ModelTaskDraft> = {}): ModelTaskDraft {
  return {
    title,
    body: "",
    status: "todo",
    priority: 3,
    estimateMin: null,
    due: null,
    scheduled: null,
    category: null,
    context: null,
    tags: [],
    links: [],
    repeat: null,
    repeatUntil: null,
    collection: null,
    inferred: [],
    ...over,
  };
}

/** What a flat extract answer looks like on the wire, with the absent halves nulled out. */
function answer(over: Record<string, unknown>): Record<string, unknown> {
  return { kind: "tasks", tasks: [], collection: null, collectionItems: [], question: null, note: null, ...over };
}

interface Fake extends Provider {
  /** Every request the code under test made, in order. */
  chats: ChatRequest[];
  parses: Array<ParseRequest<unknown>>;
}

/** A provider that replays `script` — one array of events per round — and records what it was sent. */
function scripted(script: { rounds?: ChatEvent[][]; parsed?: unknown; fail?: Error }): Fake {
  const rounds = script.rounds ?? [];
  const fake: Fake = {
    chats: [],
    parses: [],
    async *streamChat(req: ChatRequest): AsyncIterable<ChatEvent> {
      fake.chats.push({ ...req, messages: structuredClone(req.messages) });
      if (script.fail) throw script.fail;
      for (const event of rounds[fake.chats.length - 1] ?? [{ type: "stop", stopReason: "end_turn" }]) {
        yield event;
      }
    },
    async parse<T>(req: ParseRequest<T>): Promise<T> {
      fake.parses.push(req as ParseRequest<unknown>);
      if (script.fail) throw script.fail;
      return script.parsed as T;
    },
  };
  return fake;
}

const collect = async (events: AsyncIterable<TurnEvent>): Promise<TurnEvent[]> => {
  const out: TurnEvent[] = [];
  for await (const event of events) out.push(event);
  return out;
};

const extract = (parsed: unknown, over: Record<string, unknown> = {}): Promise<ExtractResult> =>
  runExtract({ prompt: "p", system: SYSTEM, model: "claude-opus-5", provider: scripted({ parsed }), ...over });

describe("runExtract routes the three answers of §9.4", () => {
  it("returns tasks, which is the default", async () => {
    const result = await extract(answer({ kind: "tasks", tasks: [draft("Pset 4"), draft("Laundry")] }));
    expect(result.kind).toBe("tasks");
    if (result.kind !== "tasks") throw new Error("unreachable");
    expect(result.items.map((item) => item.title)).toEqual(["Pset 4", "Laundry"]);
    expect(result.note).toBeUndefined();
  });

  it("returns a collection with its target and items", async () => {
    const result = await extract(
      answer({
        kind: "collection",
        collection: "new:Watchlist",
        collectionItems: ["Arrival", "Dune", "Sicario"],
        note: "these looked like a list rather than work",
      }),
    );
    expect(result).toEqual({
      kind: "collection",
      collection: "new:Watchlist",
      items: ["Arrival", "Dune", "Sicario"],
      note: "these looked like a list rather than work",
    });
  });

  it("returns a question rather than guessing", async () => {
    const result = await extract(
      answer({ kind: "question", question: "Is 'read Dune' something to do, or one for a reading list?" }),
    );
    expect(result).toEqual({
      kind: "question",
      text: "Is 'read Dune' something to do, or one for a reading list?",
    });
  });

  it("refuses an answer whose kind its own fields do not support", async () => {
    await expect(extract(answer({ kind: "question", question: null }))).rejects.toThrow(/did not say what it was/);
    await expect(extract(answer({ kind: "collection", collection: "  " }))).rejects.toThrow(/did not name it/);
  });

  it("drops an empty note rather than passing a blank one through", async () => {
    const result = await extract(answer({ kind: "tasks", tasks: [draft("A")], note: "   " }));
    if (result.kind !== "tasks") throw new Error("unreachable");
    expect(result.note).toBeUndefined();
  });

  it("replays the draft between the prompt and the follow-up (§9.5 step 4)", async () => {
    const provider = scripted({ parsed: answer({ tasks: [draft("Pset 4", { due: "2026-09-11" })] }) });
    await runExtract({
      prompt: "pset 4 and laundry",
      followUp: "make them both Friday",
      draft: [draft("Pset 4")],
      system: SYSTEM,
      model: "claude-opus-5",
      provider,
    });

    const sent = provider.parses[0];
    expect(sent.messages.map((message) => message.role)).toEqual(["user", "assistant", "user"]);
    expect(sent.messages[0].content).toEqual([{ type: "text", text: "pset 4 and laundry" }]);
    expect(sent.messages[2].content).toEqual([{ type: "text", text: "make them both Friday" }]);
    expect(sent.system).toBe(SYSTEM);
  });

  it("sends effort only for a model that takes one (§11.4)", async () => {
    const withEffort = scripted({ parsed: answer({}) });
    await runExtract({ prompt: "p", system: SYSTEM, model: "claude-opus-5", effort: "medium", provider: withEffort });
    expect(withEffort.parses[0].effort).toBe("medium");

    const without = scripted({ parsed: answer({}) });
    await runExtract({ prompt: "p", system: SYSTEM, model: "claude-haiku-4-5", effort: "medium", provider: without });
    expect(without.parses[0].effort).toBeNull();
  });
});

const turn = (provider: Provider, execute?: (name: string, input: unknown) => Promise<ToolOutcome>) =>
  runChatTurn({
    mode: "tasks",
    model: "claude-opus-5",
    system: SYSTEM,
    messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
    signal: new AbortController().signal,
    provider,
    ...(execute === undefined ? {} : { execute }),
  });

describe("runChatTurn drives the §13.2 loop", () => {
  it("streams text and ends on the stop reason the provider gave", async () => {
    const events = await collect(
      turn(
        scripted({
          rounds: [[{ type: "text", text: "Two " }, { type: "text", text: "tasks." }, { type: "stop", stopReason: "end_turn" }]],
        }),
      ),
    );
    expect(events).toEqual([
      { type: "delta", text: "Two " },
      { type: "delta", text: "tasks." },
      { type: "done", stopReason: "end_turn" },
    ]);
  });

  it("runs a tool, forwards its proposal, and feeds the result back as one user message", async () => {
    const provider = scripted({
      rounds: [
        [
          { type: "tool_use", id: "tu_1", name: "propose_tasks", input: { items: [draft("Pset 4")] } },
          { type: "stop", stopReason: "tool_use" },
        ],
        [{ type: "text", text: "Proposed one." }, { type: "stop", stopReason: "end_turn" }],
      ],
    });

    const events = await collect(
      turn(provider, async () => ({ result: "recorded", proposal: { kind: "tasks", items: [draft("Pset 4")] } })),
    );

    expect(events.map((event) => event.type)).toEqual(["tool", "proposal", "delta", "done"]);

    // The second request carries the first round's tool_use and its result, in that order.
    const second = provider.chats[1];
    expect(second.messages.map((message) => message.role)).toEqual(["user", "assistant", "user"]);
    expect(second.messages[1].content[0]).toMatchObject({ type: "tool_use", id: "tu_1", name: "propose_tasks" });
    expect(second.messages[2].content).toEqual([{ type: "tool_result", toolUseId: "tu_1", content: "recorded" }]);
  });

  it("marks a failed tool result as an error and keeps going", async () => {
    const provider = scripted({
      rounds: [
        [{ type: "tool_use", id: "tu_1", name: "read_file", input: { path: "nope.md" } }, { type: "stop", stopReason: "tool_use" }],
        [{ type: "stop", stopReason: "end_turn" }],
      ],
    });
    await collect(turn(provider, async () => ({ result: "no such file", isError: true })));
    expect(provider.chats[1].messages[2].content).toEqual([
      { type: "tool_result", toolUseId: "tu_1", content: "no such file", isError: true },
    ]);
  });

  it("gives up after eight tool rounds rather than looping (§13.2)", async () => {
    const rounds = Array.from({ length: 9 }, () => [
      { type: "tool_use", id: "tu", name: "list_tasks", input: {} },
      { type: "stop", stopReason: "tool_use" },
    ]) as ChatEvent[][];
    const provider = scripted({ rounds });

    const events = await collect(turn(provider, async () => ({ result: "none" })));
    expect(provider.chats).toHaveLength(8);
    expect(events[events.length - 1]).toEqual({ type: "done", stopReason: "max_tool_rounds" });
  });

  it("ends with an error carrying the code §13.5 routes on", async () => {
    const { AgentError } = await import("./registry.ts");
    const events = await collect(turn(scripted({ fail: new AgentError("auth", "No API key set.") })));
    expect(events).toEqual([{ type: "error", message: "No API key set.", code: "auth" }]);
  });

  it("reports an unexpected throw as a provider error rather than escaping the turn", async () => {
    const events = await collect(turn(scripted({ fail: new Error("socket hang up") })));
    expect(events).toEqual([{ type: "error", message: "socket hang up", code: "provider" }]);
  });
});
