// Owner shortcuts, opt-in automatic writes and compact theme-aware controls.
import { readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { expect, test } from "@playwright/test";
import type { APIRequestContext, Page } from "@playwright/test";
import { exchange, newConversation } from "./helpers";
import { SANDBOX } from "./setup";

test.use({ testIdAttribute: "data-ui", reducedMotion: "reduce" });
const sheet = (page: Page) => page.getByRole("dialog", { name: "Composer", exact: true });
const input = (page: Page) => page.locator('[data-composer="input"]');
async function appointment(request: APIRequestContext, title: string) {
  const response = await request.post("/api/tasks", { data: { items: [{ title, priority: 1, scheduled: "2026-10-15T17:30", estimateMin: 45 }] } });
  expect(response.ok()).toBe(true);
  const { targets } = await response.json();
  return parse(readFileSync(path.join(SANDBOX, "data", targets[0]), "utf8").split("---")[1]).id as string;
}
const task = async (request: APIRequestContext, id: string) => (await (await request.get(`/api/tasks/${id}`)).json()).task;
const blur = (page: Page) => page.evaluate(() => (document.activeElement as HTMLElement)?.blur());

test("slash/enter open the prompt; Tab cycles modes or primary pages without consuming text-entry shortcuts", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("composer.mode", "tasks"));
  await page.goto("/"); await page.keyboard.press("/");
  await expect(input(page)).toBeFocused(); await expect(input(page)).toHaveValue("");
  await input(page).fill("Keep this draft");
  await input(page).press("Tab"); await expect(sheet(page).locator('[data-mode="ask"]')).toHaveAttribute("aria-pressed", "true");
  await input(page).press("Tab"); await expect(sheet(page).locator('[data-mode="build"]')).toHaveAttribute("aria-pressed", "true");
  await input(page).press("Shift+Tab"); await expect(sheet(page).locator('[data-mode="ask"]')).toHaveAttribute("aria-pressed", "true");
  await expect(input(page)).toHaveValue("Keep this draft");
  await input(page).press("Escape"); await blur(page); await page.keyboard.press("Tab"); await expect(page).toHaveURL(/\/chat$/);
  await blur(page); await page.keyboard.press("Tab"); await expect(page).toHaveURL(/\/calendar$/);
  await blur(page); await page.keyboard.press("Shift+Tab"); await expect(page).toHaveURL(/\/chat$/);
  await expect(page.getByRole("heading", { name: "Chat", exact: true })).toBeVisible();
  await blur(page); await page.keyboard.press("Enter"); await expect(input(page)).toBeFocused();
  await input(page).press("Escape");
  const search = page.getByRole("searchbox").first();
  await search.fill("/"); await search.press("Enter"); await expect(sheet(page)).not.toBeVisible();
});

test("Approve for me automatically applies one reviewed task edit and keeps Undo", async ({ page, request }) => {
  const id = await appointment(request, "Auto approval appointment");
  await newConversation(page);
  const toggle = page.getByRole("switch", { name: "Approve for me" });
  await expect(toggle).not.toBeChecked(); await toggle.check();
  let applies = 0; page.on("request", req => { if (req.url().endsWith("/api/agent/apply")) applies++; });
  const applied = page.waitForResponse(response => response.url().endsWith("/api/agent/apply"));
  await exchange(page, `[[update-task:${id}]] Normal priority, keep the time.`);
  const answer = await (await applied).json(); expect(answer.ok).toBe(true);
  await expect.poll(async () => (await task(request, id)).priority).toBe(3);
  expect((await task(request, id)).scheduled).toBe("2026-10-15T17:30");
  await expect(page.locator('[data-proposal="task_update"]')).toHaveCount(0);
  expect(applies).toBe(1);
  expect((await (await request.post("/api/history/undo", { data: { batch: answer.batch } })).json()).ok).toBe(true);
  expect((await task(request, id)).priority).toBe(1);
  await page.reload(); await expect(toggle).toBeChecked(); await toggle.uncheck();
  await exchange(page, `[[update-task:${id}]] Normal priority again.`);
  await expect(page.locator('[data-proposal="task_update"]')).toContainText("Critical → Normal");
  expect((await task(request, id)).priority).toBe(1);
});

