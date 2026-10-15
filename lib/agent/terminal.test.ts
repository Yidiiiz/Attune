// Owns: signed-in terminal transport, validation, tool confinement and cleanup without model calls.
// Failure behavior: malformed or incomplete responses never become successful app turns.
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { beforeEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { spawn } from "node:child_process";
import { terminalWorkspace, terminalCommand } from "../store/terminal.ts";
import { parse, streamChat, terminalArgs } from "./terminal.ts";
import { providerFor } from "./registry.ts";
import type { ChatRequest } from "./registry.ts";
vi.mock("node:child_process", () => ({ spawn: vi.fn(), execFile: vi.fn() }));
vi.mock("../store/terminal.ts", () => ({ terminalCommand: vi.fn(), terminalWorkspace: vi.fn() }));
const req: ChatRequest = {model:"gpt-6.1-sol", effort:"low", system:[], messages:[{role:"user",content:[{type:"text",text:"Hello"}]}],tools:[{name:"read_file",description:"read",schema:{type:"object",properties:{path:{type:"string"}},required:["path"],additionalProperties:false}}],maxTokens:100};
let result: unknown, events: unknown[], exit: number, close: () => Promise<void>, child: EventEmitter & {stdin:PassThrough;stdout:PassThrough;stderr:PassThrough;kill:ReturnType<typeof vi.fn>};
beforeEach(() => {
 vi.clearAllMocks(); result={text:"Ready",calls:[]};events=[{type:"turn.completed"}];exit=0;close=vi.fn(async()=>{});
 vi.mocked(terminalCommand).mockResolvedValue({command:"codex-native",prefix:[]});
 vi.mocked(terminalWorkspace).mockResolvedValue({dir:"isolated",schemaPath:"isolated/schema.json",result:async()=>JSON.stringify(result),image:async()=>"isolated/image.png",close});
 vi.mocked(spawn).mockImplementation(()=>{
  child=Object.assign(new EventEmitter(),{stdin:new PassThrough(),stdout:new PassThrough(),stderr:new PassThrough(),kill:vi.fn()});
  child.stdin.on("finish",()=>{queueMicrotask(()=>{child.stdout.end(events.map(event=>JSON.stringify(event)).join("\n"));child.emit("close",exit);});});
  return child as unknown as ReturnType<typeof spawn>;
 });
});
const collect=async(stream:AsyncIterable<unknown>)=>{const all=[];for await(const item of stream)all.push(item);return all;};
it("routes terminal explicitly without changing the explicit API provider",()=>{
 expect(providerFor(req.model,"terminal").streamChat).toBe(streamChat);
 expect(providerFor(req.model,"api").streamChat).not.toBe(streamChat);
});
it("launches with fixed flags, stdin, isolated cwd and no API keys or recursive tools",async()=>{
 const old=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY="synthetic-key";
 try {
  expect(await collect(streamChat(req,new AbortController().signal))).toEqual([{type:"text",text:"Ready"},{type:"stop",stopReason:"end_turn"}]);
  const args=vi.mocked(spawn).mock.calls[0][1] as string[],options=vi.mocked(spawn).mock.calls[0][2]!;
  expect(args).toContain("--ignore-user-config");expect(args).toContain("features.shell_tool=false");expect(args).toContain("features.multi_agent=false");expect(args).toContain("read-only");
  expect(options).toMatchObject({cwd:"isolated",shell:false,windowsHide:true});expect(options.env?.OPENAI_API_KEY).toBeUndefined();expect(close).toHaveBeenCalledOnce();
 }finally {if(old===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=old;}
});
it("returns app tool requests and refuses unknown, duplicate or malformed calls before text is yielded",async()=>{
 result={text:"",calls:[{id:"one",name:"read_file",inputJson:'{"path":"notes/example.md"}'}]};
 expect(await collect(streamChat(req,new AbortController().signal))).toContainEqual({type:"tool_use",id:"one",name:"read_file",input:{path:"notes/example.md"}});
 for(const calls of [[{id:"bad",name:"Bash",inputJson:"{}"}],[{id:"bad",name:"read_file",inputJson:"{"}],[{id:"same",name:"read_file",inputJson:"{}"},{id:"same",name:"read_file",inputJson:"{}"}]]) {
  result={text:"Never delivered",calls}; await expect(collect(streamChat(req,new AbortController().signal))).rejects.toMatchObject({code:"provider"});
 }
});
it("requires completion and valid structured output and cleans on failure",async()=>{
 for(const bad of [[],[{type:"turn.failed"}],[{type:"turn.completed"},{type:"item.completed",item:{type:"command_execution"}}]]) {
  events=bad;await expect(parse({...req,schema:z.object({text:z.string()}),signal:new AbortController().signal})).rejects.toMatchObject({code:"provider"});
 }
 events=[{type:"turn.completed"}];result={text:5};await expect(parse({...req,schema:z.object({text:z.string()})})).rejects.toMatchObject({code:"provider"});
 expect(close).toHaveBeenCalledTimes(4);
});
it("uses Claude sign-in with no native tools and validates structured result",async()=>{
 events=[{type:"result",subtype:"success",structured_output:{text:"Ready",calls:[]}}];
 expect(await collect(streamChat({...req,model:"claude-opus-5-5"},new AbortController().signal))).toContainEqual({type:"text",text:"Ready"});
 const args=terminalArgs("anthropic","claude-opus-5-5","low","{}","isolated");expect(args).toContain("--restricted");expect(args).toContain("--safe-mode");expect(args[args.indexOf("--tools")+1]).toBe("");expect(args).toContain("--strict-mcp-config");
});
it("does not silently drop unsupported Codex PDF attachments",async()=>{
 await expect(collect(streamChat({...req,messages:[{role:"user",content:[{type:"document",data:"AA==",mediaType:"application/pdf"}]}]},new AbortController().signal))).rejects.toMatchObject({code:"unsupported"});
 expect(spawn).not.toHaveBeenCalled();
});

it("restores optional omissions in strict structured answers while keeping required nulls",async()=>{
 result={text:"Ready",optional:null,required:null};
 expect(await parse({...req,schema:z.object({text:z.string(),optional:z.string().optional(),required:z.string().nullable()})})).toEqual({text:"Ready",required:null});
});
