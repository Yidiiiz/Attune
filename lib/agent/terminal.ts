// Owns: signed-in terminal clients as a Provider; Attune alone executes app tool requests.
// Failure behavior: process errors, incomplete output and malformed calls fail visibly; Stop kills its tree.
import { spawn, execFile } from "node:child_process";
import path from "node:path";
import { z } from "zod";
import { terminalCommand, terminalWorkspace } from "../store/terminal.ts";
import { AgentError, modelEntry } from "./registry.ts";
import { parseStructured, strictSchema } from "./openai.ts";
import type { ChatRequest, ChatEvent, ParseRequest, ProviderMessage } from "./registry.ts";

const Answer = z.object({ text: z.string(), calls: z.array(z.object({ id: z.string().min(1), name: z.string().min(1), inputJson: z.string() })) });
const LIMIT = 8 * 1024 * 1024;
export function terminalArgs(provider: "openai" | "anthropic", model: string, effort: string | null, schema: string, dir: string): string[] {
  if (provider === "anthropic") return ["--print", "--safe-mode", "--setting-sources", "", "--restricted", "--tools", "", "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}', "--no-session-persistence", "--disable-slash-commands", "--permission-mode", "dontAsk", "--permission-prompts", "none", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose", "--model", model, ...(effort ? ["--effort", effort] : []), "--json-schema", schema];
  return ["exec", "--ignore-user-config", "--ignore-rules", "--ephemeral", "--skip-git-repo-check", "--sandbox", "read-only", "--json", "--color", "never", "--model", model, "--output-schema", schema, "--output-last-message", path.join(dir,"response.json"), "-c", "approval_policy=\"never\"", "-c", "project_doc_max_bytes=0", "-c", "features.shell_tool=false", "-c", "features.multi_agent=false", "-c", "features.apply_patch_freeform=false", "-c", "features.hooks=false", "-c", "features.plugins=false", "-c", "web_search=\"disabled\"", ...(effort ? ["-c", `model_reasoning_effort=${JSON.stringify(effort)}`] : []), "-"];
}

export async function runTerminal(args: string[], command: string, prompt: string, cwd: string, signal?: AbortSignal): Promise<string> {
  if (signal?.aborted) throw new AgentError("aborted", "Stopped");
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    for (const key of Object.keys(env)) if (/^(?:OPENAI_API_KEY|ANTHROPIC_API_KEY|CODEX_API_KEY|ATTUNE_.*|CLAUDECODE|CLAUDE_CODE_ENTRYPOINT)$/i.test(key)) delete env[key];
    const child = spawn(command, args, { cwd, shell: false, windowsHide: true, stdio: ["pipe", "pipe", "pipe"], env });
    let stdout = "", stderr = "", reason: AgentError | null = null;
    const stop = () => {
      if (child.pid && process.platform === "win32") execFile("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true }, () => {});
      else child.kill("SIGTERM");
    };
    const abort = () => { reason = new AgentError("aborted", "Stopped"); stop(); };
    const guard = setTimeout(() => { reason = new AgentError("provider", "Terminal chat timed out. Try again."); stop(); }, 180_000);
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    const finish = () => { clearTimeout(guard); signal?.removeEventListener("abort", abort); };
    child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
    child.stdout.on("data", chunk => { stdout += chunk; if (stdout.length > LIMIT) { reason = new AgentError("provider", "Terminal response was too large"); stop(); } });
    child.stderr.on("data", chunk => { stderr = (stderr + chunk).slice(-8192); });
    child.on("error", () => { finish(); reject(new AgentError("provider", "Terminal client could not start. Check its installation and sign-in.")); });
    child.on("close", code => {
      finish();
      if (reason) reject(reason);
      else if (code !== 0) reject(new AgentError(/auth|login|sign.in/i.test(stderr) ? "auth" : "provider", /model.*(?:not|unsupported|available)/i.test(stderr) ? "The terminal client cannot use this model. Choose another model or API in Settings." : "Terminal chat failed. Check the client sign-in and try again."));
      else resolve(stdout);
    });
    child.stdin.on("error", () => {}); child.stdin.end(prompt);
  });
}

