// Owns: a `Provider` that answers from a script instead of from a model, and the flag that turns it
// on. It exists so the §15 chat checks — a stream that fails mid-reply, a send rejected before any
// delta, a stop, a retry, three branches each making one commit — can be run **on the surface a
// person actually uses**, in a browser, with no API key and no network. Without it those checks are
// reachable only in the library, against an injected fake, which leaves the whole client half of
// §16.3 unverified.
//
// It is shaped like `ATTUNE_REPO_DIR` (Decision 45): one environment variable, announced loudly and
// once when the module loads, because a setting that silently changes what the app is doing is
// worse than one that is merely wrong. Two differences, both tightening it:
//
//   1. **It is ignored outright when `NODE_ENV` is production**, and the announcement says so. A
//      flag that replaces the model with a script must be structurally incapable of being on in a
//      real session, not merely loud about it.
//   2. The app says so on screen while it is active (`isScripted()` is read by the chat header), so
//      nobody spends ten minutes wondering why the replies are strange.
//
// What it answers is steered by directives in the prompt text, listed in `DIRECTIVES` below, so a
// check asks for the failure it wants to observe rather than waiting for one.
//
// Failure behavior: this is the failure machinery, so the shapes it raises are the point — the same
// `AgentError` codes `anthropic.ts` raises, so §13.5's routing is exercised rather than bypassed.
// An abort mid-stream leaves through the same path a real cancel does.

import { AgentError } from "./registry.ts";
import type { ChatEvent, ChatRequest, ParseRequest, ProviderMessage } from "./registry.ts";

/** The variable, and the one condition under which it is honoured. */
export const SCRIPTED_ENV = "ATTUNE_FAKE_PROVIDER";

const requested = (): boolean => {
  const value = process.env[SCRIPTED_ENV];
  return value !== undefined && value !== "" && value !== "0" && value !== "false";
};

const production = (): boolean => process.env.NODE_ENV === "production";

/** Whether model calls are being answered by this file rather than by a provider. */
export function isScripted(): boolean {
  return requested() && !production();
}

if (requested()) {
  console.error(
    production()
      ? `agent: ${SCRIPTED_ENV} is set and is being IGNORED because NODE_ENV is production; ` +
          "real model calls are being made"
      : `agent: ${SCRIPTED_ENV} is set — every model call is answered by a script in ` +
          "lib/agent/scripted.ts, not by a model. Nothing here reaches a provider.",
  );
}

/**
 * What a prompt can ask this provider to do. Written in the prompt because that is the one thing a
 * browser check can control end to end: it types into the composer and the directive travels the
 * whole real path — route, turn, finalize — without a test hook anywhere in between.
 */
const DIRECTIVES = {
  /** Refuse before any delta, as a rejected key does: the message files must not survive. */
  auth: "[[auth]]",
  /** Refuse before any delta, as an unreachable provider does. */
  fail: "[[fail]]",
  /** Emit some text and then fail, which is the case that must leave a `failed` message behind. */
  failLate: "[[fail-late]]",
  /**
   * Fail mid-answer the first time this exact prompt is seen, and answer normally after. It is the
   * only stateful directive, and it exists because Retry has to be checkable: a regenerate replays
   * the same prompt, so a directive that always fails can only ever prove that Retry fails too.
   */
  failOnce: "[[fail-once]]",
  /** Stream slowly, so a stop has something to interrupt. */
  slow: "[[slow]]",
  /** Ask for one read-only tool call before answering, to drive a tool round. */
  tool: "[[tool]]",
} as const;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Prompts `[[fail-once]]` has already failed for, so the retry after one succeeds. */
const failedOnce = new Set<string>();

/** The text of the last user turn, which is where a directive would be. */
function lastUserText(messages: ProviderMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.role !== "user") continue;
    const text = message.content
      .map((part) => (part.type === "text" ? part.text : ""))
      .join(" ")
      .trim();
    if (text.length > 0) return text;
  }
  return "";
}

/** A reply worth reading, so a check can assert on something other than a fixed string. */
function replyTo(prompt: string): string {
  const asked = prompt.replace(/\[\[[a-z-]+\]\]/g, "").trim();
  return [
    `You asked: ${asked || "(nothing)"}`,
    "",
    "This reply came from the **scripted provider**, not from a model, because " +
      "`ATTUNE_FAKE_PROVIDER` is set. Real answers need an API key in Settings.",
  ].join("\n");
}

/** Split into small pieces, so a stream looks like a stream rather than one delta. */
const chunks = (text: string): string[] => text.match(/[\s\S]{1,24}/g) ?? [];

export async function* streamChat(req: ChatRequest, signal: AbortSignal): AsyncIterable<ChatEvent> {
  const prompt = lastUserText(req.messages);
  const has = (directive: string): boolean => prompt.includes(directive);

  if (has(DIRECTIVES.auth)) {
    throw new AgentError("auth", "The API key was rejected. Check it in Settings → API keys.");
  }
  if (has(DIRECTIVES.fail)) {
    throw new AgentError("provider", "the scripted provider was asked to fail before answering");
  }

  // A tool round, once: the second pass through this function has the tool result in `messages`,
  // so asking again would loop until the turn ran out of rounds.
  const answeredTool = req.messages.some((message) =>
    message.content.some((part) => part.type === "tool_result"),
  );
  if (has(DIRECTIVES.tool) && !answeredTool && req.tools.some((tool) => tool.name === "list_tasks")) {
    yield { type: "text", text: "Let me look at your tasks first.\n\n" };
    yield { type: "tool_use", id: "toolu_scripted_1", name: "list_tasks", input: { from: "", to: "" } };
    yield { type: "stop", stopReason: "tool_use" };
    return;
  }

  const slow = has(DIRECTIVES.slow);
  const text = slow ? `${replyTo(prompt)}\n\n${"Still going. ".repeat(40)}` : replyTo(prompt);
  const pieces = chunks(text);

  for (let i = 0; i < pieces.length; i += 1) {
    // The abort is checked between pieces, exactly where a real stream would notice it.
    if (signal.aborted) throw new AgentError("aborted", "cancelled");
    await sleep(slow ? 60 : 8);
    if (has(DIRECTIVES.failLate) && i === 2) {
      throw new AgentError("provider", "the scripted provider was asked to fail mid-answer");
    }
    if (has(DIRECTIVES.failOnce) && i === 2 && !failedOnce.has(prompt)) {
      failedOnce.add(prompt);
      throw new AgentError("provider", "the scripted provider was asked to fail once, and did");
    }
    yield { type: "text", text: pieces[i] };
  }

  yield { type: "stop", stopReason: "end_turn" };
}

/**
 * Structured output. The scripted provider cannot invent a shape it has never seen, so it refuses
 * rather than returning something a schema would reject in a way that reads like a model error.
 * Nothing in Phase 6a asks it for one; `runExtract` is the composer's path and has its own fake.
 */
export function parse<T>(_req: ParseRequest<T>): Promise<T> {
  return Promise.reject(
    new AgentError("unsupported", `${SCRIPTED_ENV} is set, and the scripted provider does not answer structured requests`),
  );
}
