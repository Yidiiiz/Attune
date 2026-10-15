// Owns: outstanding Today/Calendar pointer, keyboard and layout acceptance checks.
// Failure behavior: uses the existing throwaway checkout, controlled weather and on-disk evidence.
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { SANDBOX } from "./setup";
import type { APIRequestContext } from "@playwright/test";
test.use({ testIdAttribute: "data-ui" });
const DAY = "2030-06-12";
const read = (rel: string) => readFileSync(path.join(SANDBOX, "data", rel), "utf8");
const actions = () => read("history/actions.jsonl").split("\n").filter(Boolean).map(line => JSON.parse(line));
const taskFile = (id: string) => read(`tasks/${id}.md`);
async function create(request: APIRequestContext, title: string, extra = {}) {
  const response = await request.post("/api/tasks", { data: { items: [{ title, ...extra }] } });
  expect(response.ok()).toBe(true);
  return path.basename((await response.json()).targets.find((target: string) => target.startsWith("tasks/")), ".md");
}
let original: Record<string, unknown>;
test.beforeEach(async ({ request }) => { original = (await (await request.get("/api/settings")).json()).settings; });
test.afterEach(async ({ request }) => { await request.put("/api/settings", { data: original }); });

test("weather arrival and Clear keep the date centered at desktop and 360 px", async ({ page, request }, info) => {
  const date = (await (await request.get("/api/tasks")).json()).date;
  await request.put("/api/settings", { data: { section: "weather", value: { lat: 42, lon: -72, label: "Acceptance location" } } });
  for (const width of [1280, 360]) {
    await page.setViewportSize({ width, height: 900 });
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    await page.route("**/api/weather", async route => {
      await held;
      await route.fulfill({ json: { ok: true, weather: { label: "Acceptance location", current: { temp: 22, code: 0 }, days: [{ date, min: 16, max: 24, code: 0 }] } } });
    });
    await page.goto("/");
    const center = page.getByRole("button", { name: "Schedule", exact: true }).locator("xpath=../../div[2]");
    const before = await center.boundingBox();
    release();
    await expect(page.getByText("22°", { exact: true })).toBeVisible();
    const after = await center.boundingBox();
    expect(Math.abs(after!.x - before!.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(after!.x + after!.width / 2 - width / 2)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: info.outputPath(`today-weather-${width}.png`) });
    await page.unroute("**/api/weather");
  }
  await page.goto("/settings");
  await page.getByRole("button", { name: "Clear weather", exact: true }).click();
  await expect.poll(() => JSON.parse(read("settings/settings.json")).weather.lat).toBeUndefined();
  await page.getByRole("link", { name: "Today", exact: true }).click();
  await expect(page.getByText("22°", { exact: true })).toHaveCount(0);
  const dateBox = await page.getByRole("button", { name: "Schedule", exact: true }).locator("xpath=../../div[2]").boundingBox();
  expect(Math.abs(dateBox!.x + dateBox!.width / 2 - 180)).toBeLessThanOrEqual(1);
});

test("timeline pointer and time input schedule real tasks; Undo restores bytes", async ({ page, request }) => {
  const id = await create(request, "Acceptance timeline", { scheduled: `${DAY}T10:00`, estimateMin: 30 });
  await page.goto(`/?date=${DAY}`);
  await page.getByRole("button", { name: "Schedule", exact: true }).click();
  const input = page.getByLabel("Start time for Acceptance timeline");
  await expect(input).toHaveValue("10:00");
  const before = taskFile(id), logBefore = actions().length;
  const block = input.locator("xpath=../..");
  const box = await block.boundingBox();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + 8);
  await page.mouse.down(); await page.mouse.move(box!.x + box!.width / 2, box!.y + 56, { steps: 8 });
  await expect(block).toContainText("11:00");
  await page.mouse.up();
  await expect(input).toHaveValue("11:00");
  expect(actions().length).toBe(logBefore + 1);
  expect(actions().at(-1).type).toBe("task.update");
  const undo = await request.post("/api/history/undo", { data: { batch: actions().at(-1).batch } });
  expect(undo.ok()).toBe(true); expect(taskFile(id)).toBe(before);
  await page.reload();
  await input.fill("11:15");
  await expect.poll(() => taskFile(id)).toContain(`${DAY}T11:15`);
});

