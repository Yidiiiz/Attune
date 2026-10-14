// Owns: Settings sections and theme transactions against a throwaway checkout.
// Failure behavior: reset personal fixtures before each check; no provider calls or owner data.
import { beforeEach, describe, expect, it } from "vitest";
import { createCheckout } from "../../../lib/testing/checkout.ts";
const checkout = await createCheckout("settings-sections");
const settings = await import("./route.ts");
const themes = await import("./themes/route.ts");
const { readSettings, writeSettings, defaultSettings } = await import("../../../lib/store/settings.ts");
const { readTheme, listThemes } = await import("../../../lib/store/themes.ts");
const { readActions } = await import("../../../lib/history/log.ts");
const { undoBatch } = await import("../../../lib/history/undo.ts");
const { themeCss } = await import("../../../lib/theme/tokens.ts");
const request = (body: unknown, method = "PUT") => new Request("http://localhost/api/settings", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
beforeEach(async () => { await checkout.reset(); });

describe("section transactions", () => {
  it("serializes concurrent section saves without losing unknown or unrelated fields", async () => {
    const original = defaultSettings();
    await writeSettings({ ...original, future: "keep", identity: { ...original.identity, futureIdentity: "also keep" } });
    const answers = await Promise.all([
      settings.PUT(request({ section: "identity", value: { name: "Sample", nickname: "S" } })),
      settings.PUT(request({ section: "list", value: { focusSize: 2, lookaheadDays: 7, showCompleted: false } })),
    ]);
    expect(answers.map(one => one.status)).toEqual([200, 200]);
    const next = await readSettings();
    expect(next.identity).toMatchObject({ name: "Sample", futureIdentity: "also keep" });
    expect(next.future).toBe("keep"); expect(next.list.focusSize).toBe(2);
    // Concurrent HTTP requests may reach the serial queue in either order.
    expect((await readActions()).map(one => one.summary).sort()).toEqual(["Change identity", "Change list"]);
    expect(checkout.git("ls-files", "data")).toBe("");
  });
  it("clears weather coordinates while preserving unknown fields", async () => {
    const original = defaultSettings();
    await writeSettings({ ...original, weather: { query: "old", units: "celsius", lat: 20, lon: 30, label: "Old", extra: 1 } });
    expect((await settings.PUT(request({ section: "weather", value: { query: "", units: "celsius" } }))).status).toBe(200);
    expect((await readSettings()).weather).toEqual({ query: "", units: "celsius", extra: 1 });
  });
  it("rejects impossible sections before logging and permits a day ending after midnight", async () => {
    for (const value of [
      { section: "list", value: { focusSize: -1 } },
      { section: "timezone", value: "not/a/timezone" },
      { section: "day", value: { startMin: 600, endMin: 500, blocks: [], breakMin: 10 } },
      { section: "models", value: { default: { model: "unknown" } } },
    ]) expect((await settings.PUT(request(value))).status).toBe(400);
    expect(await readActions()).toHaveLength(0);
    expect((await settings.PUT(request({ section: "day", value: { startMin: 600, endMin: 1560, blocks: [[600, 780], [1440, 1500]], breakMin: 10 } }))).status).toBe(200);
  });
});

describe("custom themes", () => {
  it("protects base names and refuses CSS injection or unknown tokens without residue", async () => {
    for (const name of ["light", "dark", "../escape"]) {
      expect((await themes.PUT(request({ name, base: "light", tokens: {} }))).status).toBe(400);
      expect((await themes.DELETE(request({ name }, "DELETE"))).status).toBe(400);
    }
    for (const tokens of [{ "--bg": "red; } body { color:red" }, { "--bg": "url(https://example.invalid)" }, { "--bg": "</style>" }, { "--unknown": "#ffffff" }]) {
      expect((await themes.PUT(request({ name: "unsafe", base: "light", tokens }))).status).toBe(400);
    }
    expect(await listThemes()).toHaveLength(0); expect(await readActions()).toHaveLength(0);
  });
  it("rejects a credential before appending history and removes the refused theme", async () => {
    const secret = "sk" + "-ant-" + "Q".repeat(32);
    const response = await themes.PUT(request({ name: "refused", base: "light", tokens: { "--font-sans": secret } }));
    expect(response.status).toBe(422);
    expect(JSON.stringify(await response.json())).not.toContain(secret);
    expect(await listThemes()).toHaveLength(0); expect(await readActions()).toHaveLength(0);
  });
  it("saves, selects and atomically deletes a dark custom theme; Undo restores theme and selection", async () => {
    const theme = { schema: 1, name: "evening", base: "dark", tokens: { "--bg": "#201a18" } };
    const save = await (await themes.PUT(request(theme))).json(); expect(save.ok).toBe(true);
    expect(themeCss(await readTheme("evening"))).toContain("--bg: #201a18;");
    expect((await settings.PUT(request({ section: "theme", value: "evening" }))).status).toBe(200);
    const removed = await (await themes.DELETE(request({ name: "evening" }, "DELETE"))).json();
    expect((await readSettings()).theme).toBe("dark"); expect(await listThemes()).toHaveLength(0);
    expect(await undoBatch(removed.batch)).toMatchObject({ ok: true });
    expect((await readSettings()).theme).toBe("evening"); expect(await readTheme("evening")).toEqual(theme);
    expect(checkout.git("ls-files", "data")).toBe("");
  });
});
