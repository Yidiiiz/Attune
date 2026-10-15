// Owns: disposable CLI schemas/images and cleanup, without credentials or model calls.
// Failure behavior: no generated transport artifact survives closing its workspace.
import { access, readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { terminalWorkspace } from "./terminal.ts";
it("writes isolated schema/image artifacts and removes only its own workspace", async()=>{
 const schema={type:"object",properties:{text:{type:"string"}},required:["text"],additionalProperties:false};
 const one=await terminalWorkspace(schema),two=await terminalWorkspace(schema);
 try {
  expect(one.dir).not.toBe(two.dir);
  expect(JSON.parse(await readFile(one.schemaPath,"utf8"))).toEqual(schema);
  const image=await one.image(0,"image/png",Buffer.from("synthetic-image").toString("base64"));
  expect(await readFile(image,"utf8")).toBe("synthetic-image");
  await expect(one.image(1,"text/plain","AA==")).rejects.toThrow("Unsupported image format");
  await one.close(); await expect(access(one.dir)).rejects.toMatchObject({code:"ENOENT"});
  await expect(access(two.schemaPath)).resolves.toBeUndefined();
 }finally{await one.close();await two.close();}
});
