// Owns: the things every chat spec does before it can check anything — start a conversation, say
// something, name the reply, and complete a turn. Extracted when the second spec file appeared
// rather than copied into it: a helper that says `[data-ui='send']` in three files is three places
// to fix when the hook changes, and the hooks are the one part of these checks that is not about
// behaviour.
//
// **`exchange` and `reprompt` wait on a box emptying, never on a reply completing**, and that is
// the rule in AGENTS.md Conventions rather than a preference. "The newest assistant message is
// complete" is already true of the *previous* turn, so a check waiting on it passes before the new
// one has rendered and then reads stale ids. A composer clears and an editor closes only once
// `send` has resolved without a failure, which is after `finalizeTurn` wrote and the conversation
// was re-read — a transition only the action under test can produce.
//
// Failure behavior: each of these waits on the observable consequence and lets Playwright's own
// timeout be the failure guard (AGENTS.md, Conventions: timers are never correctness).

import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";

/** Start a conversation and land on its page. */
export async function newConversation(page: Page): Promise<void> {
  await page.goto("/chat");
  await page.getByTestId("new-chat").click();
  await expect(page.locator("[data-ui='conversation']")).toBeVisible();
}

/** Type into the docked composer and send. */
export async function say(page: Page, text: string): Promise<void> {
  await page.locator("[data-ui='chat-input']").fill(text);
  await page.locator("[data-ui='send']").click();
}

/** The newest assistant message on the active path. */
export const assistant = (page: Page) =>
  page.locator("[data-message][data-role='assistant']").last();

/** Every message on the active path, in order — what `activePath` produced, as rendered. */
export const messages = (page: Page) => page.locator("[data-message]");

/** Open one message's `⋯` menu and choose an entry by its label. */
export async function chooseAction(page: Page, message: string, label: string): Promise<void> {
  const row = page.locator(`[data-message='${message}']`);
  await row.locator("[data-ui='message-menu-button']").click();
  await row.locator("[data-ui='message-menu']").getByRole("button", { name: label, exact: true }).click();
}

/** The id of the nth message on the path, which is how a check names a row it did not create. */
export async function idOf(page: Page, nth: number): Promise<string> {
  const value = await messages(page).nth(nth).getAttribute("data-message");
  expect(value).not.toBeNull();
  return value as string;
}

/** Send from the docked composer, and wait for the turn to land. */
export async function exchange(page: Page, text: string): Promise<void> {
  await say(page, text);
  await expect(page.locator("[data-ui='chat-input']")).toHaveValue("");
  await expect(assistant(page)).toHaveAttribute("data-status", "complete");
}

/** Open the editor on a message, type, and send — the shape of edit and of branch-from-here. */
export async function reprompt(page: Page, messageId: string, label: string, text: string): Promise<void> {
  await chooseAction(page, messageId, label);
  await page.locator("[data-ui='editor-input']").fill(text);
  await page.locator("[data-ui='editor-send']").click();
  await expect(page.locator("[data-ui='message-editor']")).toHaveCount(0);
  await expect(assistant(page)).toHaveAttribute("data-status", "complete");
}
