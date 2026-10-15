// Owns: the remaining sheet acceptance checks, with controlled extraction responses explicitly separated from real provider behavior.
// Failure behavior: writes only to the existing browser sandbox; held responses are released after assertions.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { SANDBOX } from "./setup";
import type { Page } from "@playwright/test";
test.use({ testIdAttribute: "data-ui" });
const input = (page: Page) => page.locator('[data-composer="input"]');
const sheet = (page: Page) => page.getByRole("dialog", { name: "Composer", exact: true });
const log = () => readFileSync(path.join(SANDBOX, "data/history/actions.jsonl"), "utf8");
const draft = (title: string) => ({ title, body: "", status: "todo", priority: 3, estimateMin: 30, due: null, scheduled: null, category: null, context: null, tags: [], links: [], repeat: null, repeatUntil: null, collection: null, inferred: ["estimateMin"] });
const extraction = (titles = ["Acceptance first", "Acceptance second", "Acceptance third"]) => ({ ok: true, result: { kind: "tasks", items: titles.map(draft) } });
async function open(page: Page) { await page.goto("/"); await page.getByRole("button", { name: "Open composer", exact: true }).click(); }

test("floating button geometry, sheet closing, draft reload and mode memory", async ({ page }, info) => {
  await open(page);
  const button = page.locator('[data-composer="button"]');
  const box = await button.evaluate(el => ({ x: (el as HTMLElement).offsetLeft, y: (el as HTMLElement).offsetTop, width: (el as HTMLElement).offsetWidth, height: (el as HTMLElement).offsetHeight }));
  expect(box.width).toBe(56); expect(box.height).toBe(56);
  expect(page.viewportSize()!.width - box.x - box.width).toBe(24);
  expect(page.viewportSize()!.height - box.y - box.height).toBe(24);
  expect(await button.evaluate(el => getComputedStyle(el).zIndex)).toBe("30");
  await expect(button).toHaveAttribute("aria-expanded", "true");
  await input(page).fill("Keep this local draft");
  await page.keyboard.press("Escape"); await expect(page.locator('[data-composer="button"]')).toHaveAttribute("aria-expanded", "false");
  await page.getByRole("button", { name: "Open composer", exact: true }).click();
  await expect(input(page)).toHaveValue("Keep this local draft");
  await page.mouse.click(20, 150); await expect(sheet(page)).toBeVisible();
  await sheet(page).locator('[data-mode="ask"]').click();
  await page.reload(); await page.getByRole("button", { name: "Open composer", exact: true }).click();
  await expect(input(page)).toHaveValue("Keep this local draft");
  await expect(sheet(page).locator('[data-mode="ask"]')).toHaveAttribute("aria-pressed", "true");
  await input(page).fill(""); await page.mouse.click(20, 150); await expect(page.locator('[data-composer="button"]')).toHaveAttribute("aria-expanded", "false");
  await page.getByRole("button", { name: "Open composer", exact: true }).click();
  await page.screenshot({ path: info.outputPath("composer-open.png") });
  await expect(sheet(page).getByRole("button", { name: "Close composer", exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.locator('[data-composer="button"]')).toHaveAttribute("aria-expanded", "false");
});

test("controlled extraction selects and adds one batch; Discard confirms without writing", async ({ page }) => {
  await page.route("**/api/agent/extract", route => route.fulfill({ json: extraction() }));
  await open(page); await input(page).fill("Controlled preview only"); await input(page).press("Enter");
  const cards = page.locator('[data-preview="tasks"]'); await expect(cards.locator('[data-draft]')).toHaveCount(3);
  await expect(cards.locator('[title="Inferred from: estimateMin"]').first()).toBeVisible();
  await cards.getByRole("checkbox").first().uncheck(); await expect(page.getByRole("button", { name: "Add selected", exact: true })).toBeVisible();
  await cards.getByRole("checkbox").first().check(); await expect(page.getByRole("button", { name: "Add all", exact: true })).toBeVisible();
  const before = log().split("\n").filter(Boolean).length;
  await page.getByRole("button", { name: "Add all", exact: true }).click();
  await expect(page.locator('[data-composer="button"]')).toHaveAttribute("aria-expanded", "false"); await expect(page.getByRole("link", { name: "Acceptance first", exact: true })).toBeVisible();
  expect(log().split("\n").filter(Boolean).length).toBe(before + 3);
  const entries = log().split("\n").filter(Boolean).map(line => JSON.parse(line));
  expect(new Set(entries.slice(-3).map(entry => entry.batch)).size).toBe(1);
  await page.getByRole("button", { name: "Open composer", exact: true }).click();
  await input(page).fill("Second controlled preview"); await input(page).press("Enter");
  await expect(cards.locator('[data-draft]')).toHaveCount(3); const saved = log();
  page.once("dialog", dialog => void dialog.dismiss()); await page.getByRole("button", { name: "Discard", exact: true }).click();
  await expect(cards.locator('[data-draft]')).toHaveCount(3);
  page.once("dialog", dialog => void dialog.accept()); await page.getByRole("button", { name: "Discard", exact: true }).click();
  await expect(cards).toHaveCount(0); expect(log()).toBe(saved);
});

test("cards stay editable during a held follow-up and retain edits the response did not change", async ({ page }) => {
  let release!: () => void; const held = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/agent/extract", async route => {
    const following = route.request().postDataJSON().followUp;
    if (following) await held;
    await route.fulfill({ json: extraction(["Acceptance editable"]) });
  });
  await open(page); await input(page).fill("First controlled preview"); await input(page).press("Enter");
  const title = page.locator('[data-draft="0"]').getByRole("textbox", { name: "Title", exact: true });
  await expect(title).toHaveValue("Acceptance editable");
  await input(page).fill("Follow up"); await input(page).press("Enter");
  await expect(input(page)).toBeDisabled();
  try { await expect(title).toBeEnabled(); await title.fill("Local edit during response"); }
  finally { release(); }
  await expect(input(page)).toBeEnabled(); await expect(input(page)).toHaveValue("");
  await expect(title).toHaveValue("Local edit during response");
});

