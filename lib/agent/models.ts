// Owns: pure model metadata shared by Settings and provider routing (§11.4).
// Failure behavior: unknown IDs return null; no provider or filesystem is loaded.
/** §11.4. The same five values `settings.models.*.effort` allows. */
export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export interface ModelEntry {
  id: string;
  label: string;
  provider: "anthropic" | "openai";
  images: boolean;
  pdf: boolean;
  /** Whether `output_config.effort` may be sent. Sent only when this is true (§11.4). */
  effort: boolean;
}

export const MODELS: ModelEntry[] = [
  { id: "gpt-6.1-sol", label: "GPT-6.1 Sol", provider: "openai", images: true, pdf: true, effort: true },
  { id: "claude-opus-5-5", label: "Claude Opus 5.5", provider: "anthropic", images: true, pdf: true, effort: true },
  { id: "claude-opus-5", label: "Claude Opus 5", provider: "anthropic", images: true, pdf: true, effort: true },
  { id: "claude-sonnet-5", label: "Claude Sonnet 5", provider: "anthropic", images: true, pdf: true, effort: true },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5", provider: "anthropic", images: true, pdf: true, effort: false },
];

export function modelEntry(id: string): ModelEntry | null {
  return MODELS.find((entry) => entry.id === id) ?? null;
}
