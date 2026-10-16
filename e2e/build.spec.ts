// Owns: Build's approval gates, real code commits, resume, revert and Undo in the sandbox.
// Failure behavior: fixtures use the scripted provider and never call a model or write owner data.
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { SANDBOX } from "./setup";

test.use({ testIdAttribute: "data-ui" });
const file = path.join(SANDBOX, "build-example.txt");
const head = () => execFileSync("git", ["rev-parse", "HEAD"], { cwd: SANDBOX, encoding: "utf8" }).trim();
async function open(page: Page) {
  await page.goto("/");
  await page.locator("[data-composer='button']").click();
  await page.locator("[data-mode='build']").click();
}
async function submit(page: Page, prompt = "Make a small project change") {
  await page.locator("[data-composer='input']").fill(prompt);
  await page.locator("[data-composer='send']").click();
}

test("Build plans without writing, applies for review, commits once and undoes a new file", async ({ page }) => {
  await open(page);
  const before = head();
  await submit(page);
  await expect(page.getByRole("heading", { name: "Review plan" })).toBeVisible();
  expect(existsSync(file)).toBe(false);
  expect(head()).toBe(before);
  await page.getByTestId("approve-build-plan").click();
  await expect(page.getByTestId("build-diff")).toContainText("build-example.txt");
  expect(readFileSync(file, "utf8")).toContain("project change");
  expect(head()).toBe(before);
  await page.getByTestId("commit-build").click();
  await expect(page.getByRole("heading", { name: "Committed", exact: true })).toBeVisible();
  expect(head()).not.toBe(before);
  await expect(page.getByRole("link", { name: "Open in Chat" })).toBeVisible();
  await page.getByTestId("undo-build").click();
  await expect.poll(() => existsSync(file)).toBe(false);
  await expect(page.getByRole("heading", { name: "Undone", exact: true })).toBeVisible();
});

test("a pending Build diff resumes after reload and Revert keeps HEAD", async ({ page }) => {
  await open(page); const before = head();
  await submit(page);
  await page.getByTestId("approve-build-plan").click();
  await expect(page.getByTestId("revert-build")).toBeVisible();
  await page.reload();
  await page.locator("[data-composer='button']").click();
  await page.locator("[data-mode='build']").click();
  await expect(page.getByTestId("build-diff")).toContainText("build-example.txt");
  await page.getByTestId("revert-build").click();
  await expect(page.getByRole("heading", { name: "Reverted", exact: true })).toBeVisible();
  expect(existsSync(file)).toBe(false); expect(head()).toBe(before);
});

test("AutoApprove commits Build and offers ordinary Undo", async ({ page }) => {
  await open(page);
  await page.getByRole("switch", { name: "AutoApprove" }).check();
  await submit(page);
  await expect(page.getByRole("heading", { name: "Committed", exact: true })).toBeVisible();
  expect(existsSync(file)).toBe(true);
  await page.getByTestId("undo-build").click();
  await expect.poll(() => existsSync(file)).toBe(false);
});

test("a denied Build write keeps the prompt and creates no code commit or personal file", async ({ page }) => {
  await open(page); const before = head();
  await page.getByRole("switch", { name: "AutoApprove" }).check();
  await submit(page, "[[build-denied]] try a personal path");
  await expect(page.getByTestId("build-panel").getByRole("alert").last()).toContainText(/forbidden|protected|personal|data/i);
  await expect(page.locator("[data-composer='input']")).toHaveValue("[[build-denied]] try a personal path");
  expect(existsSync(path.join(SANDBOX, "data/build-refused.txt"))).toBe(false);
  expect(head()).toBe(before);
});
