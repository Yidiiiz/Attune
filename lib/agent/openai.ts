// Owns: OpenAI Responses transport, neutral message translation and structured answers.
// Failure behavior: missing/rejected keys are auth errors; aborted, truncated, refused or malformed
// responses cannot complete a turn. Diagnostics never include provider bodies or credentials.
import { z } from "zod";
import { readKey } from "../store/env.ts";
import { AgentError } from "./registry.ts";
import type { ChatEvent, ChatRequest, ParseRequest, ProviderMessage } from "./registry.ts";

const ENDPOINT = "https://api.openai.com/v1/responses";
type Item = Record<string, unknown>;

/** OpenAI requires all object properties to be required; optional values are represented by null. */
export function strictSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(strictSchema);
  if (!value || typeof value !== "object") return value;
  const node = value as Item;
  const out = Object.fromEntries(Object.entries(node).filter(([key]) => key !== "$schema").map(([key, child]) => [key, strictSchema(child)]));
  if (node.type === "object" && node.properties) {
    const required = new Set(node.required as string[] ?? []);
    out.properties = Object.fromEntries(Object.entries(node.properties as Item).map(([key, child]) =>
      [key, required.has(key) ? strictSchema(child) : { anyOf: [strictSchema(child), { type: "null" }] }]));
    out.required = Object.keys(node.properties as Item);
    out.additionalProperties = false;
  }
  return out;
}

export function inputItems(messages: ProviderMessage[]): Item[] {
  return messages.flatMap(message => {
    const out: Item[] = [];
    let content: Item[] = [];
    const flush = () => { if (content.length) { out.push({ role: message.role, content }); content = []; } };
    for (const part of message.content) {
      if (part.type === "text") content.push({ type: message.role === "assistant" ? "output_text" : "input_text", text: part.text });
      else if (part.type === "image") content.push({ type: "input_image", image_url: `data:${part.mediaType};base64,${part.data}` });
      else if (part.type === "document") content.push({ type: "input_file", filename: part.name ?? "document.pdf", file_data: `data:${part.mediaType};base64,${part.data}` });
      else {
        flush();
        if (part.type === "reasoning") out.push({ type: "reasoning", id: part.id, encrypted_content: part.encryptedContent, summary: [] });
        else if (part.type === "tool_use") out.push({ type: "function_call", call_id: part.id, name: part.name, arguments: JSON.stringify(part.input) });
        else out.push({ type: "function_call_output", call_id: part.toolUseId, output: part.content });
      }
    }
    flush();
    return out;
  });
}

function body(req: ChatRequest | ParseRequest<unknown>): Item {
  return { model: req.model, store: false, include: ["reasoning.encrypted_content"],
    instructions: req.system.map(block => `# ${block.label}\n\n${block.text}`).join("\n\n"),
    input: inputItems(req.messages), max_output_tokens: req.maxTokens,
    ...(req.effort ? { reasoning: { effort: req.effort === "max" ? "xhigh" : req.effort } } : {}) };
}

async function request(payload: Item, signal?: AbortSignal): Promise<Response> {
  const key = await readKey("OPENAI_API_KEY");
  if (!key) throw new AgentError("auth", "No OpenAI API key set. Add one in Settings → API keys.");
  try {
    const response = await fetch(ENDPOINT, { method: "POST", signal: AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]),
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (!response.ok) {
      await response.body?.cancel();
      throw new AgentError(response.status === 401 || response.status === 403 ? "auth" : "provider",
        response.status === 401 || response.status === 403 ? "OpenAI rejected the API key. Check it in Settings → API keys." : `OpenAI request failed (HTTP ${response.status}).`);
    }
    return response;
  } catch (error) { throw failure(error, signal); }
}
function failure(error: unknown, signal?: AbortSignal): AgentError {
  if (signal?.aborted) return new AgentError("aborted", "cancelled");
  return error instanceof AgentError ? error : new AgentError("provider", "OpenAI did not return a usable response. Try again.");
}

