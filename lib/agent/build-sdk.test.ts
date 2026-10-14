// Owns: SDK option wiring, mandatory hooks and final-result handling without model calls.
// Failure behavior: mocked SDK events test the adapter; no client is launched or authenticated.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { queryBuild } from "./build-sdk.ts";
import type { BuildQuery } from "./build-sdk.ts";
import type { HookCallback, SDKMessage } from "@anthropic-ai/claude-agent-sdk";

vi.mock("@anthropic-ai/claude-agent-sdk", () => ({ query: vi.fn() }));
vi.mock("../store/settings.ts", () => ({ readSettings: async () => ({ models: { build: { model: "chosen-model", effort: "high" } } }) }));
vi.mock("../store/code.ts", async (original) => ({
  ...await original<typeof import("../store/code.ts")>(), readCode: async () => Buffer.from("project conventions"),
}));

const input = (plan = false): BuildQuery => ({ prompt: "Improve project", plan, dirty: new Set(), written: new Set(), signal: new AbortController().signal });
function events(rows: unknown[]) {
  vi.mocked(query).mockReturnValue((async function* () { for (const row of rows) yield row as SDKMessage; })() as ReturnType<typeof query>);
}
async function collect(value: AsyncIterable<string>) { const text = []; for await (const part of value) text.push(part); return text; }
const assistant = { type: "assistant", message: { content: [{ type: "text", text: "A result" }] } };
const complete = { type: "result", is_error: false };

beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("ATTUNE_FAKE_PROVIDER", "0"); });
afterEach(() => vi.unstubAllEnvs());

describe("Build SDK adapter", () => {
  it("uses the selected model and protects every edit through PreToolUse in acceptEdits mode", async () => {
    events([assistant, complete]);
    const request = input();
    expect(await collect(queryBuild(request))).toEqual(["A result"]);
    const options = vi.mocked(query).mock.calls[0][0].options!;
    expect(options.model).toBe("chosen-model");
    expect(options.permissionMode).toBe("acceptEdits");
    expect(options.tools).toEqual(["Read", "Glob", "Grep", "Edit", "Write"]);
    expect(options.disallowedTools).toContain("Bash");
    const hook = options.hooks!.PreToolUse![0].hooks[0];
    const invoke = (file: string) => hook({ hook_event_name: "PreToolUse", tool_name: "Write", tool_input: { file_path: file } } as Parameters<HookCallback>[0], undefined, { signal: request.signal });
    expect(await invoke("data/tasks/private.md")).toMatchObject({ hookSpecificOutput: { permissionDecision: "deny" } });
    expect(request.written.size).toBe(0);
    expect(await invoke("lib/example.ts")).toEqual({});
    expect(request.written.has("lib/example.ts")).toBe(true);
  });

  it("planning denies writes even when a callback or user allow rule could approve them", async () => {
    events([assistant, complete]);
    const request = input(true); await collect(queryBuild(request));
    const options = vi.mocked(query).mock.calls[0][0].options!;
    expect(options.permissionMode).toBe("plan");
    const hook = options.hooks!.PreToolUse![0].hooks[0];
    const denied = await hook({ hook_event_name: "PreToolUse", tool_name: "Edit", tool_input: { file_path: "lib/example.ts" } } as Parameters<HookCallback>[0], undefined, { signal: request.signal });
    expect(denied).toMatchObject({ hookSpecificOutput: { permissionDecision: "deny" } });
  });

  it("an assistant message without the SDK's final result never counts as complete", async () => {
    events([assistant]);
    await expect(collect(queryBuild(input()))).rejects.toThrow("without a final result");
    events([assistant, { type: "result", is_error: true }]);
    await expect(collect(queryBuild(input()))).rejects.toThrow("did not complete");
  });

  it("forwards an already-aborted signal into the SDK controller", async () => {
    events([complete]);
    const controller = new AbortController(); controller.abort();
    await collect(queryBuild({ ...input(), signal: controller.signal }));
    expect(vi.mocked(query).mock.calls[0][0].options!.abortController!.signal.aborted).toBe(true);
  });
});
