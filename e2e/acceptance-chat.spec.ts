// Owns: remaining chat rail, composer, branch/menu/annotation and scrolling acceptance.
// Failure behavior: uses scripted answers and isolated files; screenshots do not claim audible speech or model understanding.
import { execFileSync } from "node:child_process";
import { SANDBOX } from "./setup";
import { expect, test } from "@playwright/test";
import { assistant, chooseAction, exchange, idOf, messages, newConversation, reprompt, say } from "./helpers";
import type { APIRequestContext, Page } from "@playwright/test";
test.use({ testIdAttribute: "data-ui" });
async function theme(request: APIRequestContext, name: string) { const current = (await (await request.get("/api/settings")).json()).settings; await request.put("/api/settings", { data: { ...current, theme: name } }); }
let original: unknown;
test.beforeEach(async ({ request }) => { original = (await (await request.get("/api/settings")).json()).settings; });
test.afterEach(async ({ request }) => { await request.put("/api/settings", { data: original }); });
async function select(page: Page, id: string, phrase: string) {
  await page.evaluate(({ id, phrase }) => {
    const walker = document.createTreeWalker(document.querySelector(`[data-message="${id}"]`)!, NodeFilter.SHOW_TEXT);
    let text: Text | null;
    while ((text = walker.nextNode() as Text | null)) {
      const at = text.data.indexOf(phrase); if (at < 0) continue;
      const range = document.createRange(); range.setStart(text, at); range.setEnd(text, at + phrase.length);
      window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range); return;
    }
    throw new Error("Selection phrase absent");
  }, { id, phrase });
}

test("rail clamps pointer resize, remembers width and collapse; chat composer grows to ten lines and handles keys", async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 900 }); await newConversation(page);
  for (const [x, width] of [[700, 420], [120, 240]]) {
    const resizer = (await page.getByRole("separator", { name: "Resize the panel" }).boundingBox())!;
    await page.mouse.move(resizer.x + 1, resizer.y + 30); await page.mouse.down(); await page.mouse.move(x, resizer.y + 30, { steps: 6 }); await page.mouse.up();
    expect((await page.getByTestId("panel").boundingBox())!.width).toBe(width);
    await page.reload(); await expect.poll(async () => (await page.getByTestId("panel").boundingBox())!.width).toBe(width);
  }
  await page.getByTestId("rail-chats").click(); await expect(page.getByTestId("panel")).toHaveCount(0);
  await page.reload(); await expect(page.getByTestId("panel")).toHaveCount(0);
  await page.getByTestId("rail-chats").click(); await expect(page.getByTestId("panel")).toBeVisible();
  const input = page.getByTestId("chat-input"); await input.fill("One line"); const one = (await input.boundingBox())!.height;
  await input.fill(Array(10).fill("Ten lines").join("\n")); const ten = (await input.boundingBox())!.height; expect(ten).toBeGreaterThan(one);
  await input.fill(Array(20).fill("Twenty lines").join("\n"));
  expect((await input.boundingBox())!.height).toBe(ten); expect(await input.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
  await input.fill("Keyboard acceptance"); await input.press("End"); await input.press("Shift+Enter");
  await expect(input).toHaveValue("Keyboard acceptance\n"); await expect(messages(page)).toHaveCount(0);
  await input.press("Enter"); await expect(input).toHaveValue(""); await expect(messages(page)).toHaveCount(2);
});

