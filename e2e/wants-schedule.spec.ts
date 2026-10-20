import { expect, test } from "@playwright/test";
test.use({ testIdAttribute: "data-ui", reducedMotion: "reduce" });

test("Wants stays quiet, caps visible items, and flexible edits preserve tags through Undo", async ({ page, request }, info) => {
  const initial = await (await request.get("/api/tasks")).json();
  const date = new Date(`${initial.date}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - date.getUTCDay());
  const week = date.toISOString().slice(0, 10);
  const created = await request.post("/api/tasks", { data: { items: Array.from({ length: 5 }, (_, i) => ({
    title: `Quiet want ${i + 1}`, tags: ["hobby", "want", `plan-week:${week}`], estimateMin: 30,
  })) } });
  expect(created.ok()).toBe(true);
  const state = await (await request.get("/api/tasks")).json();
  const task = state.wants.find((task: { title: string }) => task.title === "Quiet want 1");
  expect(task).toBeTruthy();
  expect(state.focus.some((task: { title: string }) => task.title.startsWith("Quiet want"))).toBe(false);
  await page.goto("/");
  await page.getByRole("region", { name: "First run", exact: true }).getByRole("button", { name: "Dismiss", exact: true }).click();
  const wants = page.getByRole("region", { name: "Wants", exact: true });
  const toggle = wants.getByRole("button", { name: /^Wants/ });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("link", { name: /^Quiet want/ })).toHaveCount(0);
  await toggle.click(); await expect(wants.getByRole("link", { name: /^Quiet want/ })).toHaveCount(3);
  await wants.getByRole("button", { name: "Show all 5", exact: true }).click();
  await expect(wants.getByRole("link", { name: /^Quiet want/ })).toHaveCount(5);
  await expect(wants.getByText("This week · flexible", { exact: true })).toHaveCount(5);
  await page.screenshot({ path: info.outputPath("wants-expanded.png") });
  await page.getByRole("button", { name: "Actions for Quiet want 1", exact: true }).click();
  await page.getByRole("menuitem", { name: "Edit", exact: true }).click();
  await page.getByLabel("Kind", { exact: true }).selectOption("work");
  await page.getByLabel("Flexible plan", { exact: true }).selectOption({ label: "Next week · rolls forward" });
  const saved = page.waitForResponse(response => response.url().endsWith(`/api/tasks/${task.id}`) && response.request().method() === "PATCH");
  await wants.locator("form").getByRole("button", { name: "Save", exact: true }).click();
  const result = await (await saved).json();
  const updated = (await (await request.get(`/api/tasks/${task.id}`)).json()).task;
  expect(updated.due).toBeNull(); expect(updated.scheduled).toBeNull();
  expect(updated.tags).toContain("hobby"); expect(updated.tags).not.toContain("want");
  expect(updated.tags).not.toContain(`plan-week:${week}`);
  expect((await request.post("/api/history/undo", { data: { batch: result.batch } })).ok()).toBe(true);
  const restored = (await (await request.get(`/api/tasks/${task.id}`)).json()).task;
  expect(restored.tags).toEqual(task.tags); expect(restored.due).toBeNull();
  await page.reload(); await expect(toggle).toHaveAttribute("aria-expanded", "false");
});

test("Schedule has roomy cards, one editor, and reachable short and overlapping tasks on desktop and phone", async ({ page, request }, info) => {
  const day = "2032-06-12";
  expect((await request.post("/api/tasks", { data: { items: [
    { title: "Cleaner short", scheduled: `${day}T10:00`, estimateMin: 5 },
    { title: "Cleaner long", scheduled: `${day}T10:15`, estimateMin: 30 },
    { title: "Cleaner overlap", scheduled: `${day}T10:15`, estimateMin: 30 },
  ] } })).ok()).toBe(true);
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/?date=${day}`);
    const welcome = page.getByRole("region", { name: "First run", exact: true });
    if (await welcome.isVisible()) await welcome.getByRole("button", { name: "Dismiss", exact: true }).click();
    const toggle = page.getByRole("button", { name: "Schedule", exact: true });
    if (await toggle.getAttribute("aria-pressed") !== "true") await toggle.click();
    const schedule = page.getByRole("region", { name: "Day schedule", exact: true });
    await expect(schedule.locator('input[type="time"]')).toHaveCount(1);
    const picker = schedule.getByLabel("Schedule item", { exact: true });
    for (const title of ["Cleaner short", "Cleaner long", "Cleaner overlap"]) {
      await picker.selectOption({ label: title });
      await expect(schedule.getByLabel(`Start time for ${title}`, { exact: true })).toBeVisible();
    }
    const card = schedule.getByRole("button", { name: "Schedule Cleaner long", exact: true });
    expect((await card.boundingBox())!.height).toBeGreaterThanOrEqual(48);
    await card.focus(); await card.press("Enter");
    await expect(card).toHaveAttribute("aria-pressed", "true");
    expect(await card.evaluate(el => { const box = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)); })).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`schedule-${width}-light.png`) });
    await page.evaluate(() => { document.documentElement.setAttribute("data-theme", "dark"); document.documentElement.setAttribute("data-theme-base", "dark"); });
    await page.screenshot({ path: info.outputPath(`schedule-${width}-dark.png`) });
  }
});