test("HTML5 calendar events change schedule; Shift hint follows key and writes due", async ({ page, request }) => {
  const id = await create(request, "Acceptance calendar drag", { scheduled: DAY });
  await page.goto(`/calendar?view=week&anchor=${DAY}`);
  const target = page.locator('[data-date="2030-06-13"]');
  const item = page.getByRole("button", { name: "Acceptance calendar drag", exact: true });
  const before = taskFile(id), count = actions().length;
  const scheduleTransfer = await page.evaluateHandle(() => new DataTransfer());
  await item.dispatchEvent("dragstart", { dataTransfer: scheduleTransfer });
  await target.dispatchEvent("dragover", { dataTransfer: scheduleTransfer });
  await expect(target.getByText("schedule", { exact: true })).toBeVisible();
  await target.dispatchEvent("drop", { dataTransfer: scheduleTransfer });
  await scheduleTransfer.dispose();
  await expect(target.getByRole("button", { name: "Acceptance calendar drag", exact: true })).toBeVisible();
  expect(taskFile(id)).toContain("scheduled: 2030-06-13");
  expect(taskFile(id)).toContain("due:\n");
  expect(actions().length).toBe(count + 1);
  expect((await request.post("/api/history/undo", { data: { batch: actions().at(-1).batch } })).ok()).toBe(true);
  expect(taskFile(id)).toBe(before);
  await page.reload();
  const dueTarget = page.locator('[data-date="2030-06-14"]');
  const transfer = await page.evaluateHandle(() => new DataTransfer());
  await item.dispatchEvent("dragstart", { dataTransfer: transfer });
  await dueTarget.dispatchEvent("dragover", { dataTransfer: transfer, shiftKey: false });
  await expect(dueTarget.getByText("schedule", { exact: true })).toBeVisible();
  await page.keyboard.down("Shift");
  await dueTarget.dispatchEvent("dragover", { dataTransfer: transfer, shiftKey: true });
  await expect(dueTarget.getByText("set due", { exact: true })).toBeVisible();
  await page.keyboard.up("Shift");
  await dueTarget.dispatchEvent("dragover", { dataTransfer: transfer, shiftKey: false });
  await expect(dueTarget.getByText("schedule", { exact: true })).toBeVisible();
  await dueTarget.dispatchEvent("dragover", { dataTransfer: transfer, shiftKey: true });
  await dueTarget.dispatchEvent("drop", { dataTransfer: transfer, shiftKey: true });
  await expect.poll(() => taskFile(id)).toContain("due: 2030-06-14");
  expect(taskFile(id)).toContain(`scheduled: ${DAY}`);
  // Same-day drop must issue no PATCH, including when a due date controls placement.
  const writes: string[] = []; page.on("request", req => { if (req.method() === "PATCH") writes.push(req.url()); });
  await transfer.dispose();
  await page.reload();
  const sameDay = await page.evaluateHandle(() => new DataTransfer());
  await item.dispatchEvent("dragstart", { dataTransfer: sameDay });
  await dueTarget.dispatchEvent("drop", { dataTransfer: sameDay, shiftKey: true });
  await sameDay.dispose();
  expect(writes).toEqual([]);
});

