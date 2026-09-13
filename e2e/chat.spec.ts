// The browser half of PROJECT.md §17 step (c) — linear chat — plus the two properties that only
// exist on a page: that a rejected send leaves the composer holding what was typed, and that a
// reply renders as markdown with its math and without whatever HTML it happened to contain.
//
// One spec file per §17 step letter: branching is `branching.spec.ts`. The split is the step
// letters' own, not a line count (AGENTS.md, Conventions), and it is what keeps `check:ui`
// selectively runnable if it ever passes Decision 67's five minutes.
//
// Every reply comes from `lib/agent/scripted.ts` — no key, no network, and the directives in the
// prompts are how a check asks for the failure it wants to see. The library half of the same list
// is `lib/agent/turn.test.ts`; these are the assertions that one cannot make.

import { expect, test } from "@playwright/test";
import { assistant, newConversation, say } from "./helpers";

// `data-ui` is the app's own hook convention (AGENTS.md); Playwright's default is `data-testid`.
test.use({ testIdAttribute: "data-ui" });

test("the + button is absent on Chat and present on Today and Calendar", async ({ page }) => {
  await page.goto("/chat");
  await expect(page.locator("[data-composer='button']")).toHaveCount(0);
  await page.goto("/");
  await expect(page.locator("[data-composer='button']")).toHaveCount(1);
  await page.goto("/calendar");
  await expect(page.locator("[data-composer='button']")).toHaveCount(1);
});

test("a send streams, finishes, renders markdown, and names the conversation", async ({ page }) => {
  await newConversation(page);
  await say(page, "why is the matrix transposed?");

  // The pair appears before the reply does: the ids were minted on the client (§16.2).
  await expect(page.locator("[data-message][data-role='user']")).toHaveText(/why is the matrix/);
  await expect(assistant(page)).toHaveAttribute("data-status", "streaming");

  await expect(assistant(page)).toHaveAttribute("data-status", "complete");
  // Markdown only once complete (§16.3): the scripted reply carries `**scripted provider**`.
  await expect(assistant(page).locator("strong")).toHaveText("scripted provider");
  await expect(page.locator("[data-ui='chats-panel']")).toContainText("why is the matrix transposed?");

  // The composer emptied, because this send landed.
  await expect(page.locator("[data-ui='chat-input']")).toHaveValue("");
});

test("a reply's HTML is sanitized and its math is rendered", async ({ page }) => {
  await newConversation(page);
  await say(page, "<img src=x onerror=\"window.__pwned=1\"> and $E = mc^2$ please");
  await expect(assistant(page)).toHaveAttribute("data-status", "complete");

  // The equation renders — the markdown parser never saw `^2`, because the pre-pass took it first.
  await expect(assistant(page).locator(".katex").first()).toBeVisible();

  // Sanitizing is about the handler, not the tag: DOMPurify keeps `<img>` and removes `onerror`,
  // so the check is that nothing ran, not that the element is gone.
  await expect(assistant(page).locator("img[onerror]")).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
});

test("a rejected key toasts, leaves no message, and keeps the typed text", async ({ page }) => {
  await newConversation(page);
  await say(page, "[[auth]] what is on today?");

  // §13.5: the remedy is the Settings screen, so this is a toast and not an inline message.
  await expect(page.getByText(/API key was rejected/i)).toBeVisible();
  await expect(page.locator("[data-message]")).toHaveCount(0);
  // §15: the composer keeps the text.
  await expect(page.locator("[data-ui='chat-input']")).toHaveValue("[[auth]] what is on today?");

  await page.reload();
  await expect(page.locator("[data-message]")).toHaveCount(0);
});

test("a failure after deltas leaves a failed message with a Retry, and Retry answers", async ({ page }) => {
  await newConversation(page);
  // `[[fail-once]]` rather than `[[fail-late]]`: a regenerate replays the same prompt, so a
  // directive that always fails could only ever show that Retry fails too.
  await say(page, "[[fail-once]] tell me about it");

  await expect(assistant(page)).toHaveAttribute("data-status", "failed");
  await expect(assistant(page)).toContainText(/fail once/);
  await expect(assistant(page).locator("[data-ui='error']")).toBeVisible();

  // §15: failed, never complete — and it survives a reload, because it was committed.
  await page.reload();
  await expect(assistant(page)).toHaveAttribute("data-status", "failed");

  await page.getByRole("button", { name: "Retry" }).last().click();
  await expect(assistant(page)).toHaveAttribute("data-status", "complete");
});

