// The browser half of PROJECT.md §17 step (f) — annotations, quote replies and read aloud.
//
// This is the step Phase 6a's plan named as the reason to add a browser at all: §16.4's cards are
// collision-pushed and aligned to `getClientRects()[0]`, and there is no price at which that is
// verifiable without a layout engine. The resolution half is unit-tested (`lib/chat/anchoring.ts`,
// `lib/chat/text-match.ts`, `lib/chat/annotations.ts`); what is here is everything that needs a
// rectangle.
//
// Read aloud gets the assertion its approval asked for and no more: the control is there, it
// changes state, and it is *absent* when the browser has no speech synthesis. Whether sound came
// out is `docs/CHECKLIST.md`'s row, named there rather than pretended at here.
//
// Every wait is on a transition the action produces (AGENTS.md, Conventions): a card appearing, a
// count changing, a tray opening. Never on "the reply is complete", which is already true.

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { exchange, idOf, messages, newConversation } from "./helpers";

test.use({ testIdAttribute: "data-ui" });

const WIDE = { width: 1500, height: 900 };

/** Select some words inside a message, the way a pointer drag would. */
async function selectInside(page: Page, messageId: string, phrase: string): Promise<void> {
  await page.evaluate(
    ({ id, needle }) => {
      const row = document.querySelector(`[data-message='${id}']`);
      if (row === null) throw new Error(`no message ${id}`);
      const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode() as Text | null;
      while (node !== null) {
        const at = node.data.indexOf(needle);
        if (at !== -1) {
          const range = document.createRange();
          range.setStart(node, at);
          range.setEnd(node, at + needle.length);
          const selection = window.getSelection();
          selection?.removeAllRanges();
          selection?.addRange(range);
          return;
        }
        node = walker.nextNode() as Text | null;
      }
      throw new Error(`"${needle}" is not in message ${id}`);
    },
    { id: messageId, needle: phrase },
  );
}

/** Annotate a selection inside a message and save the note. */
async function annotate(page: Page, messageId: string, phrase: string, text: string): Promise<void> {
  await selectInside(page, messageId, phrase);
  const row = page.locator(`[data-message='${messageId}']`);
  await row.locator("[data-ui='message-menu-button']").click();
  await row.locator("[data-ui='message-menu']").getByRole("button", { name: "Annotate selection" }).click();
  await page.locator("[data-ui='annotation-input']").fill(text);
  await page.locator("[data-ui='annotation-save']").click();
  // The composer closes only when the POST succeeded and the conversation was re-read.
  await expect(page.locator("[data-ui='annotation-composer']")).toHaveCount(0);
}

test("a note on a selection becomes a card beside the message it is about", async ({ page }) => {
  await page.setViewportSize(WIDE);
  await newConversation(page);
  await exchange(page, "what is a change of basis?");

  // No gutter until there is something to put in one: it would take width from the message column
  // to draw nothing (§16.5's cascade, and Decision 66's reason for counting what is not drawn).
  await expect(page.locator("[data-ui='gutter']")).toHaveCount(0);

  const prompt = await idOf(page, 0);
  await annotate(page, prompt, "change of basis", "look this up properly");

  const card = page.locator("[data-ui='annotation']");
  await expect(card).toHaveCount(1);
  await expect(card).toContainText("look this up properly");
  await expect(card).toContainText("change of basis"); // the quotation it is anchored to
  await expect(card).not.toHaveAttribute("data-moved", "true"); // the anchor resolved

  // And it survives a reload: an annotation is a file, not a thing the page is holding.
  await page.reload();
  await expect(page.locator("[data-ui='annotation']")).toContainText("look this up properly");
});

test("two notes on the same message do not overlap", async ({ page }) => {
  await page.setViewportSize(WIDE);
  await newConversation(page);
  await exchange(page, "one two three four five six seven eight nine ten");

  const prompt = await idOf(page, 0);
  await annotate(page, prompt, "two three", "the first note");
  await annotate(page, prompt, "eight nine", "the second note");

  const cards = page.locator("[data-ui='annotation']");
  await expect(cards).toHaveCount(2);

  // §16.4's only stacking rule, and the reason this file needs a layout engine: sorted by anchor y,
  // pushed down on collision. Two anchors a few words apart resolve to the same line, so the second
  // card can only be clear of the first by having been pushed.
  const boxes = await cards.evaluateAll((nodes) =>
    nodes.map((node) => node.getBoundingClientRect()).sort((a, b) => a.top - b.top),
  );
  expect(boxes).toHaveLength(2);
  expect(boxes[1].top).toBeGreaterThanOrEqual(boxes[0].bottom);
});

