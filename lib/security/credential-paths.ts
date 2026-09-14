// Owns: which file *names* look like they hold a credential — `.env.local`, a private key, an SSH
// identity, a tool's saved login. The file browser, its read and raw routes, the document view's
// writes and the open-document block of a turn's context all refuse such a path, whatever it holds
// and whether or not git tracks it (the Phase 8 approval, "Whole repo").
//
// **Why names, when `SECRET_PATTERNS` already scans content.** The content scan guards what the app
// writes into `data/` and the log; this guards what the app *shows*. `.env.local` is protected from
// the "Whole repo" listing today only because it is untracked, which is one committed mistake from
// being false — and a read route that hands its bytes to a page has leaked the key before any scan
// could run. A name check is cheap and does not depend on reading the file, so it runs first.
//
// Matched against every segment of the path, case-insensitively — Windows and macOS file systems
// fold case, so `.ENV` is the same file as `.env`. Over-broad on purpose: `.env.example` and a public
// `id_rsa.pub` are refused too. A false positive costs a file the browser will not open, which a
// text editor still can; a false negative is not recoverable.
//
// Failure behavior: none. Pure; returns the reason a path is refused, or null.

interface Rule {
  why: string;
  test: (segment: string) => boolean;
}

const ext = (segment: string): string => {
  const dot = segment.lastIndexOf(".");
  return dot > 0 ? segment.slice(dot + 1) : "";
};

const KEY_EXTENSIONS = new Set(["pem", "key", "p12", "pfx", "jks", "keystore", "ppk", "kdbx"]);
const LOGIN_FILES = new Set([".netrc", "_netrc", ".npmrc", ".pypirc", ".pgpass", ".git-credentials", ".htpasswd", ".dockercfg"]);
const CREDENTIAL_DIRS = new Set([".ssh", ".aws", ".gnupg", ".docker"]);

const RULES: Rule[] = [
  { why: "an environment file", test: (s) => s === ".env" || s.startsWith(".env.") || s.endsWith(".env") },
  { why: "a key or certificate file", test: (s) => KEY_EXTENSIONS.has(ext(s)) },
  { why: "an SSH identity", test: (s) => s.startsWith("id_") },
  { why: "a saved login", test: (s) => LOGIN_FILES.has(s) },
  {
    why: "a credentials file",
    // `secrets.yaml` and a downloaded `client_secret_….json` are the shapes tools save; `secrets.ts`,
    // this project's own pattern file, and a note about Secret Santa are not.
    test: (s) =>
      /^credentials(\.|$)/.test(s) || s.endsWith(".credentials") || s.startsWith("client_secret") ||
      /^secrets?(\.(json|ya?ml|toml|ini|cfg|conf|txt))?$/.test(s),
  },
];

/**
 * Why `rel` is refused, or null when it is not credential-shaped. `rel` may be `data/`-relative or
 * repository-relative, with either separator.
 */
export function credentialPath(rel: string): string | null {
  const segments = rel.split(/[\\/]+/).filter(Boolean).map((segment) => segment.toLowerCase());
  for (const segment of segments) {
    // Any segment, the last included: a path that *is* `.ssh` is the credentials folder itself.
    if (CREDENTIAL_DIRS.has(segment)) return "a credentials folder, or inside one";
    for (const rule of RULES) if (rule.test(segment)) return rule.why;
  }
  return null;
}

/** The refusal every surface gives, naming the path and the rule but never reading the file. */
export function credentialRefusal(rel: string, why: string): string {
  return `${rel} is ${why}, so the app does not show, read or write it. Open it in a text editor if you need to.`;
}
