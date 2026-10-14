// Owns: custom-theme CRUD over HTTP (§11.3).
// Failure behavior: validate before writing; all mutations are logged, atomic and undoable.
import { z } from "zod";
import { ThemeSchema, ThemeName } from "@/lib/theme/tokens";
import { listThemes } from "@/lib/store/themes";
import { saveTheme, removeTheme } from "@/lib/history/theme-actions";
import { runBatch } from "@/lib/history/batch";
import { body, handle, ok, parseInput } from "../../respond";
export const dynamic = "force-dynamic";
export async function GET(): Promise<Response> { return handle(async () => ok({ themes: await listThemes() })); }
export async function PUT(request: Request): Promise<Response> {
  return handle(async () => {
    const theme = parseInput(ThemeSchema, await body(request));
    const result = await runBatch({ actor: "user", scope: "user", summary: `Save theme ${theme.name}`, commitPrefix: "settings", actions: [saveTheme(theme)] });
    return ok({ ...result, theme });
  });
}
export async function DELETE(request: Request): Promise<Response> {
  return handle(async () => {
    const { name } = parseInput(z.object({ name: ThemeName }).strict(), await body(request));
    return ok({ ...await runBatch({ actor: "user", scope: "user", summary: `Delete theme ${name}`, commitPrefix: "settings", actions: [removeTheme(name)] }) });
  });
}
