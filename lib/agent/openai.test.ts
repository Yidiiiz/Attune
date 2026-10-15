// Owns: Responses transport contracts without credentials or network access.
// Failure behavior: missing final events, refusals, cancellation and malformed output must fail.
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { readKey } from "../store/env.ts";
import { streamChat, parse, inputItems, strictSchema } from "./openai.ts";
import { streamModelTurn } from "./chat.ts";
import { findSecret } from "../security/secrets.ts";
import { sectionSchema } from "../settings/sections.ts";
import { defaultSettings, upgradeFactoryModels } from "../store/settings.ts";
import type { ChatRequest } from "./registry.ts";
vi.mock("../store/env.ts", () => ({ readKey: vi.fn() }));
const req: ChatRequest = { model: "gpt-6.1-sol", effort: "high", system: [], messages: [{ role: "user", content: [{ type: "text", text: "Hello" }] }], tools: [], maxTokens: 64000 };
const collect = async (stream: AsyncIterable<unknown>) => { const out = []; for await (const item of stream) out.push(item); return out; };
function sse(rows: unknown[], width = 7) {
 const data = new TextEncoder().encode(rows.map(row => `data: ${JSON.stringify(row)}\r\n\r\n`).join(""));
 return new Response(new ReadableStream({ start(controller) { for (let i=0;i<data.length;i+=width) controller.enqueue(data.slice(i,i+width)); controller.close(); } }));
}
const complete = (output: unknown[] = []) => ({ type: "response.completed", response: { status: "completed", output } });
beforeEach(() => { vi.mocked(readKey).mockResolvedValue("test-transport-token"); vi.stubGlobal("fetch", vi.fn()); });
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
it("routes the requested models, upgrades only the former factory bundle and protects project keys", () => {
 expect(defaultSettings().models.default.model).toBe("gpt-6.1-sol");
 expect(sectionSchema("models").safeParse(defaultSettings().models).success).toBe(true);
 expect(sectionSchema("models").safeParse({...defaultSettings().models,build:{model:"gpt-6.1-sol"}}).success).toBe(false);
 const old = { ...defaultSettings(), models: { default: { model: "claude-opus-5", effort: "high" as const }, extract: { model: "claude-opus-5", effort: "medium" as const }, build: { model: "claude-opus-5" } } };
 expect(upgradeFactoryModels(old).models.default.model).toBe("gpt-6.1-sol");
 old.models.default.model="claude-sonnet-5"; expect(upgradeFactoryModels(old)).toBe(old);
 expect(findSecret("sk"+"-proj-"+"a_b-".repeat(12))).toBe("openai project key");
});
it("streams split UTF-8 frames and carries encrypted reasoning through a real tool round", async () => {
 vi.mocked(fetch).mockResolvedValueOnce(sse([{ type: "response.output_text.delta", delta: "Café" }, complete([
 { type: "reasoning", id: "rs_1", encrypted_content: "opaque" },
 { type: "function_call", call_id: "call_1", name: "read_file", arguments: '{"path":"knowledge/index.md"}' }])]))
 .mockResolvedValueOnce(sse([{ type: "response.output_text.delta", delta: "Done" }, complete()]));
 const events = await collect(streamModelTurn({ mode: "ask", model: req.model, system: [], messages: req.messages, signal: new AbortController().signal, execute: async () => ({ result: "found" }) }));
 expect(events).toContainEqual({ type: "delta", text: "Café" });
 expect(events.at(-1)).toEqual({ type: "done", stopReason: "end_turn" });
 const payload=JSON.parse(String(vi.mocked(fetch).mock.calls[1][1]?.body));
 expect(payload.input).toContainEqual({ type: "reasoning", id: "rs_1", encrypted_content: "opaque", summary: [] });
 expect(payload.input).toContainEqual({ type: "function_call_output", call_id: "call_1", output: "found" });
 expect(payload.store).toBe(false);
});
it("refuses an unterminated stream, incomplete result and malformed function arguments", async () => {
 for (const rows of [[{type:"response.output_text.delta",delta:"partial"}],[{type:"response.incomplete"}],[complete([{type:"function_call",call_id:"bad",name:"x",arguments:"{"}])]]) {
  vi.mocked(fetch).mockResolvedValueOnce(sse(rows));
  await expect(collect(streamChat(req,new AbortController().signal))).rejects.toMatchObject({code:"provider"});
 }
});
it("does not call the network without a key and sanitizes rejected-key responses", async () => {
 vi.mocked(readKey).mockResolvedValueOnce(null);
 await expect(collect(streamChat(req,new AbortController().signal))).rejects.toMatchObject({code:"auth"}); expect(fetch).not.toHaveBeenCalled();
 vi.mocked(fetch).mockResolvedValueOnce(new Response("never expose this provider body",{status:401}));
 await expect(collect(streamChat(req,new AbortController().signal))).rejects.toMatchObject({code:"auth", message:expect.not.stringContaining("provider body")});
});
it("maps caller cancellation separately from provider failures", async () => {
 const controller=new AbortController(); controller.abort(); vi.mocked(fetch).mockRejectedValueOnce(new Error("aborted"));
 await expect(collect(streamChat(req,controller.signal))).rejects.toMatchObject({code:"aborted"});
});
it("validates strict structured output and removes only absent optional properties", async () => {
 const schema=z.object({ name:z.string(), optional:z.string().optional(), nullable:z.string().nullable() });
 vi.mocked(fetch).mockResolvedValueOnce(Response.json({status:"completed",output:[{type:"message",content:[{type:"output_text",text:JSON.stringify({name:"Valid",optional:null,nullable:null})}]}]}));
 expect(await parse({...req,schema})).toEqual({name:"Valid",nullable:null});
 const payload=JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body));
 expect(payload.text.format.schema.required).toEqual(["name","optional","nullable"]);
 expect(payload.text.format.schema.additionalProperties).toBe(false);
 for (const result of [{status:"incomplete",output:[]},{status:"completed",output:[{type:"message",content:[{type:"refusal",refusal:"No"}]}]},{status:"completed",output:[{type:"message",content:[{type:"output_text",text:'{"name":3}'}]}]}]) {
  vi.mocked(fetch).mockResolvedValueOnce(Response.json(result)); await expect(parse({...req,schema})).rejects.toMatchObject({code:"provider"});
 }
});
it("translates images, PDF files and nested strict schemas", () => {
 expect(inputItems([{role:"user",content:[{type:"image",mediaType:"image/png",data:"a"},{type:"document",mediaType:"application/pdf",data:"b",name:"test.pdf"}]}])[0].content).toEqual([{type:"input_image",image_url:"data:image/png;base64,a"},{type:"input_file",filename:"test.pdf",file_data:"data:application/pdf;base64,b"}]);
 expect(strictSchema({type:"object",properties:{list:{type:"array",items:{type:"object",properties:{x:{type:"string"}},required:["x"]}}},required:[]})).toMatchObject({additionalProperties:false,required:["list"]});
});
