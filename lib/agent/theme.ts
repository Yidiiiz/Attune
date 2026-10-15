// Owns: structured theme generation into an unsaved token map (§11.3).
// Failure behavior: invalid provider output refuses without writing a file or history entry.
import { isScripted } from "./scripted.ts";
import { TokenMap } from "../theme/tokens.ts";
import { readSettings } from "../store/settings.ts";
import { providerFor, effortFor } from "./registry.ts";
import type { Provider } from "./registry.ts";
export async function proposeTheme(prompt: string, signal: AbortSignal, provider?: Provider) {
  // Browser fixture only; production cannot enable the existing scripted-provider gate.
  if (!provider && isScripted()) return TokenMap.parse({ "--bg": "#eee8dc", "--fg": "#30291f" });
  const settings = await readSettings(), model = settings.models.default;
  const schema = TokenMap;
  const answer = await (provider ?? providerFor(model.model, settings.assistant?.transport ?? "api")).parse({ model: model.model,
    effort: effortFor(model.model, model.effort ?? "high"), schema, maxTokens: 64000, signal,
    system: [{ label: "Theme instructions", source: "theme", tokens: 64, text: "Return a CSS theme token map for the requested palette. Use hexadecimal colors. Override only known tokens. Do not include CSS rules, selectors, URLs or commentary." }],
    messages: [{ role: "user", content: [{ type: "text", text: prompt }] }] });
  return schema.parse(answer);
}
