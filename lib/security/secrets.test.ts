// Covers the scrubber that stands between a subprocess's output and `data/`. Every fake credential
// here is assembled from fragments at runtime, so this file does not trip the scanner that reads it.

import { describe, expect, it } from "vitest";
import { findSecret, REDACTED, SCRUB_LIMIT, SECRET_PATTERNS, scrubSecrets } from "./secrets.ts";

const AWS = "AKIA" + "TESTONLYFAKEKEY1";
const ANTHROPIC = "sk" + "-ant-" + "a".repeat(40);
const GITHUB = "ghp_" + "z".repeat(36);

describe("scrubSecrets", () => {
  it("leaves ordinary git output alone", () => {
    const text = "Command failed: git commit -m task: add 3 tasks from prompt -- data";
    expect(scrubSecrets(text)).toBe(text);
  });

  it("handles an empty message", () => {
    expect(scrubSecrets("")).toBe("");
  });

  it("redacts a key that reached the message through the commit subject", () => {
    const out = scrubSecrets(`Command failed: git commit -m task: add ${AWS} -- data`);
    expect(out).not.toContain(AWS);
    expect(out).toContain(REDACTED);
    // The rest of the diagnostic survives — a message scrubbed down to nothing helps nobody.
    expect(out).toContain("git commit");
  });

  it("redacts every pattern the pre-commit hook refuses", () => {
    for (const secret of [AWS, ANTHROPIC, GITHUB]) {
      expect(scrubSecrets(`hook said: ${secret}`)).not.toContain(secret);
    }
  });

  it("redacts a password embedded in a remote URL, keeping the scheme and host", () => {
    const out = scrubSecrets("fatal: could not read from https://bob:hunter2@example.com/r.git");
    expect(out).not.toContain("hunter2");
    expect(out).toContain(`https://${REDACTED}@example.com/r.git`);
  });

  it("caps a message that a hook printed at length", () => {
    const out = scrubSecrets("x".repeat(SCRUB_LIMIT * 4));
    expect(out.length).toBeLessThanOrEqual(SCRUB_LIMIT + 1);
    expect(out.endsWith("…")).toBe(true);
  });

  // The ordering rule: cap after redacting. Capping first can slice a key down to a fragment too
  // short to match, and the scrubber would then hand back that fragment as clean text.
  it("redacts a secret sitting past the length cap rather than truncating into it", () => {
    const out = scrubSecrets(`${"x".repeat(SCRUB_LIMIT - 4)}${AWS}`);
    expect(out).not.toContain(AWS);
    expect(out).not.toContain(AWS.slice(0, 8));
  });
});

// One sample per pattern, keyed by the pattern's own name. The first assertion is the point of the
// table: adding a pattern to SECRET_PATTERNS without adding a sample here fails, so the write path
// can never quietly stop covering something the pre-commit hook still refuses. That is the
// shared-pattern invariant in AGENTS.md, held by a test rather than by good intentions.
const SAMPLES: Record<string, string> = {
  "anthropic key": "sk" + "-ant-" + "a".repeat(24),
  "generic sk- key": "sk-" + "b".repeat(32),
  "aws access key id": "AKIA" + "TESTONLYFAKEKEY1",
  "github token": "ghp_" + "z".repeat(36),
  "slack token": "xox" + "b-" + "0123456789",
  "private key block": "-----BEGIN" + " RSA PRIVATE KEY-----",
  "assigned credential": "api_key" + "=" + "c".repeat(24),
};

describe("findSecret", () => {
  it("has a sample for every pattern, so none can be added untested", () => {
    expect(Object.keys(SAMPLES).sort()).toEqual(SECRET_PATTERNS.map((p) => p.name).sort());
  });

  it("names the pattern it matched and never hands back the match", () => {
    for (const [name, sample] of Object.entries(SAMPLES)) {
      const found = findSecret(`a note that happens to say ${sample} in the middle of it`);
      expect(found).toBe(name);
      expect(found).not.toContain(sample.slice(0, 8));
    }
  });

  it("finds nothing in ordinary text", () => {
    expect(findSecret("Draft the outline, call the dentist, renew the domain")).toBeNull();
  });
});