// A known flake: about one run in five the pane shows the pre-send view, or a reply stuck at
// `streaming`, while disk holds the stopped reply (AGENTS.md, amendment `u`, display-only). It runs
// on its own after the rest and does not set `check:ui`'s exit code (`playwright.config.ts`). The tag
// comes off when `u` closes.
test("Stop leaves the partial reply, marked stopped", { tag: "@known-flake" }, async ({ page }) => {
  await newConversation(page);
  await say(page, "[[slow]] keep going for a while");

  await expect(assistant(page)).toContainText(/You asked/);
  await page.locator("[data-ui='stop']").click();

  await expect(assistant(page)).toHaveAttribute("data-status", "failed");
  await expect(assistant(page)).toContainText("Stopped.");
  await expect(assistant(page)).toContainText(/You asked/); // the partial text is kept (§16.3)
});

test("navigating away mid-stream ends the turn rather than leaving it running", async ({ page }) => {
  await newConversation(page);
  const url = page.url();
  await say(page, "[[slow]] a long answer");
  await expect(assistant(page)).toContainText(/You asked/);

  // Unmounting aborts the request, which aborts the provider, which clears the server's buffer.
  await page.goto("/");
  await expect(page.locator("[data-composer='button']")).toBeVisible();
  await page.goto(url);

  // Nothing is left half-written: the turn ended one way or the other. Reloading is how a page
  // that is not holding the stream finds out, so the poll re-reads rather than waiting on a timer.
  await expect
    .poll(async () => {
      await page.reload();
      return assistant(page).getAttribute("data-status");
    }, { timeout: 20_000 })
    .not.toBe("streaming");

  // And it ended as a stop rather than as a completed answer: the request was aborted when the
  // component unmounted, which is what also clears the server's buffer (§16.8).
  await expect(assistant(page)).toHaveAttribute("data-status", "failed");
});

test("a credential in a message is refused inline, with every character kept", async ({ page }) => {
  await newConversation(page);
  // Assembled at runtime, like `lib/security/secrets.test.ts` does: a check for the refusal must
  // not itself be a file the pre-commit hook refuses (§11.5, and the hard rule that the two sides
  // share one pattern set).
  const secret = `my key is ${"sk" + "-ant-" + "a".repeat(40)} ok?`;
  await say(page, secret);

  // §13.5 and Decision 50: the text is on screen, so the message is too — inline, above the box.
  const inline = page.locator("[data-ui='composer'] [data-ui='error']");
  await expect(inline).toBeVisible();
  await expect(inline).toContainText(/credential/i);
  await expect(inline).not.toContainText(secret.slice(10, 30));
  await expect(page.locator("[data-ui='chat-input']")).toHaveValue(secret);
  await expect(page.locator("[data-message]")).toHaveCount(0);
});

test("a conversation can be renamed, pinned and deleted from the panel", async ({ page }) => {
  await newConversation(page);
  await say(page, "something to name");
  await expect(assistant(page)).toHaveAttribute("data-status", "complete");

  const row = page.locator("[data-ui='chats-panel'] [data-conversation]").first();
  await row.getByRole("button", { name: /Actions for/ }).click();
  await page.getByRole("button", { name: "Rename" }).click();
  await page.getByTestId("rename-input").fill("Change of basis");
  await page.getByTestId("rename-input").press("Enter");
  await expect(page.locator("[data-ui='chats-panel']")).toContainText("Change of basis");

  await row.getByRole("button", { name: /Actions for/ }).click();
  await page.getByRole("button", { name: "Pin" }).click();
  await expect(page.locator("[data-ui='chats-panel']")).toContainText("Pinned");

  page.once("dialog", (dialog) => void dialog.accept());
  await row.getByRole("button", { name: /Actions for/ }).click();
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page.locator("[data-ui='chats-panel']")).not.toContainText("Change of basis");
});
