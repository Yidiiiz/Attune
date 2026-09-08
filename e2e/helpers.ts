// Owns: the three things every chat spec does before it can check anything — start a conversation,
// say something, and name the reply. Extracted when the second spec file appeared rather than
// copied into it: a helper that says `[data-ui='send']` in two files is two places to fix when the
// hook changes, and the hooks are the one part of these checks that is not about behaviour.
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
