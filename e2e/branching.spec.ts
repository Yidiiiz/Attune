// The browser half of PROJECT.md §17 step (d) — branching. Three of §15's items live here: a
// conversation with three branches produces one commit per finalized turn, branching from the first
// message works, and the tree the sidebar will read is the one on screen.
//
// Every reply comes from `lib/agent/scripted.ts` — no key, no network. The library half of the same
// list is `lib/agent/turn.test.ts`; these are the assertions that one cannot make, because they are
// about what a fork looks like to someone clicking on it.
//
// The commit check reads the sandbox's git log directly. That is the only way to answer "one commit
// per finalized turn": the count is a claim about `git log` (`e2e/setup.ts` says so), and no page
// renders it.

import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { SANDBOX } from "./setup";
import { assistant, chooseAction, idOf, messages, newConversation, say } from "./helpers";

test.use({ testIdAttribute: "data-ui" });

/** Commits touching one conversation's directory, newest first. */
function commitsFor(conversationId: string): string[] {
  const out = execFileSync("git", ["log", "--oneline", "--", `data/chats/${conversationId}`], {
    cwd: SANDBOX,
    encoding: "utf8",
  });
  return out.split("\n").filter((line) => line.trim().length > 0);
}

// Both helpers below wait on a box emptying rather than on a reply completing, and the difference
// matters in a branching spec: "the newest assistant message is complete" is already true of the
// *previous* turn, so it passes before the new one has rendered and the next line reads stale ids.
// The composer clears and the editor closes only when `send` resolved without a failure, which is
// after `finalizeTurn` has written and the conversation has been re-read.

/** Send from the docked composer, and wait for the turn to land. */
async function exchange(page: Page, text: string): Promise<void> {
  await say(page, text);
  await expect(page.locator("[data-ui='chat-input']")).toHaveValue("");
  await expect(assistant(page)).toHaveAttribute("data-status", "complete");
}

/** Open the editor on a message, type, and send — the shape of edit and of branch-from-here. */
async function reprompt(page: Page, messageId: string, label: string, text: string): Promise<void> {
  await chooseAction(page, messageId, label);
  await page.locator("[data-ui='editor-input']").fill(text);
  await page.locator("[data-ui='editor-send']").click();
  await expect(page.locator("[data-ui='message-editor']")).toHaveCount(0);
  await expect(assistant(page)).toHaveAttribute("data-status", "complete");
}

test("editing a prompt makes a sibling and leaves the original where it was", async ({ page }) => {
  await newConversation(page);
  await exchange(page, "what is a change of basis?");

  const original = await idOf(page, 0);
  await reprompt(page, original, "Edit and resend", "what is an eigenvector?");

  // The path now shows the edited prompt, and it is a *different* message: the original was not
  // rewritten in place (§16.2 — a message that was said is a fact).
  const replacement = await idOf(page, 0);
  expect(replacement).not.toBe(original);
  await expect(messages(page).nth(0)).toContainText("what is an eigenvector?");

  // Two branches at the root, and the bar says which one is open.
  await expect(messages(page).nth(0).locator("[data-ui='branch-position']")).toHaveText("2/2");

  // The original is still on disk and reachable: switch back and it reads exactly as it did.
  await messages(page).nth(0).locator("[data-ui='branch-prev']").click();
  await expect(messages(page).nth(0)).toContainText("what is a change of basis?");
  expect(await idOf(page, 0)).toBe(original);
});

