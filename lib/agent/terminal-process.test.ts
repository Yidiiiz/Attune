// Owns: real local subprocess stdin, failure and cancellation; no terminal model is invoked.
// Failure behavior: a stopped process must settle as aborted, never as a successful response.
import { expect, it } from "vitest";
import { runTerminal } from "./terminal.ts";
it("passes prompt bytes through stdin without shell interpretation",async()=>{
 const prompt="hello `literal` $(literal)\nsecond line";
 expect(await runTerminal(["-e","process.stdin.pipe(process.stdout)"],process.execPath,prompt,process.cwd())).toBe(prompt);
});
it("cancels an actual subprocess and rejects nonzero exit",async()=>{
 const controller=new AbortController();
 const pending=runTerminal(["-e","setInterval(()=>{},1000)"],process.execPath,"",process.cwd(),controller.signal);
 controller.abort(); await expect(pending).rejects.toMatchObject({code:"aborted"});
 await expect(runTerminal(["-e","process.exit(2)"],process.execPath,"",process.cwd())).rejects.toMatchObject({code:"provider"});
});
