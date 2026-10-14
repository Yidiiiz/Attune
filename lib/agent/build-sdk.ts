// Owns: the Agent SDK adapter for Build (§13.4); all model contact stays in lib/agent.
// Failure behavior: propagate SDK failures; the Build session keeps partial edits for review.
import { query } from "@anthropic-ai/claude-agent-sdk";
import path from "node:path";
import { readSettings } from "../store/settings.ts";
import { readCode } from "../store/code.ts";
import { REPO_DIR } from "../store/paths.ts";
import { buildToolRefusal } from "./build-policy.ts";
import { isScripted } from "./scripted.ts";
import { scriptedBuild } from "./build-scripted.ts";

export interface BuildQuery { prompt: string; plan: boolean; dirty: Set<string>; written: Set<string>; signal: AbortSignal }

export async function* queryBuild(input: BuildQuery): AsyncGenerator<string> {
  if (isScripted()) { yield* scriptedBuild(input); return; }
  const settings = await readSettings();
  const controller = new AbortController();
  const abort = (): void => controller.abort();
  input.signal.addEventListener("abort", abort, { once: true });
  if (input.signal.aborted) abort();
  try {
    const rules = (await readCode("AGENTS.md"))?.toString("utf8") ?? "";
    const stream = query({ prompt: input.prompt, options: {
      cwd: REPO_DIR, model: settings.models.build.model, effort: settings.models.build.effort,
      maxTurns: 40, abortController: controller, permissionMode: input.plan ? "plan" : "acceptEdits",
      settingSources: [], tools: ["Read", "Glob", "Grep", "Edit", "Write"],
      disallowedTools: ["Bash", "Agent", "Task", "Edit(data/**)", "Edit(.env.local)"],
      systemPrompt: `This is the app's Build feature, not its supervisor workflow. Use the supplied file tools; never launch runners or workers. Follow the project specification and conventions. ${rules}\nAsk whether an unclear change should ship with the project or stay personal. Never write personal data, credentials, attribution footers or trailers. Return concise results.`,
      hooks: { PreToolUse: [{ hooks: [async (event) => {
        if (event.hook_event_name !== "PreToolUse") return {};
        const reason = await buildToolRefusal(event.tool_name, event.tool_input, input.plan, input.dirty);
        if (!reason && ["Edit", "Write"].includes(event.tool_name)) {
          const file = (event.tool_input as { file_path: string }).file_path;
          input.written.add(path.relative(REPO_DIR, path.resolve(REPO_DIR, file)).split(path.sep).join("/"));
        }
        return reason ? { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } } : {};
      }] }] },
      canUseTool: async (tool, toolInput) => {
        const reason = await buildToolRefusal(tool, toolInput, input.plan, input.dirty);
        return reason ? { behavior: "deny", message: reason } : { behavior: "allow", updatedInput: toolInput };
      },
    } });
    let finalized = false;
    for await (const event of stream) {
      if (event.type === "assistant") {
        for (const part of event.message.content) if (part.type === "text") yield part.text;
      }
      if (event.type === "result") {
        if (event.is_error) throw new Error("Build did not complete; inspect its partial changes");
        finalized = true;
      }
    }
    if (!finalized) throw new Error("Build ended without a final result; inspect its partial changes");
  } finally { input.signal.removeEventListener("abort", abort); }
}