test("auth failure toasts while secret Add refusal stays inline and preserves preview and original prompt", async ({ page }) => {
  let auth = true;
  await page.route("**/api/agent/extract", route => auth ? route.fulfill({ status: 401, json: { ok: false, code: "auth", error: "No API key set. Add one in Settings → API keys." } }) : route.fulfill({ json: extraction(["Acceptance refused"]) }));
  await open(page); await input(page).fill("Keep rejected request"); await input(page).press("Enter");
  await expect(page.getByText("No API key set. Add one in Settings → API keys.", { exact: false })).toBeVisible();
  await expect(sheet(page).getByRole("alert")).toHaveCount(0); await expect(input(page)).toHaveValue("Keep rejected request");
  auth = false; const secret = ["sk", "ant", "x".repeat(48)].join("-");
  await input(page).fill(secret); await input(page).press("Enter");
  await expect(page.locator('[data-draft="0"]')).toBeVisible(); const before = log();
  await page.getByRole("button", { name: "Add all", exact: true }).click();
  await expect(sheet(page).getByRole("alert")).toContainText("anthropic key");
  await expect(sheet(page).getByRole("alert")).not.toContainText(secret);
  await expect(page.locator('[data-draft="0"]')).toBeVisible();
  await expect(input(page)).toHaveValue(secret); expect(log()).toBe(before);
});

test("picker, window drop and clipboard image attach; removing a chip retains its file", async ({ page }) => {
  await open(page);
  const payload = { name: "acceptance-picker.txt", mimeType: "text/plain", buffer: Buffer.from("Picker acceptance fixture") };
  await page.locator('#composer-attach').setInputFiles(payload);
  const chip = page.locator('[data-attachment]').first(); await expect(chip).toContainText(payload.name);
  const stored = await chip.getAttribute("data-attachment"); await chip.getByRole("button", { name: `Remove ${payload.name}` }).click();
  expect(existsSync(path.join(SANDBOX, "data", stored!))).toBe(true); expect(log()).toContain('"type":"file.add"');
  await page.evaluate(() => {
    const transfer = new DataTransfer(); transfer.items.add(new File(["Drop acceptance fixture"], "acceptance-drop.txt", { type: "text/plain" }));
    window.dispatchEvent(new DragEvent("dragenter", { dataTransfer: transfer, bubbles: true }));
  });
  await expect(page.locator('[data-composer="drop"]')).toBeVisible();
  await page.locator('[data-composer="drop"]').evaluate(el => {
    const transfer = new DataTransfer(); transfer.items.add(new File(["Drop acceptance fixture"], "acceptance-drop.txt", { type: "text/plain" }));
    el.dispatchEvent(new DragEvent("drop", { dataTransfer: transfer, bubbles: true, cancelable: true }));
  });
  await expect(page.getByText("acceptance-drop.txt", { exact: true })).toBeVisible();
  await input(page).evaluate(el => {
    const bytes = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="), c => c.charCodeAt(0));
    const transfer = new DataTransfer(); transfer.items.add(new File([bytes], "acceptance-paste.png", { type: "image/png" }));
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true, cancelable: true }));
  });
  await expect(page.getByText("acceptance-paste.png", { exact: true })).toBeVisible();
  expect(await input(page).evaluate(el => {
    const transfer = new DataTransfer(); transfer.setData("text/plain", " pasted");
    return el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true, cancelable: true }));
  })).toBe(true); // Text paste is not intercepted as an attachment.
  await input(page).fill("Ordinary text"); await input(page).press("End"); await page.keyboard.insertText(" pasted");
  await expect(input(page)).toHaveValue("Ordinary text pasted"); await expect(page.locator('[data-attachment]')).toHaveCount(2);
});

