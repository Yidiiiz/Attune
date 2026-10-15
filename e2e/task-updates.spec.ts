// Existing-task edits on the shared Chat/Ask tray, using the isolated scripted provider.
import { readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { expect, test } from "@playwright/test";
import { exchange, newConversation } from "./helpers";
import { SANDBOX } from "./setup";

test.use({ testIdAttribute: "data-ui" });

test("review a priority edit, apply without rescheduling, and undo; stale edit stays visible", async ({ page }) => {
  const created = await page.request.post("/api/tasks", { data: { items: [{ title: "Synthetic appointment edit", priority: 1, scheduled: "2026-10-15T17:30", estimateMin: 45 }] } });
  expect(created.ok()).toBe(true);
  const { targets } = await created.json();
  const id = parse(readFileSync(path.join(SANDBOX, "data", targets[0]), "utf8").split("---")[1]).id;
  const task = async () => (await (await page.request.get(`/api/tasks/${id}`)).json()).task;
  await newConversation(page);
  await exchange(page, `[[update-task:${id}]] This appointment should be normal priority.`);
  const card = page.locator('[data-proposal="task_update"]');
  await expect(card).toContainText("Priority: Critical → Normal");
  await page.screenshot({ path: ".agent/task-edit-proposal.png", fullPage: true });
  expect((await task()).priority).toBe(1);
  const applied = page.waitForResponse((response) => response.url().endsWith("/api/agent/apply") && response.request().method() === "POST");
  await card.getByRole("button", { name: "Apply", exact: true }).click();
  const { batch } = await (await applied).json();
  await expect(card).toHaveCount(0);
  expect(await task()).toMatchObject({ priority: 3, scheduled: "2026-10-15T17:30", estimateMin: 45 });
  expect((await (await page.request.post("/api/history/undo", { data: { batch } })).json()).ok).toBe(true);
  expect((await task()).priority).toBe(1);

  await exchange(page, `[[update-task:${id}]] Change priority again.`);
  expect((await page.request.patch(`/api/tasks/${id}`, { data: { priority: 2 } })).ok()).toBe(true);
  await card.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(card.getByRole("alert")).toContainText("changed since the proposal");
  expect((await task()).priority).toBe(2);
  await card.getByRole("button", { name: "Discard", exact: true }).click();
  await expect(card).toHaveCount(0);
});