test("regenerating makes a reply sibling under the same prompt", async ({ page }) => {
  await newConversation(page);
  await exchange(page, "say something");

  const prompt = await idOf(page, 0);
  const first = await idOf(page, 1);
  await chooseAction(page, first, "Regenerate");

  // Regenerate has no box to empty, so the branch bar appearing is the signal that the second reply
  // exists — a retrying assertion, and the ids below are only read once it holds. Waiting on "the
  // newest reply is complete" instead would pass on the *first* reply, which already is.
  await expect(messages(page).nth(1).locator("[data-ui='branch-position']")).toHaveText("2/2");
  await expect(assistant(page)).toHaveAttribute("data-status", "complete");

  // The prompt did not move; the reply did, and there are two of them now.
  expect(await idOf(page, 0)).toBe(prompt);
  expect(await idOf(page, 1)).not.toBe(first);
  await expect(messages(page)).toHaveCount(2); // one path, not both replies at once
});

test("branch from here forks the tail and switching walks back to it", async ({ page }) => {
  await newConversation(page);
  await exchange(page, "first question");
  await exchange(page, "second question");
  await expect(messages(page)).toHaveCount(4);

  // Fork at the first reply: a different second question, with the first exchange still in front.
  const firstReply = await idOf(page, 1);
  await reprompt(page, firstReply, "Branch from here", "a different second question");

  await expect(messages(page)).toHaveCount(4);
  await expect(messages(page).nth(0)).toContainText("first question");
  await expect(messages(page).nth(2)).toContainText("a different second question");

  // The fork is at position 2 of 2 under the first reply; going back shows the original tail.
  await expect(messages(page).nth(2).locator("[data-ui='branch-position']")).toHaveText("2/2");
  await messages(page).nth(2).locator("[data-ui='branch-prev']").click();
  await expect(messages(page).nth(2)).toContainText("second question");

  // And the switch is durable: it is `activeLeafId` on disk, not a local toggle (§16.2).
  await page.reload();
  await expect(messages(page).nth(2)).toContainText("second question");
});

test("branching from the first message makes a second root", async ({ page }) => {
  await newConversation(page);
  await exchange(page, "the original opening");

  const root = await idOf(page, 0);
  await reprompt(page, root, "Edit and resend", "a different opening");

  // §15: the new root is a sibling — the path starts at it, and the bar at position 0 says 2/2,
  // which is only true if `buildTree` put both under `null` rather than promoting one.
  await expect(messages(page).nth(0)).toContainText("a different opening");
  await expect(messages(page).nth(0).locator("[data-ui='branch-position']")).toHaveText("2/2");
  await expect(messages(page)).toHaveCount(2);
});

test("three branches produce one commit per finalized turn", async ({ page }) => {
  await newConversation(page);
  const conversationId = await page
    .locator("[data-ui='conversation']")
    .getAttribute("data-conversation");
  expect(conversationId).not.toBeNull();
  const id = conversationId as string;

  const before = commitsFor(id).length; // the `chat.create` that started it

  await exchange(page, "branch one");
  await reprompt(page, await idOf(page, 0), "Edit and resend", "branch two");
  await reprompt(page, await idOf(page, 0), "Edit and resend", "branch three");

  // §15, and §16.3's "commit both files as one `chat.message` batch": three finalized turns are
  // three commits, not six. Branch switches are `chat.update` commits and touch the same directory,
  // so what is counted is the turns' own summaries rather than every commit in the range.
  const turns = commitsFor(id).filter((line) => / Reply in /.test(line));
  expect(turns).toHaveLength(3);
  expect(commitsFor(id).length).toBeGreaterThan(before);
});

test("deleting a message with replies under it is refused, and it stays on screen", async ({ page }) => {
  await newConversation(page);
  await exchange(page, "a prompt with a reply under it");

  const prompt = await idOf(page, 0);
  await chooseAction(page, prompt, "Delete");

  // §16.2 refuses it: a soft delete would hide a message its descendants hang from. The row menu
  // has no on-screen origin of its own, so §13.5 puts the reason in a toast.
  await expect(page.getByText(/replies under it/i)).toBeVisible();
  await expect(page.locator(`[data-message='${prompt}']`)).toBeVisible();
  await page.reload();
  await expect(page.locator(`[data-message='${prompt}']`)).toBeVisible();
});
