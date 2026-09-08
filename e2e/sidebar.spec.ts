// The browser half of PROJECT.md §17 step (e) — the sidebar, the conversation header's model
// selector, and the context debug view.
//
// The arithmetic of §16.5's width cascade is a unit test (`lib/chat/pane-layout.test.ts`), and so
// is the current-message rule (`lib/chat/current-message.test.ts`). What is left for a browser is
// what those two cannot claim: that the numbers are wired to a real `ResizeObserver` and a real
// scroller, that the mode actually flips when a window narrows, and that a branch section in the
// sidebar switches the same `activeLeafId` the branch bar does.
//
// Every wait here is on a transition the action under test produces — a mode attribute changing, a
// count arriving, a select holding a value it did not hold before (AGENTS.md, Conventions).

import { expect, test } from "@playwright/test";
import { exchange, idOf, messages, newConversation, reprompt } from "./helpers";

test.use({ testIdAttribute: "data-ui" });

/** Wide enough for the full sidebar: 640 message column + 280 sidebar, past the rail and panel. */
const WIDE = { width: 1400, height: 900 };
/** Narrow enough that the column cannot keep its 640 beside a full sidebar. */
const NARROW = { width: 860, height: 900 };

test("the sidebar lists one entry per exchange and marks the one being read", async ({ page }) => {
  await page.setViewportSize(WIDE);
  await newConversation(page);
  await exchange(page, "first question");
  await exchange(page, "second question");

  const entries = page.locator("[data-ui='sidebar-entry']");
  await expect(entries).toHaveCount(2); // two exchanges, four messages
  await expect(entries.nth(0)).toContainText("first question");
  await expect(entries.nth(1)).toContainText("second question");

  // §16.5's bottom exception: the conversation is parked at its end, so the newest exchange is the
  // current one. Nothing was scrolled, which is what makes this the exception rather than the rule.
  await expect(entries.nth(1)).toHaveAttribute("aria-current", "true");
  await expect(entries.nth(0)).not.toHaveAttribute("aria-current", "true");
});

test("clicking a sidebar entry brings that message into view", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 420 }); // short, so there is somewhere to scroll
  await newConversation(page);
  await exchange(page, "the first thing said");
  await exchange(page, "the second thing said");
  await exchange(page, "the third thing said");

  const first = messages(page).nth(0);
  await expect(first).not.toBeInViewport(); // scrolled off by three exchanges

  await page.locator("[data-ui='sidebar-entry']").nth(0).click();
  await expect(first).toBeInViewport();
});

test("a branch point becomes a section, and its alternatives switch the branch", async ({ page }) => {
  await page.setViewportSize(WIDE);
  await newConversation(page);
  await exchange(page, "the original opening");
  await reprompt(page, await idOf(page, 0), "Edit and resend", "a different opening");

  // §16.5: the pair whose prompt has siblings shows its own number and lists only the others.
  await expect(page.locator("[data-ui='sidebar-branch-of']")).toHaveText("2 of 2");
  const alternatives = page.locator("[data-ui='sidebar-branch']");
  await expect(alternatives).toHaveCount(1);
  await expect(alternatives.nth(0)).toContainText("the original opening");

  await alternatives.nth(0).click();
  // The switch is `activeLeafId`, the same write the branch bar makes: the path changes under it.
  await expect(messages(page).nth(0)).toContainText("the original opening");
  await expect(page.locator("[data-ui='sidebar-branch']")).toContainText("a different opening");
});

test("the sidebar drops to a strip when the message column cannot keep its width", async ({ page }) => {
  await page.setViewportSize(WIDE);
  await newConversation(page);
  await exchange(page, "something to outline");

  const sidebar = page.locator("[data-ui='sidebar']");
  await expect(sidebar).toHaveAttribute("data-mode", "full");
  await expect(page.locator("[data-ui='sidebar-list']")).toBeVisible();

  await page.setViewportSize(NARROW);
  // The transition the resize produces, and the whole of what §16.5 asks a browser to confirm:
  // the mode comes from available width, through a ResizeObserver, and not from anything else.
  await expect(sidebar).toHaveAttribute("data-mode", "strip");
  await expect(page.locator("[data-ui='sidebar-strip']")).toBeVisible();
  await expect(page.locator("[data-ui='sidebar-list']")).toHaveCount(0);

  await page.setViewportSize(WIDE);
  await expect(sidebar).toHaveAttribute("data-mode", "full");
});

test("the model selector changes the conversation's model, and it survives a reload", async ({ page }) => {
  await page.setViewportSize(WIDE);
  await newConversation(page);

  const select = page.locator("[data-ui='model-select']");
  const before = await select.inputValue();
  const other = await select
    .locator(`option:not([value='${before}'])`)
    .first()
    .getAttribute("value");
  expect(other).not.toBeNull();

  await select.selectOption(other as string);
  // The select is controlled by the conversation, so it holds the new value only once the PATCH
  // succeeded and the conversation was re-read — a transition the change alone cannot fake.
  await expect(select).toHaveValue(other as string);

  await page.reload();
  await expect(page.locator("[data-ui='model-select']")).toHaveValue(other as string);
});

test("the context view shows the blocks the next turn would send", async ({ page }) => {
  await page.setViewportSize(WIDE);
  await newConversation(page);

  await expect(page.locator("[data-ui='context-view']")).toHaveCount(0);
  await page.locator("[data-ui='context-toggle']").click();

  // Waiting on a block rather than on the total: the total renders as ~0 before the request lands,
  // so it is true before the action and says nothing (AGENTS.md, Conventions).
  const blocks = page.locator("[data-ui='context-view'] details");
  await expect(blocks.first()).toBeVisible();
  await expect(page.locator("[data-ui='context-total']")).toContainText(/~[1-9]\d* tokens/);

  await page.locator("[data-ui='context-toggle']").click();
  await expect(page.locator("[data-ui='context-view']")).toHaveCount(0);
});
