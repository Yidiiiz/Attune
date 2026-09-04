// Owns: what "this looks like a credential" means, and the scrubber that keeps text matching it out
// of `data/` (PROJECT.md §11.5). `scripts/check-secrets.mjs` imports the patterns from here, so the
// hook that refuses a commit and the log that records the refusal agree on the definition; two lists
// would drift, and the one that drifted silently would be the log's.
//
// Failure behavior: over-redacts by design. A false positive costs a few characters of a diagnostic
// message; a false negative writes a secret into an append-only file that is committed and pushed.
// Nothing here throws: a scrubber that can fail is a scrubber a caller will end up skipping.

// Assembled from fragments so this file does not match its own rules when check-secrets scans it.
const ANT = "sk" + "-ant-";

export interface SecretPattern {
  name: string;
  re: RegExp;
}

/** §11.5. Deliberately blunt: shape-based, no entropy scoring, no allow-list of "test" keys. */
export const SECRET_PATTERNS: SecretPattern[] = [
  { name: "anthropic key", re: new RegExp(ANT + "[A-Za-z0-9_-]{20,}") },
  { name: "generic sk- key", re: /sk-[A-Za-z0-9]{32,}/ },
  { name: "aws access key id", re: /AKIA[0-9A-Z]{16}/ },
  { name: "github token", re: /ghp_[A-Za-z0-9]{36}/ },
  { name: "slack token", re: new RegExp("xox" + "[bap]" + "-") },
  { name: "private key block", re: new RegExp("-----BEGIN" + " [A-Z ]*PRIVATE KEY-----") },
  { name: "assigned credential", re: /(api[_-]?key|secret|token)\s*[:=]\s*["']?[A-Za-z0-9_\-]{24,}/i },
];

/** `https://user:token@host` — a remote URL with its password in it, which no pattern above catches. */
const CREDENTIALED_URL = /([a-z][a-z0-9+.-]*):\/\/[^\s/@:]+:[^\s/@]+@/gi;

export const REDACTED = "[redacted]";

/** Long enough for git's first line and a commit subject; short enough that no hook can grow the log. */
export const SCRUB_LIMIT = 500;

/**
 * Make an arbitrary string safe to write under `data/`. Used on anything a subprocess produced —
 * git's own errors, and whatever a commit hook decided to print, which is unbounded by definition.
 *
 * Redaction runs before the length cap, never after: cutting a key in half can leave a fragment too
 * short to match, and the scrubber would then declare the leak clean.
 */
export function scrubSecrets(text: string, limit: number = SCRUB_LIMIT): string {
  let out = text.replace(CREDENTIALED_URL, `$1://${REDACTED}@`);
  for (const { re } of SECRET_PATTERNS) {
    out = out.replace(new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`), REDACTED);
  }
  return out.length > limit ? `${out.slice(0, limit)}…` : out;
}
