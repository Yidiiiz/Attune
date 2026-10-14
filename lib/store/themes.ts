// Owns: personal theme files; protected bases never become files (§4.10).
// Failure behavior: malformed custom themes are omitted with a warning; direct reads refuse them.
import { listTree, readText, deleteFile } from "./files.ts";
import { writeJsonAtomic } from "./settings.ts";
import { ThemeName, ThemeSchema } from "../theme/tokens.ts";
import type { Theme } from "../theme/tokens.ts";
import { StoreError } from "./paths.ts";
export function themePath(name: string): string {
  const safe = ThemeName.safeParse(name);
  if (!safe.success) throw new StoreError("invalid", "Use a lowercase theme name; light and dark are protected");
  return `settings/themes/${safe.data}.json`;
}
export async function readTheme(name: string): Promise<Theme> {
  const theme = ThemeSchema.parse(JSON.parse(await readText(themePath(name))));
  if (theme.name !== name) throw new StoreError("invalid", "Theme name does not match its filename");
  return theme;
}
export async function listThemes(): Promise<Theme[]> {
  const themes: Theme[] = [];
  for (const node of await listTree("settings/themes")) {
    if (node.type !== "file" || !node.name.endsWith(".json")) continue;
    try { themes.push(await readTheme(node.name.slice(0, -5))); }
    catch { console.warn(`Theme ${node.name} could not be loaded`); }
  }
  return themes.sort((a, b) => a.name.localeCompare(b.name));
}
export async function writeTheme(theme: Theme): Promise<void> {
  const safe = ThemeSchema.parse(theme); await writeJsonAtomic(themePath(safe.name), safe);
}
export async function deleteTheme(name: string): Promise<void> { await deleteFile(themePath(name)); }
export async function activeTheme(name: string): Promise<Theme | null> {
  if (["light", "dark"].includes(name)) return null;
  try { return await readTheme(name); } catch { console.warn("The selected custom theme is unavailable; using light"); return null; }
}