test("message menu hover and keyboard reach, editor focus, four branches and two themes", async ({ page, request }, info) => {
  await page.setViewportSize({ width: 1500, height: 900 }); await newConversation(page); await exchange(page, "Acceptance branch prompt");
  const prompt = await idOf(page, 0);
  for (let n = 0; n < 3; n++) {
    await chooseAction(page, await idOf(page, 1), "Regenerate");
    await expect(page.getByTestId("branch-position")).toHaveText(`${n + 2}/${n + 2}`);
    await expect(assistant(page)).toHaveAttribute("data-status", "complete");
  }
  const branches = page.getByTestId("branches"); await expect(branches.getByTestId("branch-next")).toBeDisabled();
  const widths: number[] = [];
  for (let n = 4; n > 1; n--) { widths.push((await branches.getByTestId("branch-position").boundingBox())!.width); await branches.getByTestId("branch-prev").focus(); await page.keyboard.press("Enter"); await expect(branches).toContainText(`${n - 1}/4`); }
  expect(new Set(widths).size).toBe(1); await expect(branches.getByTestId("branch-prev")).toBeDisabled();
  await branches.getByTestId("branch-next").click(); await expect(branches).toContainText("2/4");
  const beforeScroll = await page.getByTestId("messages").evaluate(el => el.scrollTop);
  await chooseAction(page, prompt, "Edit and resend"); const editor = page.getByTestId("editor-input");
  await expect(editor).toBeFocused(); expect(await editor.evaluate(el => (el as HTMLTextAreaElement).selectionStart)).toBe("Acceptance branch prompt".length);
  expect(await page.getByTestId("messages").evaluate(el => el.scrollTop)).toBe(beforeScroll);
  await editor.press("Shift+Enter"); await expect(editor).toHaveValue("Acceptance branch prompt\n"); await editor.press("Escape"); await expect(editor).toHaveCount(0);
  await reprompt(page, prompt, "Edit and resend", "Acceptance branch prompt");
  await expect(messages(page).first()).toContainText("Acceptance branch prompt"); await expect(page.getByTestId("branch-position").first()).toHaveText("2/2");
  for (const name of ["light", "dark"]) {
    await theme(request, name); await page.reload();
    for (const width of [240, 420]) {
      await page.evaluate(width => localStorage.setItem("chat.panelWidth", String(width)), width); await page.reload();
      for (const row of [messages(page).first(), messages(page).last()]) {
        await page.mouse.move(1490, 890); const button = row.getByTestId("message-menu-button");
        await row.hover(); await expect.poll(() => button.evaluate(el => getComputedStyle(el).opacity)).toBe("1");
        await button.focus(); await page.keyboard.press("Shift+Tab"); await page.keyboard.press("Tab"); await expect(button).toBeFocused(); await page.keyboard.press("Enter"); const menu = row.getByTestId("message-menu");
        const r = (await menu.boundingBox())!; expect(r.x).toBeGreaterThanOrEqual(0); expect(r.x + r.width).toBeLessThanOrEqual(1500); expect(r.y + r.height).toBeLessThanOrEqual(900);
        await page.screenshot({ path: info.outputPath(`${name}-${width}-${await row.getAttribute("data-role")}-menu.png`) });
        await button.press("Enter");
      }
    }
  }
});

test("annotation draft preserves text on outside click, closes empty or Esc, and saves at its measured position", async ({ page, request }, info) => {
  await page.setViewportSize({ width: 1500, height: 900 }); await newConversation(page); await exchange(page, "Acceptance annotation placement");
  const id = await idOf(page, 1); const scroll = page.getByTestId("messages"); const before = await scroll.evaluate(el => el.scrollTop);
  const begin = async () => { await select(page, id, "annotation placement"); await chooseAction(page, id, "Annotate selection"); await expect(page.getByTestId("annotation-input")).toBeFocused(); };
  await begin(); expect(await scroll.evaluate(el => el.scrollTop)).toBe(before);
  await page.getByTestId("annotation-input").fill("First line\nSecond line");
  await messages(page).first().click(); await expect(page.getByTestId("annotation-input")).toHaveValue("First line\nSecond line");
  await page.getByTestId("annotation-input").press("Escape"); await expect(page.getByTestId("annotation-composer")).toHaveCount(0);
  await begin(); await messages(page).first().click(); await expect(page.getByTestId("annotation-composer")).toHaveCount(0);
  await begin(); await page.getByTestId("annotation-input").fill("A saved acceptance note");
  const box = (await page.getByTestId("annotation-composer").boundingBox())!;
  await page.getByTestId("annotation-save").click(); await expect(page.getByTestId("annotation")).toBeVisible();
  const card = (await page.getByTestId("annotation").boundingBox())!; expect(Math.abs(card.y - box.y)).toBeLessThanOrEqual(2);
  const conv = new URL(page.url()).searchParams.get("c");
  expect((await request.post(`/api/chats/${conv}/annotations`, { data: { kind: "note", targetMessageId: id, quote: "A deliberately missing acceptance quotation", prefix: "", suffix: "", charOffset: 0, text: "Acceptance moved-anchor flag" } })).ok()).toBe(true);
  for (const name of ["light", "dark"]) { await theme(request, name); await page.reload(); await expect(page.getByTestId("anchor-moved")).toBeVisible(); await page.screenshot({ path: info.outputPath(`annotation-${name}.png`) }); }
});

test("reading above the tail during a slow reply is not pulled down by subsequent deltas", async ({ page }) => {
  await newConversation(page);
  for (let i = 0; i < 8; i++) await exchange(page, `Acceptance scroll turn ${i}: ${"Long paragraph. ".repeat(12)}`);
  await say(page, "[[slow]] Acceptance follow while reading"); await expect(assistant(page)).toHaveAttribute("data-status", "streaming");
  const scroller = page.getByTestId("messages"); await scroller.evaluate(el => { el.scrollTop = 0; });
  const text = await assistant(page).innerText(); await expect.poll(() => assistant(page).innerText()).not.toBe(text);
  expect(await scroller.evaluate(el => el.scrollTop)).toBeLessThanOrEqual(1);
  await expect(page.getByTestId("chat-input")).toHaveValue("");
});

