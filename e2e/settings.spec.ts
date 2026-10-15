// Owns: live Settings persistence, custom themes, geolocation and History's user-facing gates.
// Failure behavior: all files and keys belong to the throwaway sandbox; no model or network weather calls.
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { SANDBOX } from "./setup";
import type { Settings } from "../lib/store/settings";
test.use({ testIdAttribute: "data-ui" });
const settings = () => JSON.parse(readFileSync(path.join(SANDBOX, "data/settings/settings.json"), "utf8")) as Settings;
let original: Settings;
test.beforeEach(() => { original = settings(); });
test.afterEach(async ({ request }) => { await request.put("/api/settings", { data: original }); });

test("base themes are protected; a custom palette applies live, persists and deletes with fallback", async ({ page }, info) => {
  await page.goto("/settings");
  await expect(page.getByRole("button", { name: "Delete theme", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Edit tokens", exact: true })).toHaveCount(0);
  await page.getByRole("combobox", { name: "Theme", exact: true }).focus();
  await page.getByRole("combobox", { name: "Theme", exact: true }).selectOption("dark");
  await page.getByRole("combobox", { name: "Theme", exact: true }).blur();
  await expect.poll(() => settings().theme).toBe("dark");
  await page.getByLabel("New theme name", { exact: true }).fill("evening-browser");
  await page.getByRole("button", { name: "Duplicate to new theme" }).click();
  await expect.poll(() => settings().theme).toBe("evening-browser");
  await expect(page.getByTestId("theme-editor")).toBeVisible();
  await page.getByLabel("--bg", { exact: true }).fill("#201a18");
  await page.getByRole("button", { name: "Save theme", exact: true }).click();
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--bg").trim())).toBe("#201a18");
  await page.getByRole("button", { name: "Discard preview" }).click();
  await page.screenshot({ path: info.outputPath("settings-dark.png"), fullPage: true });
  await page.reload();
  await expect(page.getByRole("combobox", { name: "Theme", exact: true })).toHaveValue("evening-browser");
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--bg").trim())).toBe("#201a18");
  page.once("dialog", dialog => void dialog.accept());
  await page.getByRole("button", { name: "Delete theme", exact: true }).click();
  await expect.poll(() => settings().theme).toBe("dark");
  await expect(page.getByRole("combobox", { name: "Theme", exact: true })).toHaveValue("dark");
});

test("generated theme is an unsaved preview until Save", async ({ page, request }) => {
  await page.goto("/settings");
  const beforePreview = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--bg").trim());
  await page.getByLabel("New theme name", { exact: true }).fill("generated-browser");
  await page.getByLabel("Create by prompting").fill("warm sepia");
  await page.getByRole("button", { name: "Generate preview" }).click();
  await expect(page.getByRole("heading", { name: "Unsaved theme" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--bg").trim())).toBe("#eee8dc");
  await page.getByRole("combobox", { name: "Theme base", exact: true }).selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme-base", "dark");
  await page.getByRole("combobox", { name: "Theme base", exact: true }).selectOption("light");
  await page.getByLabel("--bg", { exact: true }).fill("#ededed");
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--bg").trim())).toBe("#ededed");
  await page.getByRole("button", { name: "Discard preview", exact: true }).click();
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--bg").trim())).toBe(beforePreview);
  await page.getByRole("button", { name: "Generate preview", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Unsaved theme" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--bg").trim())).toBe("#eee8dc");
  expect((await (await request.get("/api/settings/themes")).json()).themes.some((theme: { name: string }) => theme.name === "generated-browser")).toBe(false);
  await page.getByRole("button", { name: "Save theme", exact: true }).click();
  await expect.poll(() => settings().theme).toBe("generated-browser");
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--bg").trim())).toBe("#eee8dc");
  await request.delete("/api/settings/themes", { data: { name: "generated-browser" } });
});

test("focus size changes the next Today view and invalid day edits stay inline", async ({ page, request }) => {
  const created = await request.post("/api/tasks", { data: { items: [1, 2, 3].map(index => ({ title: `Settings focus ${index}` })) } });
  expect(created.ok()).toBe(true);
  await page.goto("/settings");
  await page.getByLabel("Focus size", { exact: true }).fill("1");
  await page.getByLabel("Focus size", { exact: true }).blur();
  await expect.poll(() => settings().list.focusSize).toBe(1);
  await page.getByLabel("Day end", { exact: true }).fill("1");
  await page.getByLabel("Day end", { exact: true }).blur();
  await expect(page.getByRole("region", { name: "Day shape", exact: true }).getByRole("alert")).toBeVisible();
  await expect(page.getByLabel("Day end", { exact: true })).toHaveValue("1");
  expect(settings().day.endMin).toBe(original.day.endMin);
  await page.getByRole("link", { name: "Today", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Today’s focus" }).locator("..").locator(":scope > ul > li")).toHaveCount(1);
});

test("geolocation sets My location without reverse lookup and Clear removes coordinates", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 42, longitude: -72 });
  await page.route("**/api/weather/geocode*", route => { throw new Error(`Unexpected reverse lookup: ${route.request().url()}`); });
  await page.goto("/settings");
  await page.getByRole("button", { name: "Use my location", exact: true }).click();
  await expect.poll(() => settings().weather.label).toBe("My location");
  expect(settings().weather.lat).toBe(42); expect(settings().weather.lon).toBe(-72);
  await page.getByRole("button", { name: "Clear weather", exact: true }).click();
  await expect.poll(() => settings().weather.lat).toBeUndefined();
  expect(settings().weather.lon).toBeUndefined();
});

test("History opens without undoing, supports Undo and Redo, and leaves editor Ctrl+Z alone", async ({ page }) => {
  await page.goto("/settings");
  await page.getByLabel("Name", { exact: true }).fill("Browser sample");
  await page.getByLabel("Name", { exact: true }).blur();
  await expect.poll(() => settings().identity.name).toBe("Browser sample");
  await page.getByRole("heading", { name: "Settings", exact: true }).click();
  await page.keyboard.press("Control+z");
  const history = page.getByRole("dialog", { name: "Action history" });
  await expect(history).toBeVisible(); expect(settings().identity.name).toBe("Browser sample");
  await history.getByLabel("History type").selectOption("settings.update");
  const row = history.locator("li").filter({ has: page.getByRole("button", { name: "Change identity", exact: true }) }).first();
  await expect(row.getByRole("button", { name: "Change identity", exact: true })).toHaveAttribute("aria-expanded", "true");
  await row.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(() => settings().identity.name).toBe(original.identity.name);
  await row.getByRole("button", { name: "Redo", exact: true }).click();
  await expect.poll(() => settings().identity.name).toBe("Browser sample");
  await history.getByRole("button", { name: "Close History" }).click();
  await page.getByLabel("Name", { exact: true }).focus(); await page.keyboard.press("Control+z");
  await expect(history).not.toBeVisible();
});

test("key display stays masked and the history records the name only", async ({ page }) => {
  await page.goto("/settings");
  const keys = page.getByRole("region", { name: "API keys", exact: true }).locator('[data-key="ANTHROPIC_API_KEY"]');
  await keys.getByRole("button", { name: "Set", exact: true }).click();
  const value = "browser-test-" + "q".repeat(32);
  await keys.locator("input[type='password']").fill(value);
  await keys.getByRole("button", { name: "Save", exact: true }).click();
  await expect(keys.locator("input[type='password']")).toHaveCount(0);
  await expect(keys).toContainText("qqqq");
  const log = readFileSync(path.join(SANDBOX, "data/history/actions.jsonl"), "utf8");
  expect(log).toContain("ANTHROPIC_API_KEY"); expect(log).not.toContain(value);
  page.once("dialog", dialog => void dialog.accept());
  await keys.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(keys).toContainText("not set");
});

test("Settings wraps on a narrow window in light theme", async ({ page }, info) => {
  await page.setViewportSize({ width: 400, height: 800 });
  await page.goto("/settings");
  await page.getByRole("combobox", { name: "Theme", exact: true }).focus();
  await page.getByRole("combobox", { name: "Theme", exact: true }).selectOption("light"); await page.getByRole("combobox", { name: "Theme", exact: true }).blur();
  await expect.poll(() => settings().theme).toBe("light");
  const overflowing = await page.evaluate(() => [...document.querySelectorAll("body *")].filter(element => element.getBoundingClientRect().right > innerWidth + 1).slice(0, 8).map(element => ({ tag: element.tagName, className: element.className, right: element.getBoundingClientRect().right })));
  expect(overflowing).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("settings-light-narrow.png"), fullPage: true });
});


test("History refuses an older conflicting write until Undo anyway is chosen", async ({ page, request }) => {
  const older = await (await request.put("/api/settings", { data: { section: "identity", value: { name: "Earlier browser sample", nickname: "" } } })).json();
  await request.put("/api/settings", { data: { section: "identity", value: { name: "Later browser sample", nickname: "" } } });
  await page.goto("/settings"); await page.getByRole("button", { name: "Open History", exact: true }).click();
  const history = page.getByRole("dialog", { name: "Action history" });
  const row = history.locator(`[data-batch='${older.batch}']`);
  await row.getByRole("button", { name: "Change identity", exact: true }).click();
  await expect(row).toContainText("Later actions touch these files");
  await row.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(row.getByRole("alert")).toBeVisible();
  expect(settings().identity.name).toBe("Later browser sample");
  await row.getByRole("button", { name: "Undo anyway", exact: true }).click();
  await expect.poll(() => settings().identity.name).toBe(original.identity.name);
});


test("a delayed History settings read keeps a newer local draft", async ({ page }) => {
  await page.goto("/settings");
  await page.getByLabel("Name", { exact: true }).fill("Committed before undo");
  await page.getByLabel("Name", { exact: true }).blur();
  await expect.poll(() => settings().identity.name).toBe("Committed before undo");
  await page.getByRole("button", { name: "Open History", exact: true }).click();
  const history = page.getByRole("dialog", { name: "Action history" });
  await expect(history.getByRole("button", { name: "Undo", exact: true })).toBeEnabled();
  let release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  const held: Promise<void>[] = [];
  await page.route("**/api/settings", async route => {
    if (route.request().method() !== "GET") { await route.continue(); return; }
    const response = await route.fetch();
    const finished = waiting.then(() => route.fulfill({ response })); held.push(finished); await finished;
  });
  await history.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(() => held.length).toBe(2);
  await history.getByRole("button", { name: "Close History" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Newer unsaved draft");
  release(); await Promise.all(held);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Newer unsaved draft");
});
