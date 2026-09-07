// Owns: which models exist, what each of them can do, and the one interface a provider implements
// (PROJECT.md §11.4). Adding a provider is one file implementing `Provider`, one entry in
// `PROVIDERS`, entries in `MODELS`, and a key name in `lib/store/env.ts`'s known list — and this
// file is where all four are visible at once.
//
// It also owns `AgentError`, because the error codes are part of the provider contract rather than
// of any one provider: a caller decides between a toast and an inline message from the code (§13.5,
// "where the remedy is"), and every provider has to raise the same three.
//
// Failure behavior: nothing here does I/O, so nothing here fails on its own. `providerFor` throws
// `AgentError("unsupported")` on a model id that is not in the table rather than defaulting to one,
// because silently answering with a different model than the settings asked for is worse than not
// answering: the reply would be attributed to a model that never saw the prompt.

import * as anthropic from "./anthropic.ts";
import * as scripted from "./scripted.ts";
import type { ContextBlock } from "./context.ts";
import type { z } from "zod";

/** §11.4. The same five values `settings.models.*.effort` allows. */
export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export interface ModelEntry {
  id: string;
  label: string;
  provider: "anthropic";
  images: boolean;
  pdf: boolean;
  /** Whether `output_config.effort` may be sent. Sent only when this is true (§11.4). */
  effort: boolean;
}

export const MODELS: ModelEntry[] = [
  { id: "claude-opus-5", label: "Claude Opus 5", provider: "anthropic", images: true, pdf: true, effort: true },
  { id: "claude-sonnet-5", label: "Claude Sonnet 5", provider: "anthropic", images: true, pdf: true, effort: true },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5", provider: "anthropic", images: true, pdf: true, effort: false },
];

export function modelEntry(id: string): ModelEntry | null {
  return MODELS.find((entry) => entry.id === id) ?? null;
}

/**
 * What went wrong, in the shapes a caller has to tell apart (§13.5). `auth` covers a key that is
 * missing and a key the provider rejected — both are fixed on the Settings screen, so both toast,
 * and the message says which one happened. `provider` is the service being unreachable or answering
 * with something unusable, which is configuration in the same sense. The other two never toast:
 * `aborted` is the user's own cancel, and `unsupported` is a route refusing a shape it does not
 * implement yet, which belongs inline on the surface that asked for it.
 */
export type AgentErrorCode = "auth" | "provider" | "aborted" | "unsupported";

export class AgentError extends Error {
  readonly code: AgentErrorCode;

  constructor(code: AgentErrorCode, message: string) {
    super(message);
    this.name = "AgentError";
    this.code = code;
  }
}

/** One part of one message. `tool_result` is how a local executor's answer re-enters the loop. */
export type ContentPart =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; toolUseId: string; content: string; isError?: boolean };

export interface ProviderMessage {
  role: "user" | "assistant";
  content: ContentPart[];
}

/** A tool as the provider is told about it. `strict` is always on for these (§13.3). */
export interface ToolDefinition {
  name: string;
  description: string;
  schema: Record<string, unknown>;
}

export interface ChatRequest {
  model: string;
  effort: Effort | null;
  /** Exactly the array `assembleContext` returned; the provider decides how to send it. */
  system: ContextBlock[];
  messages: ProviderMessage[];
  tools: ToolDefinition[];
  maxTokens: number;
}

export type ChatEvent =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "stop"; stopReason: string };

export interface ParseRequest<T> {
  model: string;
  effort: Effort | null;
  system: ContextBlock[];
  messages: ProviderMessage[];
  schema: z.ZodType<T>;
  maxTokens: number;
  signal?: AbortSignal;
}

export interface Provider {
  streamChat(req: ChatRequest, signal: AbortSignal): AsyncIterable<ChatEvent>;
  parse<T>(req: ParseRequest<T>): Promise<T>;
}

// A namespace object rather than a named export, so that this module and `anthropic.ts` can refer
// to each other — that one needs `AgentError` from here — without either reading a binding the
// other has not finished initializing. Nothing is dereferenced until a request is actually made.
export const PROVIDERS: Record<ModelEntry["provider"], Provider> = { anthropic };

/**
 * The provider for a model id, refusing rather than substituting one.
 *
 * The single exception is the scripted provider (`lib/agent/scripted.ts`), which replaces every
 * provider while `ATTUNE_FAKE_PROVIDER` is set outside production. It is checked here rather than
 * inside each provider so there is one place to read the answer to "was a model involved at all".
 * The model id is still validated first: a scripted run must fail on an unknown model exactly
 * where a real one would, or a check would pass against a model the app cannot actually use.
 */
export function providerFor(model: string): Provider {
  const entry = modelEntry(model);
  if (entry === null) {
    throw new AgentError("unsupported", `${model} is not a model this app knows about`);
  }
  return scripted.isScripted() ? scripted : PROVIDERS[entry.provider];
}

/** The effort to send, or null when this model does not take one (§11.4). */
export function effortFor(model: string, effort: Effort | undefined): Effort | null {
  const entry = modelEntry(model);
  return entry !== null && entry.effort && effort !== undefined ? effort : null;
}
