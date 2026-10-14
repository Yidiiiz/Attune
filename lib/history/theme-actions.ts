// Owns: logged custom-theme saves/deletes, including fallback when deleting the active theme.
// Failure behavior: all changes are one rollback-capable batch; protected base names refuse first.
import { readTheme, writeTheme, deleteTheme, themePath } from "../store/themes.ts";
import type { Theme } from "../theme/tokens.ts";
import type { ActionSpec } from "./batch.ts";
export function saveTheme(theme: Theme): ActionSpec {
  return { type: "settings.update", summary: `Save theme ${theme.name}`, apply: async store => {
    const rel = themePath(theme.name), before = await store.snapshotContent(rel);
    await writeTheme(theme);
    return { targets: [rel], before: { [rel]: before }, after: { [rel]: await store.snapshotContent(rel) } };
  } };
}
export function removeTheme(name: string): ActionSpec {
  return { type: "settings.update", summary: `Delete theme ${name}`, apply: async store => {
    const rel = themePath(name), theme = await readTheme(name), current = await store.settings.readSettings();
    const paths = current.theme === name ? [rel, store.settings.SETTINGS_PATH] : [rel];
    const before = Object.fromEntries(await Promise.all(paths.map(async one => [one, await store.snapshotContent(one)])));
    await deleteTheme(name);
    if (current.theme === name) await store.settings.writeSettings({ ...current, theme: theme.base });
    const after = Object.fromEntries(await Promise.all(paths.map(async one => [one, await store.snapshotContent(one)])));
    return { targets: paths, before, after };
  } };
}
