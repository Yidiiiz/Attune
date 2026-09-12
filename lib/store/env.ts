// Owns: `.env.local` — the one file in this project that holds a secret, and the only one the store
// addresses by a repository path instead of a `data/`-relative one (PROJECT.md §11.5). It is here
// rather than in `files.ts` because everything there resolves under `data/`, and a key must never
// land in the tree that gets committed.
//
// Failure behavior: a missing file reads as no keys rather than an error, because that is exactly
// what a fresh clone has and it is not a fault. A write rewrites the file line-wise and preserves
// every line it does not recognize, so a key this app has never heard of survives being next to one
// it manages. Writes are atomic (tmp + rename) and LF-only, like every other write in the store.
// Nothing here ever logs, returns, or throws a value: the messages say the key's *name*.

import { readFile, writeFile } from "node:fs/promises";
import { renameAtomic } from "./files.ts";
import { ENV_FILE } from "./paths.ts";

export interface KnownKey {
  name: string;
  label: string;
}

/**
 * The keys Settings offers to set (§11.4: "a key name in `env.ts`'s known list"). A provider added
 * later adds its line here, and the settings section grows by one row with no other change.
 */
export const KNOWN_KEYS: KnownKey[] = [{ name: "ANTHROPIC_API_KEY", label: "Anthropic" }];

/** `KEY=value`, with optional `export `, whitespace, and surrounding quotes. */
const LINE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/;

function unquote(raw: string): string {
  const value = raw.trim();
  const quoted = /^(['"])(.*)\1$/.exec(value);
  return quoted ? quoted[2] : value;
}

async function readEnvText(): Promise<string | null> {
  try {
    return await readFile(ENV_FILE, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

/** Every assignment in the file, in file order. Comments and blank lines are not assignments. */
export async function readKeys(): Promise<Record<string, string>> {
  const text = await readEnvText();
  if (text === null) return {};

  const keys: Record<string, string> = {};
  for (const line of text.split("\n")) {
    if (line.trim().startsWith("#")) continue;
    const match = LINE.exec(line);
    if (match) keys[match[1]] = unquote(match[2]);
  }
  return keys;
}

/**
 * One key's value, or null. The file is read first and `process.env` is the fallback, not the other
 * way round: the file is where §11.5 says the value lives, so hand-editing it takes effect on the
 * next request rather than at the next restart. The fallback covers a script or a test whose
 * environment carries the key without a file.
 */
export async function readKey(name: string): Promise<string | null> {
  const fromFile = (await readKeys())[name];
  if (fromFile !== undefined && fromFile.length > 0) return fromFile;
  const fromEnv = process.env[name];
  return fromEnv !== undefined && fromEnv.length > 0 ? fromEnv : null;
}

/** §5: `"••••" + last 4`. Short values are masked whole rather than half-shown. */
export function maskKey(value: string): string {
  return value.length <= 4 ? "••••" : `••••${value.slice(-4)}`;
}

/**
 * Set or remove one key, leaving every other line of the file exactly as it was. `process.env` is
 * updated in the same call, so the running server uses the new value without a restart (§11.5).
 */
export async function writeKey(name: string, value: string | null): Promise<void> {
  const text = await readEnvText();
  const lines = text === null ? [] : text.split("\n");

  const kept: string[] = [];
  let replaced = false;
  for (const line of lines) {
    const match = line.trim().startsWith("#") ? null : LINE.exec(line);
    if (match === null || match[1] !== name) {
      kept.push(line);
      continue;
    }
    if (value !== null && !replaced) {
      kept.push(`${name}=${value}`);
      replaced = true;
    }
    // A removal, or a duplicate assignment of the same key, drops the line.
  }

  if (value !== null && !replaced) {
    while (kept.length > 0 && kept[kept.length - 1].trim() === "") kept.pop();
    kept.push(`${name}=${value}`);
  }

  const next = `${kept.join("\n").replace(/\r\n/g, "\n").replace(/\n+$/, "")}\n`;
  if (next.trim().length === 0 && text === null) return;

  const tmp = `${ENV_FILE}.tmp`;
  await writeFile(tmp, next, "utf8");
  await renameAtomic(tmp, ENV_FILE);

  if (value === null) delete process.env[name];
  else process.env[name] = value;
}
