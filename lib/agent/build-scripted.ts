// Owns: non-production Build browser fixtures, behind the existing scripted-provider gate.
// Failure behavior: denied writes use the real policy; no model or personal file is touched.
import { writeCode } from "../store/code.ts";
import { StoreError } from "../store/paths.ts";
import { buildToolRefusal } from "./build-policy.ts";
import type { BuildQuery } from "./build-sdk.ts";

export async function* scriptedBuild(input: BuildQuery): AsyncGenerator<string> {
  if (input.signal.aborted) throw new StoreError("invalid", "Build stopped");
  if (input.plan) { yield "Create build-example.txt with the requested project change."; return; }
  const target = input.prompt.includes("[[build-denied]]") ? "data/build-refused.txt" : "build-example.txt";
  const refusal = await buildToolRefusal("Write", { file_path: target }, false, input.dirty);
  if (refusal) throw new StoreError("forbidden_path", refusal);
  input.written.add(target);
  await writeCode(target, Buffer.from("A project change made by the scripted Build fixture.\n"));
  yield "The project file is ready for review.";
}
