// The browser half of Phase 7 (PROJECT.md §17): the proposal surfaces, and §6.3's auto-apply as a
// person meets it — the toast, its Undo, and the transcript marker that is the record once the toast
// has gone. The library half is `lib/agent/auto-apply.test.ts` and `lib/agent/distill.test.ts`.
//
// Every proposal comes from a scripted-provider directive (`lib/agent/scripted.ts`), which is the
// only coverage the Phase 7 prompts get until a key exists; whether a real model follows them is
// listed in docs/CHECKLIST.md as blocked, not checked here.
//
// Files are read straight from the sandbox, because "Undo restores habits.md" is a claim about bytes
// on disk (Decision 42), not about what a page says.

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { assistant, exchange, newConversation } from "./helpers";
import { SANDBOX } from "./setup";

test.use({ testIdAttribute: "data-ui" });

const onDisk = (rel: string): string => path.join(SANDBOX, "data", rel);
const sha = (rel: string): string => createHash("sha256").update(readFileSync(onDisk(rel))).digest("hex");
const HABITS = "knowledge/profile/habits.md";

const tray = (page: Page) => page.locator("[data-ui='proposals']");
const card = (page: Page, kind: string) => tray(page).locator(`[data-proposal='${kind}']`).last();

test("a short habits append applies itself, with a toast whose Undo restores habits.md", async ({ page }) => {
  const before = sha(HABITS);
  await newConversation(page);
  await exchange(page, "[[propose-habit]] how do I usually work?");

  const toast = page.getByRole("status").filter({ hasText: "Remembered in habits.md" });
  await expect(toast).toContainText("2 lines added");
  await expect(assistant(page).getByTestId("auto-applied")).toContainText("Remembered in habits.md");
  expect(readFileSync(onDisk(HABITS), "utf8")).toContain("Works in 50-minute blocks");
  // It applied itself, so there is no card asking for it.
  await expect(tray(page)).toHaveCount(0);

  await toast.getByTestId("toast-action").click();
  await expect(page.getByText(/Undone — habits\.md is as it was/)).toBeVisible();
  await expect.poll(() => sha(HABITS)).toBe(before);
  // The marker goes with the batch, because the log now says it is undone.
  await expect(assistant(page).getByTestId("auto-applied")).toHaveCount(0);
});

test("the marker is read from the log, survives a reload, and carries the same Undo", async ({ page }) => {
  const before = sha(HABITS);
  await newConversation(page);
  await exchange(page, "[[propose-habit]] remember this");
  await page.reload();

  const marker = assistant(page).getByTestId("auto-applied");
  await expect(marker).toContainText("Remembered in habits.md — 2 lines added");
  await marker.getByTestId("auto-applied-undo").click();
  await expect(marker).toHaveCount(0);
  await expect.poll(() => sha(HABITS)).toBe(before);

  await page.reload();
  await expect(assistant(page).getByTestId("auto-applied")).toHaveCount(0);
});

test("a note card's Add writes the note and its map link; the same note proposed again becomes an append", async ({ page }) => {
  await newConversation(page);
  await exchange(page, "[[propose-note]] how is zotero set up?");

  const note = card(page, "knowledge");
  await expect(note).toHaveAttribute("data-op", "create");
  await expect(note).toContainText("Linked from knowledge/maps/tools.md");
  await note.locator("[data-action='add']").click();
  await expect(page.getByText("Saved to knowledge/notes/zotero-setup.md")).toBeVisible();
  await expect(tray(page)).toHaveCount(0);
  expect(readFileSync(onDisk("knowledge/notes/zotero-setup.md"), "utf8")).toContain("title: Zotero setup");
  expect(readFileSync(onDisk("knowledge/maps/tools.md"), "utf8")).toContain("(knowledge/notes/zotero-setup.md)");

  // §6.3's duplicate rule, as the card shows it: the operation approved is the one applied.
  await exchange(page, "[[propose-note]] and again");
  const again = card(page, "knowledge");
  await expect(again).toHaveAttribute("data-op", "append");
  await expect(again).toHaveAttribute("data-path", "knowledge/notes/zotero-setup.md");
  await expect(again.getByTestId("rewritten")).toContainText("matches the existing note");
});

test("a refused note shows why on its card and keeps what was typed", async ({ page }) => {
  await newConversation(page);
  await exchange(page, "[[propose-note-nomap]] remember a loose end");

  const note = card(page, "knowledge");
  await expect(note).toContainText("No map will link to this note.");
  const box = note.locator("textarea");
  await box.fill("# Loose end\n\nEdited before pressing Add.");
  await note.locator("[data-action='add']").click();

  await expect(note.getByTestId("proposal-error")).toContainText(/map/);
  await expect(box).toHaveValue("# Loose end\n\nEdited before pressing Add.");
  expect(existsSync(onDisk("knowledge/notes/loose-end.md"))).toBe(false);
});

test("a collection card's Add starts the collection", async ({ page }) => {
  await newConversation(page);
  await exchange(page, "[[propose-collection]] films people keep recommending");

  const films = card(page, "collection");
  await expect(films).toContainText("New collection: Films to watch");
  await films.locator("[data-action='add']").click();
  await expect(page.getByText("Started the collection Films to watch")).toBeVisible();
  const text = readFileSync(onDisk("knowledge/collections/films-to-watch.md"), "utf8");
  expect(text).toContain("- [ ] Stalker");
  expect(text).toContain("- [ ] Paris, Texas");
});

test("Distill to knowledge proposes the conversation's summary in its tray", async ({ page }) => {
  await newConversation(page);
  await exchange(page, "what did we decide about the thesis outline?");
  const id = (await page.locator("[data-ui='conversation']").getAttribute("data-conversation")) as string;

  await page.getByRole("button", { name: /^Actions for what did we decide/ }).click();
  await page.getByTestId("chat-menu").getByTestId("distill").click();

  const summary = card(page, "knowledge");
  await expect(summary).toHaveAttribute("data-path", `knowledge/sessions/${id}.md`);
  await expect(page).toHaveURL(new RegExp(`c=${id}$`)); // the one-shot flag is gone
  await summary.locator("[data-action='add']").click();
  await expect(page.getByText(`Saved to knowledge/sessions/${id}.md`)).toBeVisible();
  expect(readFileSync(onDisk(`knowledge/sessions/${id}.md`), "utf8")).toContain(`id: ${id}`);
});

test("Ask mode in the sheet renders the tasks a turn proposed, and adds them", async ({ page }) => {
  await page.goto("/");
  await page.locator("[data-composer='button']").click();
  await page.locator("[data-composer='sheet'] [data-mode='ask']").click();
  await page.locator("[data-composer='input']").fill("[[propose-tasks]] remind me about the library");
  await page.locator("[data-composer='send']").click();

  const drafts = page.locator("[data-composer='sheet'] [data-proposal='tasks']");
  await expect(drafts.locator("[data-draft='0'] input[aria-label='Title']")).toHaveValue("Return the library books");
  await drafts.locator("[data-action='add']").click();
  await expect(page.getByText("Tasks added")).toBeVisible();
  await expect(drafts).toHaveCount(0);
});