test("failed turns cannot auto-apply earlier proposals; refused automatic Apply stays reviewable without retry", async ({ page, request }) => {
  const id = await appointment(request, "Refused approval appointment");
  await newConversation(page); await page.getByRole("switch", { name: "Approve for me" }).check();
  await page.locator('[data-ui="chat-input"]').fill(`[[update-task:${id}]] [[fail-late]]`);
  await page.getByTestId("send").click();
  await expect(page.locator('[data-role="assistant"]').last()).toHaveAttribute("data-status", "failed");
  expect((await task(request, id)).priority).toBe(1);
  await expect(page.locator('[data-proposal="task_update"]')).toHaveCount(0);
  let attempts = 0;
  await page.route("**/api/agent/apply", route => { attempts++; return route.fulfill({ status: 409, json: { ok: false, error: "Synthetic changed since proposal", code: "conflict" } }); });
  await page.getByTestId("chat-input").fill(`[[update-task:${id}]] Normal please`);
  await page.getByTestId("send").click();
  const card = page.locator('[data-proposal="task_update"]');
  await expect(card.getByRole("alert")).toContainText("changed since proposal");
  await page.getByTestId("chat-input").fill("Unrelated typing triggers a render");
  expect(attempts).toBe(1); expect((await task(request, id)).priority).toBe(1);
  await expect(card.getByRole("button", { name: "Apply", exact: true })).toBeEnabled();
});

test("Tasks extraction auto-adds once while enabled and preserves ordinary history", async ({ page }) => {
  await page.request.post("/api/tasks", { data: { items: Array.from({ length: 6 }, (_, index) => ({ title: `Existing focus item ${index}`, priority: 1 })) } });
  await page.route("**/api/agent/extract", route => route.fulfill({ json: { ok: true, result: { kind: "tasks", items: [{ title: "Auto extracted task", body: "", priority: 3, estimateMin: 30, due: null, scheduled: null, status: "todo", category: null, context: null, tags: [], links: [], repeat: null, repeatUntil: null, collection: null, inferred: [] }] } } }));
  await page.goto("/"); await page.keyboard.press("/");
  await sheet(page).getByRole("switch", { name: "Approve for me" }).check();
  const added = page.waitForResponse(response => response.url().endsWith("/api/tasks") && response.request().method() === "POST");
  await input(page).fill("Create my task"); await input(page).press("Enter");
  const answer = await (await added).json(); expect(answer.ok).toBe(true);
  await expect(sheet(page)).not.toBeVisible();
  // A populated Today may rank this new undated task under Also possible.
  const more = page.getByRole("button", { name: /^Also possible/ });
  if (await more.isVisible()) await more.click();
  await expect(page.getByRole("link", { name: "Auto extracted task", exact: true })).toBeVisible();
  expect((await (await page.request.post("/api/history/undo", { data: { batch: answer.batch } })).json()).ok).toBe(true);
});

test("Ask edit card has clear spacing and opens its existing conversation without scrolling the page", async ({ page, request }, info) => {
  const id = await appointment(request, "Ask spacing appointment");
  await page.goto("/"); await page.keyboard.press("/");
  await sheet(page).locator('[data-mode="ask"]').click();
  await input(page).fill(`[[update-task:${id}]] Normal please`); await input(page).press("Enter");
  const card = page.locator('[data-proposal="task_update"]'); await expect(card).toBeVisible();
  const body = await card.locator("ul").boundingBox(); const apply = await card.getByRole("button", { name: "Apply", exact: true }).boundingBox();
  expect(apply!.y - body!.y - body!.height).toBeGreaterThanOrEqual(8);
  await page.screenshot({ path: info.outputPath("ask-desktop.png") });
  await page.setViewportSize({ width: 400, height: 844 });
  await page.screenshot({ path: info.outputPath("ask-phone.png") });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByTestId("open-in-chat").click(); await expect(page).toHaveURL(/\/chat\?c=/);
  await expect(page.getByTestId("conversation")).toBeVisible();
});

test("theme-aware app indicator updates and selected tabs have equal outer inset", async ({ page, request }, info) => {
  const original = (await (await request.get("/api/settings")).json()).settings.theme;
  try {
    await request.put("/api/settings", { data: { section: "theme", value: "light" } });
    await page.goto("/");
    const icon = page.locator('#attune-app-icon'); const light = await icon.getAttribute("href"); expect(light).toContain("data:image/svg+xml");
    await request.put("/api/settings", { data: { section: "theme", value: "dark" } });
    await page.evaluate(() => window.dispatchEvent(new Event("settings:changed")));
    await expect(icon).not.toHaveAttribute("href", light!);
    for (const name of ["Today", "Chat", "Calendar"]) {
      await page.getByRole("navigation", { name: "Main", exact: true }).getByRole("link", { name, exact: true }).click();
      await expect(page.getByRole("navigation", { name: "Main", exact: true }).getByRole("link", { name, exact: true })).toHaveAttribute("aria-current", "page");
      const geometry = await page.locator('nav[aria-label="Main"] [aria-current="page"]').evaluate(el => {
        const child = el.getBoundingClientRect(), parent = el.parentElement!.getBoundingClientRect();
        const css = getComputedStyle(el.parentElement!);
        return { top: child.top - parent.top, bottom: parent.bottom - child.bottom, x: css.paddingLeft, y: css.paddingTop, height: child.height };
      });
      expect(geometry.top).toBe(geometry.bottom); expect(geometry.x).toBe(geometry.y); expect(geometry.height).toBe(28);
    }
    await page.screenshot({ path: info.outputPath("tabs-dark.png") });
  } finally { await request.put("/api/settings", { data: { section: "theme", value: original } }); }
});

