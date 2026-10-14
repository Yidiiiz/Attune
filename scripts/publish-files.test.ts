// Owns: release audit refusal cases, including license, seed, identity and runtime-path semantics.
// Failure behavior: clone in-memory fixtures only; no model, personal write or external service.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { auditFiles, dataLiterals, excluded } from "./publish-files.mjs";
const files = new Map<string, Buffer>();
function read(dir: string) { for (const entry of readdirSync(dir, { withFileTypes: true })) { const rel = path.join(dir, entry.name); if (entry.isDirectory()) read(rel); else files.set(rel.replaceAll("\\", "/"), readFileSync(rel)); } }
read("seed"); files.set("LICENSE", readFileSync("LICENSE")); files.set("README.md", Buffer.from("Proprietary; see LICENSE."));
describe("release audit", () => {
  it("accepts the canonical empty seed and approved legal notice", () => { expect(auditFiles(files)).toEqual([]); });
  it("refuses altered license bytes, missing counterparts and private seed records", () => {
    for (const changed of [new Map(files).set("LICENSE", Buffer.from("different")), new Map([...files].filter(([rel]) => rel !== "seed/tasks/.gitkeep")), new Map(files).set("seed/tasks/private.md", Buffer.from("private"))]) expect(auditFiles(changed).length).toBeGreaterThan(0);
  });
  it("separates direct runtime paths from comments, namespace guards and test fixtures", () => {
    expect(dataLiterals("app/bad.ts", 'const p = "data/tasks";')).toHaveLength(1);
    expect(dataLiterals("app/bad.ts", 'const p = `data/${id}`;')).toHaveLength(1);
    expect(dataLiterals("app/good.ts", '// "data/tasks"\nconst guard = rel.startsWith("data/");')).toEqual([]);
    expect(dataLiterals("lib/example.test.ts", 'const p = "data/tasks";')).toEqual([]);
  });
  it("checks identity in code/seed, while preserving the legal/documentation scope", () => {
    expect(auditFiles(new Map(files).set("docs/example.md", Buffer.from("Sample owner")), ["Sample owner"])).toEqual([]);
    expect(auditFiles(new Map(files).set("app/example.ts", Buffer.from("Sample owner")), ["Sample owner"])).toContain("app/example.ts: personal identity/location value");
  });
  it("refuses actual attribution and credentials without echoing a match", () => {
    const phrase = ["Generated", "with"].join(" ");
    expect(auditFiles(new Map(files).set("docs/bad.md", Buffer.from(phrase)))).toContain("docs/bad.md: attribution phrase");
    const key = "sk" + "-ant-" + "Q".repeat(32);
    const errors = auditFiles(new Map(files).set("app/bad.ts", Buffer.from(key)));
    expect(errors.join()).not.toContain(key); expect(errors.join()).toContain("credential pattern");
  });
  it("excludes private handoffs, runtime state, data and credential-shaped paths", () => {
    for (const rel of ["data/tasks/one.md", "HANDOFF.md", "BUILD_PROMPT.md", ".agent/state.sqlite", ".env.local", "nested/.ssh/id_rsa", "tsconfig.tsbuildinfo"]) expect(excluded(rel)).toBe(true);
    expect(excluded("LICENSE")).toBe(false); expect(excluded("lib/security/secrets.ts")).toBe(false);
  });
});
