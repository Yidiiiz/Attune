// Compact controls preserve position, keyboard labels and completed-task semantics.
import { expect, test } from "@playwright/test";
import { newConversation } from "./helpers";
test.use({ testIdAttribute: "data-ui", reducedMotion: "reduce" });

test("Done collapses like Also possible and completed tasks stay out of open sections", async ({ page, request }) => {
  await request.post("/api/tasks", { data: { items: [{ title: "Completed section check" }] } });
  const state = await (await request.get("/api/tasks")).json();
  const task = [...state.focus, ...state.alsoPossible].find(task => task.title === "Completed section check");
  expect(task).toBeTruthy();
  await request.post(`/api/tasks/${task.id}/complete`);
  const done = await (await request.get("/api/tasks")).json();
  expect(done.doneToday.some((item: { id: string }) => item.id === task.id)).toBe(true);
  expect([...done.focus, ...done.alsoPossible, ...done.overdue].some(item => item.id === task.id)).toBe(false);
  await page.goto("/");
  const toggle = page.getByRole("button", { name: /^Done/ });
  const row = page.getByRole("link", { name: "Completed section check", exact: true });
  await expect(row).toBeVisible(); await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false"); await expect(row).toHaveCount(0);
  await toggle.press("Enter"); await expect(row).toBeVisible();
  const original = (await (await request.get("/api/settings")).json()).settings.list;
  try {
    await request.put("/api/settings", { data: { section: "list", value: { ...original, showCompleted: false } } });
    await page.reload(); await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await toggle.click(); await expect(row).toBeVisible();
  } finally { await request.put("/api/settings", { data: { section: "list", value: original } }); }
});

test("bottom toggle stays in place, AutoApprove is quiet, and icon sends stay centered and reachable", async ({ page }, info) => {
  for (const width of [1280, 780, 400]) {
    await page.setViewportSize({ width, height: 844 }); await page.goto("/");
    const button = page.locator('[data-composer="button"]');
    const closed = await button.boundingBox();
    await button.click();
    expect(await button.boundingBox()).toEqual(closed);
    const glyph = await button.locator("svg").boundingBox();
    expect(Math.abs(glyph!.x + glyph!.width / 2 - closed!.x - closed!.width / 2)).toBeLessThanOrEqual(.5);
    expect(Math.abs(glyph!.y + glyph!.height / 2 - closed!.y - closed!.height / 2)).toBeLessThanOrEqual(.5);
    const sheet = page.getByRole("dialog", { name: "Composer", exact: true });
    const auto = sheet.getByRole("switch", { name: "AutoApprove", exact: true });
    const off = await auto.evaluate(el => getComputedStyle(el.parentElement!).opacity);
    expect(Number(off)).toBeLessThan(1); await auto.check();
    await expect.poll(() => auto.evaluate(el => getComputedStyle(el.parentElement!).opacity)).toBe("1"); await auto.uncheck();
    const send = sheet.getByRole("button", { name: "Send", exact: true });
    await expect(send.locator("svg")).toHaveCount(1); expect(await send.innerText()).toBe("");
    const hit = await send.evaluate(el => { const box = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)); });
    expect(hit).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`composer-${width}.png`) });
    await button.click(); expect(await button.boundingBox()).toEqual(closed);
  }
  await page.setViewportSize({ width: 1280, height: 844 });
  await newConversation(page);
  const send = page.getByRole("button", { name: "Send", exact: true });
  await expect(send.locator("svg")).toHaveCount(1); expect(await send.innerText()).toBe("");
  const file = page.getByRole("button", { name: "Files", exact: true }).locator("svg");
  const center = await file.evaluate(el => { const box = el.querySelector("path")!.getBBox(); return { x: box.x + box.width / 2, y: box.y + box.height / 2 }; });
  expect(center).toEqual({ x: 12, y: 12 });
  await page.screenshot({ path: info.outputPath("chat-icons.png") });
});

test("theme-aware moon logo is centered within its square", async ({ page }) => {
  await page.goto("/");
  const href = await page.locator("#attune-app-icon").getAttribute("href");
  const svg = decodeURIComponent(href!.split(",")[1]);
  const center = await page.evaluate(svg => {
    const wrapper = document.createElement("div"); wrapper.innerHTML = svg; document.body.append(wrapper);
    const box = wrapper.querySelector("path")!.getBBox(); wrapper.remove();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }, svg);
  expect(center.x).toBeCloseTo(16, 4); expect(center.y).toBeCloseTo(16, 4);
});