test("Today's deadlines precede later work and count down to explicit times or 11:59 p.m.", async ({ page, request }, info) => {
  await request.post("/api/tasks", { data: { items: [
    { title: "Deadline later critical", priority: 1, due: "2030-06-13" },
    { title: "Deadline untimed", priority: 1, due: "2030-06-12" },
    { title: "Deadline evening", priority: 2, due: "2030-06-12T20:00" },
    { title: "Deadline soon", priority: 4, due: "2030-06-12T17:00" },
  ] } });
  await page.clock.install({ time: new Date("2030-06-12T16:00:00-04:00") });
  await page.goto("/?date=2030-06-12");
  const links = page.locator('a').filter({ hasText: /^Deadline (soon|evening|untimed|later critical)$/ });
  await expect(links).toHaveText(["Deadline soon", "Deadline evening", "Deadline untimed", "Deadline later critical"]);
  const row = (title: string) => page.getByRole("link", { name: title, exact: true }).locator("xpath=ancestor::li[1]");
  await expect(row("Deadline soon")).toContainText("in 1h");
  await expect(row("Deadline evening")).toContainText("in 4h");
  await expect(row("Deadline untimed")).toContainText("in 7h 59m");
  await page.clock.fastForward("00:30:00");
  await expect(row("Deadline soon")).toContainText("in 30m");
  await page.screenshot({ path: info.outputPath("today-deadlines.png") });
});

test("bottom Ask automatically applies a priority edit once and ordinary Undo restores it", async ({ page, request }) => {
  const id = await appointment(request, "Bottom Ask automatic appointment");
  await page.goto("/"); await page.keyboard.press("/");
  await sheet(page).locator('[data-mode="ask"]').click();
  await sheet(page).getByRole("switch", { name: "Approve for me" }).check();
  let attempts = 0;
  page.on("request", req => { if (req.url().endsWith("/api/agent/apply")) attempts++; });
  const applied = page.waitForResponse(response => response.url().endsWith("/api/agent/apply"));
  await input(page).fill(`[[update-task:${id}]] Normal priority, keep the time.`);
  await input(page).press("Enter");
  const answer = await (await applied).json(); expect(answer.ok).toBe(true);
  await expect.poll(async () => (await task(request, id)).priority).toBe(3);
  await expect(page.locator('[data-proposal="task_update"]')).toHaveCount(0);
  await expect(input(page)).toHaveValue("");
  expect(attempts).toBe(1);
  expect((await task(request, id)).scheduled).toBe("2026-10-15T17:30");
  expect((await (await request.post("/api/history/undo", { data: { batch: answer.batch } })).json()).ok).toBe(true);
  expect((await task(request, id)).priority).toBe(1);
});

test("turning approval off during an automatic write leaves queued proposals for review", async ({ page }) => {
  await newConversation(page);
  const toggle = page.getByRole("switch", { name: "Approve for me" });
  await toggle.check();
  let attempts = 0;
  let firstKind = "";
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let firstStarted!: () => void;
  const started = new Promise<void>(resolve => { firstStarted = resolve; });
  await page.route("**/api/agent/apply", async route => {
    attempts++;
    if (attempts !== 1) { await route.continue(); return; }
    firstKind = route.request().postDataJSON().proposal.kind;
    const response = await route.fetch();
    firstStarted();
    await held;
    await route.fulfill({ response });
  });
  try {
    await exchange(page, "[[propose-note]] [[propose-collection]] Save both synthetic references.");
    await started;
    await expect(toggle).toBeEnabled();
    await toggle.uncheck();
    release();
    expect(["collection", "knowledge"]).toContain(firstKind);
    const remainingKind = firstKind === "collection" ? "knowledge" : "collection";
    const remaining = page.locator(`[data-proposal="${remainingKind}"]`);
    await expect(page.locator(`[data-proposal="${firstKind}"]`)).toHaveCount(0);
    await expect(remaining).toBeVisible();
    expect(attempts).toBe(1);
    await remaining.getByRole("button", { name: "Discard", exact: true }).click();
    await expect(page.getByTestId("proposals")).toHaveCount(0);
    expect(attempts).toBe(1);
  } finally { release(); }
});