test("Today Ask opens a real sheet conversation and reuses it within navigation session", async ({ page, request }) => {
  const date = (await (await request.get("/api/tasks")).json()).date;
  await request.post("/api/tasks", { data: { items: [{ title: "Acceptance Ask task", priority: 1, scheduled: date }] } });
  await page.goto("/");
  const ask = async () => { await page.getByRole("button", { name: "Actions for Acceptance Ask task", exact: true }).click(); await page.getByRole("menuitem", { name: "Ask about this", exact: true }).click(); };
  await ask(); await expect(sheet(page).locator('[data-mode="ask"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('[data-composer="context"]')).toContainText("Acceptance Ask task");
  await input(page).fill("First task question"); await input(page).press("Enter"); await expect(input(page)).toHaveValue("");
  const link = page.getByRole("link", { name: "Open in Chat", exact: true }); const href = await link.getAttribute("href");
  await link.click(); await expect(page).toHaveURL(new RegExp(href!.replace("?", "\\?")));
  await expect(page.locator('[data-message]')).toHaveCount(2);
  await page.getByRole("link", { name: "Today", exact: true }).click(); await ask();
  await input(page).fill("Second task question"); await input(page).press("Enter"); await expect(input(page)).toHaveValue("");
  await expect(page.getByRole("link", { name: "Open in Chat", exact: true })).toHaveAttribute("href", href!);
  await page.getByRole("link", { name: "Open in Chat", exact: true }).click(); await expect(page.locator('[data-message]')).toHaveCount(4);
});


test("Ask marker is legible in both themes and hovered toast still leaves", async ({ page, request }, info) => {
  const original = (await (await request.get("/api/settings")).json()).settings;
  try {
    await open(page); await sheet(page).locator('[data-mode="ask"]').click();
    await input(page).fill("[[propose-habit]] Acceptance sheet marker"); await input(page).press("Enter"); await expect(input(page)).toHaveValue("");
    const toast = page.getByRole("status").filter({ hasText: "Remembered in habits.md" }); await expect(toast).toContainText("Undo is under the reply");
    expect(await toast.locator("button, a").count()).toBe(0); const box = (await toast.boundingBox())!; await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    for (const name of ["light", "dark"]) {
      await request.put("/api/settings", { data: { ...original, theme: name } }); await page.evaluate(() => window.dispatchEvent(new Event("focus"))); await expect(page.locator("html")).toHaveAttribute("data-theme", name);
      await expect(page.locator('[data-composer="ask-panel"]').getByTestId("auto-applied")).toBeVisible();
      await page.screenshot({ path: info.outputPath(`ask-marker-${name}.png`) });
    }
    await expect(toast).toHaveCount(0);
  } finally { await request.put("/api/settings", { data: original }); }
});


test("controlled Tasks preview adds a collection without Today rows and renders a clarification question", async ({ page, request }) => {
  let question = false;
  await page.route("**/api/agent/extract", route => route.fulfill({ json: { ok: true, result: question ? { kind: "question", text: "Which edition should be read?" } : { kind: "collection", collection: "new:Acceptance preview list", items: ["Stalker", "Paris Texas", "Close-Up"] } } }));
  const ranked = (await (await request.get("/api/tasks")).json());
  await open(page); await input(page).fill("Controlled collection preview"); await input(page).press("Enter");
  const card = page.locator('[data-preview="collection"]'); await expect(card).toContainText("Stalker");
  const before = log().split("\n").filter(Boolean).length;
  await card.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.locator('[data-composer="button"]')).toHaveAttribute("aria-expanded", "false");
  const entries = log().split("\n").filter(Boolean).map(line => JSON.parse(line)); expect(entries.length).toBe(before + 1);
  const rel = entries.at(-1).targets.find((target: string) => target.startsWith("knowledge/collections/"));
  const bytes = readFileSync(path.join(SANDBOX, "data", rel), "utf8"); for (const title of ["Stalker", "Paris Texas", "Close-Up"]) expect(bytes).toContain(`- [ ] ${title}`);
  const after = (await (await request.get("/api/tasks")).json());
  for (const section of ["overdue", "focus", "alsoPossible", "doneToday"]) expect(after[section]).toEqual(ranked[section]);
  question = true; await page.getByRole("button", { name: "Open composer", exact: true }).click();
  await input(page).fill("Read a book"); await input(page).press("Enter"); await expect(page.locator('[data-preview="question"]')).toHaveText("Which edition should be read?");
  await expect(input(page)).toHaveAttribute("placeholder", "Answer, and send again");
});