test("proposal tray remains bounded with composer reachable and markers readable in both themes", async ({ page, request }, info) => {
  await page.setViewportSize({ width: 1280, height: 900 }); await newConversation(page);
  const before = (await page.getByTestId("send").boundingBox())!;
  for (let i = 0; i < 2; i++) await exchange(page, "[[propose-habit]] [[propose-note]] [[propose-collection]] [[propose-tasks]]");
  const tray = page.getByTestId("proposals");
  expect(await tray.evaluate(el => el.clientHeight <= innerHeight * 0.4 + 1)).toBe(true);
  expect(await tray.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
  expect((await page.getByTestId("send").boundingBox())!.y).toBe(before.y);
  for (const name of ["light", "dark"]) {
    await theme(request, name); await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(page.locator("html")).toHaveAttribute("data-theme", name);
    await expect(page.getByTestId("auto-applied").last()).toBeVisible();
    await page.screenshot({ path: info.outputPath(`tray-marker-${name}.png`) });
  }
  const cards = page.locator('[data-proposal="collection"]'); const count = await page.locator('[data-proposal]').count();
  await cards.first().locator('[data-action="add"]').click(); await expect(page.locator('[data-proposal]')).toHaveCount(count - 1);
});


test("rich markdown remains contained and readable in both conversation themes", async ({ page, request }, info) => {
  await page.setViewportSize({ width: 1280, height: 900 }); await newConversation(page);
  const markdown = "Acceptance rich markdown.\n\n# Acceptance heading\n\n- First list item\n- Second list item\n\n```text\n" + "wide-code-".repeat(30) + "\n```\n\n| Column | Description |\n| --- | --- |\n| One | " + "table-cell ".repeat(15) + " |\n\nInline $P^{-1}AP$ and display:\n\n$$\n" + Array(15).fill("a+b+c").join("+") + "\n$$";
  await exchange(page, markdown);
  for (const name of ["light", "dark"]) {
    await theme(request, name); await page.evaluate(() => window.dispatchEvent(new Event("focus"))); await expect(page.locator("html")).toHaveAttribute("data-theme", name);
    await expect(assistant(page).locator("h1")).toContainText("Acceptance heading");
    await expect(assistant(page).locator("table")).toBeVisible(); await expect(assistant(page).locator(".katex-display")).toBeVisible();
    expect(await page.getByTestId("messages").evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    expect(await assistant(page).locator("pre").evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`rich-markdown-${name}.png`) });
  }
});


test("two hundred logged messages remain navigable and a long mid-conversation editor keeps reading position", async ({ page, request }, info) => {
  const { id } = await (await request.post("/api/chats", { data: { title: "Acceptance large conversation" } })).json();
  const script = `
    const { runBatch } = await import("./lib/history/batch.ts");
    const { saveMessage, updateConversation } = await import("./lib/history/chat-actions.ts");
    const { uuidv7 } = await import("./lib/chat/uuid.ts");
    let parentId = null; const actions = [];
    for (let i = 0; i < 200; i++) {
      const message = { schema: 1, id: uuidv7(), parentId, role: i % 2 ? "assistant" : "user", status: "complete", createdAt: "2026-10-15T00:00:00-04:00", model: null, attachments: [], refs: [], deleted: false, error: null, text: i === 100 ? "Acceptance long editable prompt. ".repeat(40) : "Acceptance large conversation row " + i };
      actions.push(saveMessage(${JSON.stringify(id)}, message)); parentId = message.id;
    }
    actions.push(updateConversation(${JSON.stringify(id)}, { activeLeafId: parentId }));
    await runBatch({ actor: "user", scope: "user", summary: "Seed acceptance large conversation", commitPrefix: "chat", actions });
  `;
  execFileSync(process.execPath, ["--input-type=module", "-e", script], { cwd: process.cwd(), env: { ...process.env, ATTUNE_REPO_DIR: SANDBOX }, stdio: "pipe" });
  await page.goto(`/chat?c=${id}`); await expect(messages(page)).toHaveCount(200);
  const row = messages(page).nth(100), messageId = (await row.getAttribute("data-message"))!;
  await row.scrollIntoViewIfNeeded(); const scroller = page.getByTestId("messages");
  const top = await scroller.evaluate(el => el.scrollTop); expect(top).toBeGreaterThan(1000);
  await chooseAction(page, messageId, "Edit and resend"); await expect(page.getByTestId("editor-input")).toBeFocused();
  expect(Math.abs(await scroller.evaluate(el => el.scrollTop) - top)).toBeLessThanOrEqual(1);
  expect(await page.getByTestId("editor-input").evaluate(el => (el as HTMLTextAreaElement).selectionStart)).toBe("Acceptance long editable prompt. ".repeat(40).length);
  await page.getByTestId("editor-input").press("Escape"); await expect(page.getByTestId("editor-input")).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("large-conversation-middle.png") });
  await scroller.evaluate(el => { el.scrollTop = el.scrollHeight; }); await expect(messages(page).last()).toBeInViewport();
});
