// Owns: the pure theme contract and safe CSS serialization (§4.10, §11.3).
// Failure behavior: invalid names, unknown tokens and executable/structural CSS are rejected.
import { z } from "zod";
export const TOKENS = ["--bg", "--bg-elevated", "--bg-sunken", "--fg", "--fg-muted", "--fg-faint",
  "--border", "--border-strong", "--accent", "--accent-fg", "--accent-soft", "--danger", "--danger-soft",
  "--warning", "--success", "--overdue", "--focus-ring", "--selection", "--shadow", "--radius-sm",
  "--radius-md", "--radius-lg", "--font-sans", "--font-mono", "--font-size", "--line-height",
  "--priority-1", "--priority-2", "--priority-3", "--priority-4", "--node-task", "--node-note",
  "--node-map", "--node-collection", "--node-chat", "--node-file"] as const;
export const ThemeName = z.string().regex(/^[a-z][a-z0-9-]{0,39}$/).refine(name => !["light", "dark"].includes(name), "Base themes are protected");
const Value = z.string().min(1).max(300).regex(/^[#a-zA-Z0-9(),.%/"' +_-]+$/)
  .refine(value => !/(url|expression|var|env|attr)\s*\(/i.test(value), "Unsafe CSS value");
const shape = Object.fromEntries(TOKENS.map(token => [token, Value.optional()])) as
  { [Key in typeof TOKENS[number]]: z.ZodOptional<typeof Value> };
export const TokenMap = z.object(shape).strict();
export const ThemeSchema = z.object({ schema: z.literal(1).default(1), name: ThemeName,
  base: z.enum(["light", "dark"]), tokens: TokenMap }).strict();
export type Theme = z.infer<typeof ThemeSchema>;
export function themeCss(theme: Theme): string {
  const safe = ThemeSchema.parse(theme);
  return `[data-theme="${safe.name}"] { ${Object.entries(safe.tokens).filter(([, value]) => value !== undefined).map(([key, value]) => `${key}: ${value};`).join(" ")} }`;
}
export function colorToken(token: string): boolean {
  return !["--shadow", "--font-sans", "--font-mono", "--font-size", "--line-height"].includes(token) && !token.startsWith("--radius-");
}
