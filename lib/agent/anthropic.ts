// Owns: the only place in this app that speaks to a model provider (PROJECT.md §1 rule 6). It
// translates the neutral request shapes in `registry.ts` into `@anthropic-ai/sdk` calls and the
// SDK's events and errors back again, so nothing above it imports the SDK or knows a wire format.
//
// The option names here were checked against the installed version rather than remembered:
// `messages.stream` is declared in the SDK's `resources/messages/messages.d.ts` (so is
// `messages.parse`, which this file deliberately does not use — see `parse` below and Decision 27),
// `output_config.effort` takes exactly the five values §11.4 lists, and `Tool.strict` is a real
// field. `zodOutputFormat` imports `zod/v4`, which is the zod this project already has.
//
// Failure behavior: every failure leaves as an `AgentError` with a code the caller can route on. A
// missing or rejected key is `auth` — the remedy is the Settings screen, so §13.5 sends it to a
// toast — and no request is made when the key is absent. A cancel is `aborted` rather than an
// error the UI would report. Anything else the service does is `provider`. The key itself is read
// on every call and never held in a module-level client, so a key set in Settings takes effect
// without a restart (§11.5) and a removed one stops working immediately.

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { readKey } from "../store/env.ts";
import { AgentError } from "./registry.ts";
import type { ChatEvent, ChatRequest, ContentPart, ParseRequest, ProviderMessage } from "./registry.ts";
import type { ContextBlock } from "./context.ts";

/** The env var this provider's key lives under, in `.env.local` and in `process.env` (§11.5). */
export const KEY_NAME = "ANTHROPIC_API_KEY";

async function client(): Promise<Anthropic> {
  const key = await readKey(KEY_NAME);
  if (key === null) {
    throw new AgentError("auth", "No API key set. Add one in Settings → API keys.");
  }
  return new Anthropic({ apiKey: key });
}

/**
 * The context array as system blocks. Consecutive `cache: true` blocks become one block carrying
 * `cache_control` (§13.1): the cache breakpoint is a property of the prompt prefix, not of each
 * file, and one breakpoint over the group is what that line asks for.
 */
function toSystem(blocks: ContextBlock[]): Anthropic.TextBlockParam[] {
  const out: Anthropic.TextBlockParam[] = [];
  for (const block of blocks) {
    const text = `# ${block.label}\n\n${block.text}`;
    const previous = out[out.length - 1];
    if (block.cache === true && previous?.cache_control) {
      previous.text = `${previous.text}\n\n${text}`;
      continue;
    }
    out.push(block.cache === true ? { type: "text", text, cache_control: { type: "ephemeral" } } : { type: "text", text });
  }
  return out;
}

function toContent(part: ContentPart): Anthropic.ContentBlockParam {
  if (part.type === "text") return { type: "text", text: part.text };
  if (part.type === "tool_use") return { type: "tool_use", id: part.id, name: part.name, input: part.input };
  return {
    type: "tool_result",
    tool_use_id: part.toolUseId,
    content: part.content,
    ...(part.isError === true ? { is_error: true } : {}),
  };
}

const toMessages = (messages: ProviderMessage[]): Anthropic.MessageParam[] =>
  messages.map((message) => ({ role: message.role, content: message.content.map(toContent) }));

const toTools = (req: ChatRequest): Anthropic.Tool[] =>
  req.tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.schema as Anthropic.Tool.InputSchema,
    // §13.3: every tool here is defined with a strict schema, so a malformed call is the provider's
    // problem to reject rather than an executor's to detect.
    strict: true,
  }));

/**
 * Turn whatever the SDK threw into an `AgentError`. An abort is the user's own cancel and is
 * reported as such; a 401 or 403 is the key, which is the one case §13.5 sends to a toast.
 */
function asAgentError(err: unknown): AgentError {
  if (err instanceof AgentError) return err;
  if (err instanceof Anthropic.APIUserAbortError) return new AgentError("aborted", "cancelled");
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return new AgentError("auth", "The API key was rejected. Check it in Settings → API keys.");
  }
  const message = err instanceof Error ? err.message : `${err}`;
  return new AgentError("provider", message);
}

export async function* streamChat(req: ChatRequest, signal: AbortSignal): AsyncIterable<ChatEvent> {
  const anthropic = await client();
  try {
    const stream = anthropic.messages.stream(
      {
        model: req.model,
        max_tokens: req.maxTokens,
        system: toSystem(req.system),
        messages: toMessages(req.messages),
        ...(req.tools.length > 0 ? { tools: toTools(req) } : {}),
        // Adaptive thinking is the default; no `thinking` parameter is sent (AGENTS.md).
        ...(req.effort === null ? {} : { output_config: { effort: req.effort } }),
      },
      { signal },
    );

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        yield { type: "text", text: event.delta.text };
      }
    }

    // Tool inputs arrive as partial JSON fragments during the stream. The final message carries them
    // assembled and validated, so the loop above forwards text as it lands and the tool calls are
    // read once, whole — rather than this file reimplementing the SDK's own JSON accumulator.
    const final = await stream.finalMessage();
    for (const block of final.content) {
      if (block.type === "tool_use") {
        yield { type: "tool_use", id: block.id, name: block.name, input: block.input };
      }
    }
    yield { type: "stop", stopReason: final.stop_reason ?? "end_turn" };
  } catch (err) {
    throw asAgentError(err);
  }
}

/**
 * One structured answer, validated against a zod schema by the SDK's own output format (§11.3,
 * §9.4). `parsed_output` is null when the model answered with something the schema rejected; that
 * is a provider failure rather than a caller error, because the caller asked for a shape.
 *
 * It runs over `messages.stream` rather than `messages.parse`, and the reason is a hard limit
 * rather than a preference. The SDK refuses a *non-streaming* request outright, client-side and
 * before any network call, once `max_tokens` exceeds 128000/6 ≈ 21333 — see
 * `calculateNonstreamingTimeout` in the installed client. `messages.parse` is non-streaming, so at
 * §13.2's 64000 it throws every time, with or without a valid key. `stream` carries the same
 * `output_config.format` and hands back the same `parsed_output` on its final message, with no
 * ceiling. Found by running the request against the live API instead of trusting the shape.
 */
export async function parse<T>(req: ParseRequest<T>): Promise<T> {
  const anthropic = await client();
  try {
    const stream = anthropic.messages.stream(
      {
        model: req.model,
        max_tokens: req.maxTokens,
        system: toSystem(req.system),
        messages: toMessages(req.messages),
        output_config: {
          format: zodOutputFormat(req.schema),
          ...(req.effort === null ? {} : { effort: req.effort }),
        },
      },
      req.signal ? { signal: req.signal } : {},
    );

    const message = await stream.finalMessage();
    if (message.parsed_output === null || message.parsed_output === undefined) {
      throw new AgentError("provider", "the model did not answer in the shape this request asked for");
    }
    return message.parsed_output;
  } catch (err) {
    throw asAgentError(err);
  }
}
