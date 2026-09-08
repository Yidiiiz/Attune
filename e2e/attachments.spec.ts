// The browser half of deferred amendment `o` — attachments on a chat message, from the paperclip to
// the provider and back.
//
// The refusal has two branches and only one of them can be reached from a browser today. **"This
// kind cannot be sent at all"** — anything that is not an image or a PDF — is refused for every
// model, and that is checked here. **"This model cannot read this kind"** needs a registry entry
// with `images: false` or `pdf: false`, and every model in `MODELS` currently allows both; that
// branch is `lib/agent/attachments.test.ts`, which asks it of a model the registry does not know.
// Naming which half is checked where is the point of writing this down.
//
// Uploads are real: they go through `POST /api/files/upload` into the sandbox's `data/files/`, so
// what these checks exercise is §9.2's actual write path and not a stub.

import { expect, test } from "@playwright/test";
import { assistant, messages, newConversation, say } from "./helpers";

test.use({ testIdAttribute: "data-ui" });

/** A one-pixel PNG, so an "image" is a real image without a fixture file on disk. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

test("a picture attaches, sends, and stays on the message", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await newConversation(page);

  await page
    .locator("#chat-attach")
    .setInputFiles({ name: "diagram.png", mimeType: "image/png", buffer: PNG });

  // §9.2: the upload happens immediately and the chip is the receipt, so the chip appearing is the
  // transition the attach produces — nothing else on this page can put one there.
  const chip = page.locator("[data-attachment]").first();
  await expect(chip).toContainText("diagram.png");

  await say(page, "what is in this picture?");
  await expect(page.locator("[data-ui='chat-input']")).toHaveValue("");
  await expect(assistant(page)).toHaveAttribute("data-status", "complete");

  // The path is on the message, not on the composer: §4.7 stores `data/`-relative paths, and
  // Decision 65 says they point into `data/files/` rather than at a conversation-local directory.
  const carried = messages(page).nth(0).locator("[data-ui='message-files'] [data-attachment]");
  await expect(carried).toHaveCount(1);
  await expect(carried).toHaveAttribute("data-attachment", /^files\/.*diagram\.png$/);

  // And the chips are spent, because this send landed.
  await expect(page.locator("[data-ui='composer'] [data-attachment]")).toHaveCount(0);

  await page.reload();
  await expect(
    messages(page).nth(0).locator("[data-ui='message-files'] [data-attachment]"),
  ).toHaveCount(1);
});

test("a file no message can carry is refused inline, and nothing is spent", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await newConversation(page);

  await page.locator("#chat-attach").setInputFiles({
    name: "notes.docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: Buffer.from("not really a docx"),
  });
  await expect(page.locator("[data-ui='composer'] [data-attachment]")).toContainText("notes.docx");

  await say(page, "summarise this for me");

  // §13.5: `unsupported` is not `auth` or `provider`, so the reason lands inline beside the box
  // rather than in a toast — and it names the file, because that is what someone can act on.
  const inline = page.locator("[data-ui='composer'] [data-ui='error']");
  await expect(inline).toContainText("notes.docx");

  // Decision 50, and §16.3's "rejected before any delta leaves nothing behind": the words are still
  // in the box, the chip is still there, and no message was written.
  await expect(page.locator("[data-ui='chat-input']")).toHaveValue("summarise this for me");
  await expect(page.locator("[data-ui='composer'] [data-attachment]")).toContainText("notes.docx");
  await expect(messages(page)).toHaveCount(0);

  await page.reload();
  await expect(messages(page)).toHaveCount(0);
});

test("a picture with no words is still a message", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await newConversation(page);

  // Send is disabled with an empty box and nothing attached; attaching alone is enough to enable it,
  // because "what is this?" is often the whole question.
  await expect(page.locator("[data-ui='send']")).toBeDisabled();
  await page
    .locator("#chat-attach")
    .setInputFiles({ name: "shot.png", mimeType: "image/png", buffer: PNG });
  await expect(page.locator("[data-ui='send']")).toBeEnabled();

  await page.locator("[data-ui='send']").click();
  await expect(assistant(page)).toHaveAttribute("data-status", "complete");
  await expect(
    messages(page).nth(0).locator("[data-ui='message-files'] [data-attachment]"),
  ).toHaveCount(1);
});