test("a note whose quotation is gone says so rather than moving", async ({ page }) => {
  await page.setViewportSize(WIDE);
  await newConversation(page);
  await exchange(page, "the quotable sentence");

  const reply = await idOf(page, 1);
  await annotate(page, reply, "scripted provider", "about the provider");
  await expect(page.locator("[data-ui='annotation']")).toHaveCount(1);

  // Regenerate under the same prompt: the annotation still names the old reply, which is now on a
  // branch that is not open. §16.4 refuses to let that be silent, so it is a count in the header.
  await page.locator(`[data-message='${reply}'] [data-ui='message-menu-button']`).click();
  await page
    .locator(`[data-message='${reply}'] [data-ui='message-menu']`)
    .getByRole("button", { name: "Regenerate" })
    .click();

  // Wait for the turn to *finalize*, not merely to appear. The branch bar and the off-path count
  // are both true of the optimistic state the moment Regenerate is pressed, and switching branches
  // before `finalizeTurn` has written means the turn's own leaf write lands afterwards and undoes
  // the switch. That is the server behaving correctly — the turn owns the leaf until it is done —
  // and a check that races it is measuring the machine's speed.
  await expect(messages(page).nth(1).locator("[data-ui='branch-position']")).toHaveText("2/2");
  await expect(messages(page).nth(1)).toHaveAttribute("data-status", "complete");

  await expect(page.locator("[data-ui='off-path-count']")).toContainText("1 note on other branches");
  await expect(page.locator("[data-ui='annotation']")).toHaveCount(0);

  // And clicking the count goes to the branch the note is on, where the card is drawn again.
  await page.locator("[data-ui='off-path-count']").click();
  await expect(page.locator("[data-ui='annotation']")).toHaveCount(1);
});

test("a removed note goes to the restore tray and comes back from it", async ({ page }) => {
  await page.setViewportSize(WIDE);
  await newConversation(page);
  await exchange(page, "something worth a note");

  const prompt = await idOf(page, 0);
  await annotate(page, prompt, "worth a note", "remove me");
  await page.locator("[data-ui='annotation-remove']").click();

  // §16.4: soft delete, so it leaves the gutter and appears in the tray rather than ceasing to be.
  await expect(page.locator("[data-ui='annotation']")).toHaveCount(0);
  await page.locator("[data-ui='trays-toggle']").click();
  const tray = page.locator("[data-ui='restore-tray']");
  await expect(tray).toContainText("remove me");

  await tray.locator("[data-ui='annotation-restore']").click();
  await expect(page.locator("[data-ui='annotation']")).toContainText("remove me");
});

test("a quote reply names the message it answers and jumps to it", async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 380 }); // short, so there is somewhere to scroll
  await newConversation(page);
  await exchange(page, "the sentence being quoted later");

  // §16.6 recognises this from the data alone: a leading blockquote whose text is in an earlier
  // message. Nothing is stored to mark it, which is why a typed one works.
  await exchange(page, "> the sentence being quoted later\n\nand my follow-up question");

  const bar = page.locator("[data-ui='quote-bar']").last();
  await expect(bar).toContainText("the sentence being quoted later");

  // §16.6 says *nearest* earlier message, not first, and this conversation is the case that tells
  // the two apart: the scripted reply echoes the prompt back, so both contain the quotation and the
  // reply is the nearer one. A conversation that circles back to a phrase means the recent one.
  await expect(bar).toHaveAttribute("data-quote-source", await idOf(page, 1));

  // Two more turns, so the source is well above the fold and the jump has somewhere to go.
  await exchange(page, "an unrelated follow-up");
  await exchange(page, "and another one");

  const scroller = page.locator("[data-ui='messages']");
  const before = await scroller.evaluate((el) => el.scrollTop);
  expect(before).toBeGreaterThan(0);

  await page.locator("[data-ui='quote-bar']").first().click();
  await expect(messages(page).nth(1)).toBeInViewport();
  expect(await scroller.evaluate((el) => el.scrollTop)).toBeLessThan(before);
});

test("a conversation with no quote replies mounts no bars at all", async ({ page }) => {
  await page.setViewportSize(WIDE);
  await newConversation(page);
  await exchange(page, "an ordinary question with no blockquote");
  // §16.6: the feature unmounts entirely when the path has none, which is the majority case.
  await expect(page.locator("[data-ui='quote-bar']")).toHaveCount(0);
});

test("read aloud is offered, changes state, and is absent when the browser cannot speak", async ({
  page,
}) => {
  await page.setViewportSize(WIDE);
  await newConversation(page);
  await exchange(page, "read this back to me");

  const button = page.locator("[data-ui='read-aloud']").last();
  await expect(button).toBeVisible();
  await button.click();
  // The observable half. Whether sound came out is docs/CHECKLIST.md 6b.5, named rather than faked.
  await expect(button).toHaveAttribute("data-speaking", "true");
  await button.click();
  await expect(button).not.toHaveAttribute("data-speaking", "true");
});

test("read aloud renders nothing where speechSynthesis is missing", async ({ browser }) => {
  const context = await browser.newContext({ viewport: WIDE });
  // Removed before any script runs, so the component sees the browser it will actually live in.
  await context.addInitScript(() => {
    Object.defineProperty(window, "speechSynthesis", { get: () => undefined, configurable: true });
  });
  const page = await context.newPage();

  await newConversation(page);
  await exchange(page, "nothing should offer to read this");
  await expect(messages(page)).toHaveCount(2); // the conversation itself is unaffected
  await expect(page.locator("[data-ui='read-aloud']")).toHaveCount(0);

  await context.close();
});