/** Consume real SSE frames, including split UTF-8/chunks, and always release the response stream. */
async function* events(response: Response): AsyncGenerator<Item> {
  if (!response.body) throw new AgentError("provider", "OpenAI returned no response stream.");
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let pending = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      pending += decoder.decode(value, { stream: !done });
      pending = pending.replace(/\r\n/g, "\n");
      let end;
      while ((end = pending.indexOf("\n\n")) !== -1) {
        const frame = pending.slice(0, end); pending = pending.slice(end + 2);
        const data = frame.split("\n").filter(line => line.startsWith("data:")).map(line => line.slice(5).trimStart()).join("\n");
        if (data && data !== "[DONE]") yield JSON.parse(data) as Item;
      }
      if (done) break;
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

export async function* streamChat(req: ChatRequest, signal: AbortSignal): AsyncIterable<ChatEvent> {
  try {
    const response = await request({ ...body(req), stream: true,
      ...(req.tools.length ? { tools: req.tools.map(tool => ({ type: "function", name: tool.name,
        description: tool.description, parameters: strictSchema(tool.schema), strict: true })) } : {}) }, signal);
    let completed = false;
    for await (const event of events(response)) {
      if (event.type === "response.output_text.delta" && typeof event.delta === "string") yield { type: "text", text: event.delta };
      if (event.type === "response.failed" || event.type === "response.incomplete" || event.type === "error") throw new AgentError("provider", "OpenAI did not complete the response.");
      if (event.type === "response.completed") {
        const final = event.response as { status: string; output: Item[] };
        if (final.status !== "completed") throw new AgentError("provider", "OpenAI did not complete the response.");
        let tools = false;
        for (const item of final.output) {
          if (item.type === "reasoning" && typeof item.encrypted_content === "string") yield { type: "reasoning", id: String(item.id), encryptedContent: item.encrypted_content };
          if (item.type === "function_call") {
            if (typeof item.call_id !== "string" || typeof item.name !== "string" || typeof item.arguments !== "string") throw new AgentError("provider", "OpenAI returned a malformed tool call.");
            tools = true;
            yield { type: "tool_use", id: String(item.call_id), name: String(item.name), input: JSON.parse(String(item.arguments)) };
          }
          if (item.type === "message" && (item.content as Item[]).some(part => part.type === "refusal")) throw new AgentError("provider", "OpenAI declined this request.");
        }
        completed = true;
        yield { type: "stop", stopReason: tools ? "tool_use" : "end_turn" };
      }
    }
    if (!completed) throw new AgentError("provider", "OpenAI stream ended before completion.");
  } catch (error) { throw failure(error, signal); }
}

export async function parse<T>(req: ParseRequest<T>): Promise<T> {
  try {
    const response = await request({ ...body(req), text: { format: { type: "json_schema", name: "answer", strict: true,
      schema: strictSchema(z.toJSONSchema(req.schema)) } } }, req.signal);
    const result = await response.json() as { status: string; output: Item[] };
    if (result.status !== "completed") throw new AgentError("provider", "OpenAI did not complete the structured answer.");
    const content = result.output.filter(item => item.type === "message").flatMap(item => item.content as Item[]);
    if (content.some(part => part.type === "refusal")) throw new AgentError("provider", "OpenAI declined this request.");
    const answer = JSON.parse(content.filter(part => part.type === "output_text").map(part => part.text).join(""));
    // Omitted optional theme overrides were represented as null in the strict wire schema.
    const clean = (v: unknown, schema: Item): unknown => {
      if (Array.isArray(v)) return v.map(child => clean(child, (schema.items ?? {}) as Item));
      if (!v || typeof v !== "object" || !schema.properties) return v;
      const required = new Set(schema.required as string[] ?? []), properties = schema.properties as Record<string, Item>;
      return Object.fromEntries(Object.entries(v).filter(([key, value]) => value !== null || required.has(key)).map(([key, value]) => [key, clean(value, properties[key] ?? {})]));
    };
    return req.schema.parse(clean(answer, z.toJSONSchema(req.schema) as Item));
  } catch (error) { throw failure(error, req.signal); }
}