test("crowded calendar expands and scrolls; view arrows, Today and keys navigate", async ({ page, request }, info) => {
  for (let i = 0; i < 8; i++) await create(request, `Acceptance crowded ${i}`, { due: "2030-06-15" });
  await page.goto(`/calendar?view=week&anchor=${DAY}`);
  const cell = page.locator('[data-date="2030-06-15"]');
  await expect(cell.locator("li")).toHaveCount(5);
  await cell.getByRole("button", { name: "+3 more", exact: true }).click();
  await expect(cell.locator("li")).toHaveCount(8);
  expect(await cell.locator("ul").evaluate(el => ({ bounded: el.clientHeight <= 220, overflow: getComputedStyle(el).overflowY }))).toEqual({ bounded: true, overflow: "auto" });
  await page.screenshot({ path: info.outputPath("calendar-expanded.png") });
  await cell.getByRole("button", { name: "Show less" }).click(); await expect(cell.locator("li")).toHaveCount(5);
  await request.post("/api/tasks", { data: { items: Array.from({ length: 8 }, (_, i) => ({ title: `Acceptance overflow ${i}`, due: "2030-06-15" })) } });
  await page.reload(); await cell.getByRole("button", { name: "+11 more", exact: true }).click();
  expect(await cell.locator("ul").evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
  await cell.getByRole("button", { name: "Show less" }).click();
  await page.getByRole("link", { name: "Rolling", exact: true }).click();
  await page.keyboard.press("ArrowDown"); await expect(page).toHaveURL(/anchor=/);
  const next = page.url(); await page.keyboard.press("ArrowUp"); await expect(page).not.toHaveURL(next);
  for (const view of ["Month", "Week"]) {
    await page.getByRole("link", { name: view, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`view=${view.toLowerCase()}`));
    const nextLink = page.getByRole("link", { name: "Next", exact: true }); const href = await nextLink.getAttribute("href");
    await nextLink.click(); await expect.poll(() => new URL(page.url()).search).toBe(new URL(href!, page.url()).search);
    await page.locator('main').getByRole("link", { name: "Today", exact: true }).click();
    await expect(page).not.toHaveURL(/anchor=/);
  }
});

test("calendar toolbar edits, refuses secrets inline, duplicates, reschedules, asks, completes and deletes", async ({ page, request }) => {
  const id = await create(request, "Acceptance toolbar", { scheduled: DAY });
  await page.goto(`/calendar?view=week&anchor=${DAY}`);
  const item = page.getByRole("button", { name: "Acceptance toolbar", exact: true });
  await item.click();
  const bar = page.getByRole("toolbar", { name: "Selected task" });
  await bar.getByRole("button", { name: "Edit", exact: true }).click();
  const secret = ["sk", "ant", "a".repeat(48)].join("-");
  await page.getByRole("textbox", { name: "Notes", exact: true }).fill(secret);
  const before = taskFile(id);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText("anthropic key");
  await expect(page.locator("form").getByRole("alert")).not.toContainText(secret);
  await expect(page.getByRole("textbox", { name: "Notes", exact: true })).toHaveValue(secret);
  expect(taskFile(id)).toBe(before);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await bar.getByLabel("Reschedule", { exact: true }).focus(); const url = page.url();
  await page.keyboard.press("ArrowUp"); expect(page.url()).toBe(url);
  await bar.getByLabel("Reschedule", { exact: true }).fill("2030-06-13");
  await expect.poll(() => taskFile(id)).toContain("scheduled: 2030-06-13");
  await bar.getByRole("button", { name: "Duplicate", exact: true }).click();
  await expect(page.getByRole("button", { name: "Acceptance toolbar", exact: true })).toHaveCount(2);
  await bar.getByRole("button", { name: "Ask about this", exact: true }).click();
  await expect(page.locator('[data-composer="context"]')).toContainText("Acceptance toolbar");
  await expect(page.locator('[data-mode="ask"]')).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Close composer", exact: true }).first().click();
  await bar.getByRole("button", { name: "Complete", exact: true }).click();
  await expect.poll(() => taskFile(id)).toContain("status: done");
  await page.getByRole("button", { name: "Acceptance toolbar", exact: true }).last().click();
  page.once("dialog", d => void d.accept()); await bar.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(bar).toHaveCount(0);
});