async function answer(req: { model: string; effort: string | null; system: ChatRequest["system"]; messages: ProviderMessage[] }, schema: z.ZodType, tools: ChatRequest["tools"], signal?: AbortSignal): Promise<unknown> {
  const provider = modelEntry(req.model)?.provider;
  if (!provider) throw new AgentError("unsupported", "Unknown terminal model");
  const parts = req.messages.flatMap(message => message.content);
  if (provider === "openai" && parts.some(part => part.type === "document")) throw new AgentError("unsupported", "For PDF attachments, choose API in Settings → Chat connection. Terminal chat supports text and images.");
  const wire = strictSchema(z.toJSONSchema(schema));
  const workspace = await terminalWorkspace(wire);
  try {
    const command = await terminalCommand(provider).catch(error => { throw new AgentError("auth", (error as Error).message); });
    const messages = req.messages.map(message => ({ ...message, content: message.content.filter(part => part.type !== "reasoning").map(part => part.type === "image" || part.type === "document" ? { type: part.type, note: "Attached to this request" } : part) }));
    const prompt = `You are Attune's conversational assistant. Answer the supplied conversation, not a coding task. Never invoke native tools, workers, shell commands or edit files. The app executes only calls you return in the response schema. For calls use an offered tool name and encode its input as JSON in inputJson. If no tool is needed, return the answer text and an empty calls array. For structured extraction, return exactly its requested schema.\n${JSON.stringify({instructions:req.system.map(block=>block.text),messages,tools})}`;
    const cliArgs = terminalArgs(provider, req.model, req.effort, provider === "openai" ? workspace.schemaPath : JSON.stringify(wire), workspace.dir);
    let stdin = prompt;
    if (provider === "openai") {
      let index = 0;
      for (const part of parts) if (part.type === "image") cliArgs.splice(cliArgs.length - 1, 0, "--image", await workspace.image(index++, part.mediaType, part.data));
    } else {
      const attachments = parts.filter(part=>part.type === "image" || part.type === "document").map(part=>({type:part.type,source:{type:"base64",media_type:part.mediaType,data:part.data}}));
      stdin = JSON.stringify({type:"user",message:{role:"user",content:[{type:"text",text:prompt},...attachments]}})+"\n";
    }
    const output = await runTerminal([...command.prefix,...cliArgs], command.command, stdin, workspace.dir, signal);
    const events = output.split(/\r?\n/).filter(Boolean).map(line => { try { return JSON.parse(line); } catch { throw new AgentError("provider", "Terminal returned an invalid event"); } });
    if (events.some(event=>event.type === "item.completed" && event.item && !["agent_message", "reasoning"].includes(event.item.type))) throw new AgentError("provider", "Terminal attempted a native tool instead of returning an app tool request");
    if (events.some(event=>event.type === "error" || event.type === "turn.failed" || event.is_error)) throw new AgentError("provider", "Terminal did not complete the response. Check its sign-in and selected model.");
    if (provider === "anthropic") {
      const final = events.filter(event=>event.type === "result").at(-1);
      if (!final || final.subtype !== "success" || final.structured_output === undefined) throw new AgentError("provider", "Terminal response was incomplete");
      return parseStructured(schema, final.structured_output);
    }
    if (!events.some(event=>event.type === "turn.completed")) throw new AgentError("provider", "Terminal response was incomplete");
    return parseStructured(schema, JSON.parse(await workspace.result()));
  } catch (error) {
    if (error instanceof AgentError) throw error;
    throw new AgentError(signal?.aborted ? "aborted" : "provider", signal?.aborted ? "Stopped" : "Terminal returned an invalid structured answer. Try again.");
  } finally { await workspace.close(); }
}

export async function* streamChat(req: ChatRequest, signal: AbortSignal): AsyncIterable<ChatEvent> {
  const result = Answer.parse(await answer(req, Answer, req.tools, signal));
  const seen = new Set<string>();
  const calls = result.calls.map(call => {
    if (seen.has(call.id) || !req.tools.some(tool=>tool.name === call.name)) throw new AgentError("provider", "Terminal requested an unknown or duplicate app tool");
    seen.add(call.id);
    try { return { type: "tool_use" as const, id: call.id, name: call.name, input: JSON.parse(call.inputJson) as unknown }; }
    catch { throw new AgentError("provider", "Terminal returned an invalid tool input"); }
  });
  if (result.text) yield { type: "text", text: result.text };
  for (const call of calls) yield call;
  yield { type: "stop", stopReason: calls.length ? "tool_use" : "end_turn" };
}
export async function parse<T>(req: ParseRequest<T>): Promise<T> {
  return req.schema.parse(await answer(req, req.schema, [], req.signal));
}
