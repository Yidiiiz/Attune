// Owns: generated theme validation and the SDK structured-output schema, without inference.
// Failure behavior: malformed generated values reject; this test never contacts a provider.
import { describe, expect, it, vi } from "vitest";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { TokenMap } from "../theme/tokens.ts";
import type { Provider } from "./registry.ts";
vi.mock("../store/settings.ts", () => ({ readSettings: async () => ({ models: { default: { model: "claude-sonnet-5", effort: "medium" } } }) }));
const { proposeTheme } = await import("./theme.ts");
function provider(output: unknown): Provider {
  return { streamChat: async function* () {}, parse: vi.fn().mockResolvedValue(output) };
}
describe("theme preview", () => {
  it("uses the configured model and structured output, returning an unsaved token map", async () => {
    const fake = provider({ "--bg": "#eee8dc", "--fg": "#30291f" });
    expect(await proposeTheme("warm sepia", new AbortController().signal, fake)).toEqual({ "--bg": "#eee8dc", "--fg": "#30291f" });
    expect(fake.parse).toHaveBeenCalledWith(expect.objectContaining({ model: "claude-sonnet-5", effort: "medium", maxTokens: 64000, schema: TokenMap }));
  });
  it("refuses structural CSS or unknown properties returned by a provider", async () => {
    for (const output of [{ "--bg": "red; } body { color:red" }, { "--unknown": "#fff" }]) {
      await expect(proposeTheme("test", new AbortController().signal, provider(output))).rejects.toThrow();
    }
  });
  it("produces an SDK schema with explicit token properties and no dynamic propertyNames", () => {
    const format = zodOutputFormat(TokenMap);
    expect(format.schema).toMatchObject({ type: "object", additionalProperties: false });
    expect(format.schema).not.toHaveProperty("propertyNames");
    expect(format.schema.properties).toHaveProperty("--bg");
  });
});
