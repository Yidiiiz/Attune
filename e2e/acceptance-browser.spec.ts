// Owns: outstanding document, search, download and narrow Files-menu acceptance.
// Failure behavior: fixtures live only under SANDBOX; provider behavior and human dialog appearance are not inferred.
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { SANDBOX } from "./setup";
import type { APIRequestContext, Page } from "@playwright/test";
test.use({ testIdAttribute: "data-ui" });
const NOTE = "knowledge/notes/acceptance-document.md";
const LIST = "knowledge/collections/acceptance-list.md";
function put(rel: string, text: string) { const file = path.join(SANDBOX, "data", rel); mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, text); }
const open = (page: Page, rel: string) => page.goto(`/chat?open=${encodeURIComponent(rel)}`);
async function theme(request: APIRequestContext, name: string) { const current = (await (await request.get("/api/settings")).json()).settings; await request.put("/api/settings", { data: { ...current, theme: name } }); }
let original: unknown;
test.beforeEach(async ({ request }) => { original = (await (await request.get("/api/settings")).json()).settings; });
test.afterEach(async ({ request }) => { await request.put("/api/settings", { data: original }); });
test.beforeAll(() => {
  put(NOTE, "---\nschema: 1\nid: n_20300612_acce\ntitle: Acceptance document\ntype: fact\ntags: []\nlinks: [knowledge/maps/acceptance-map.md]\nsource: manual\nconfidence: medium\nupdatedAt: 2030-06-12T10:00:00-04:00\n---\n\n# Acceptance document\n\n" + Array.from({ length: 80 }, (_, i) => `Paragraph ${i}: a line for document focus and scrolling.\n`).join("\n"));
  put("knowledge/maps/acceptance-map.md", "---\nschema: 1\nid: m_20300612_acce\ntitle: Acceptance map\nupdatedAt: 2030-06-12T10:00:00-04:00\n---\n\n- [Acceptance document](knowledge/notes/acceptance-document.md)\n");
  put(LIST, "---\nschema: 1\nid: k_20300612_acce\ntitle: Acceptance collection\nkind: list\ncontext: null\ntags: []\nlinks: []\ntasks: []\ncreatedAt: 2030-06-12T10:00:00-04:00\nupdatedAt: 2030-06-12T10:00:00-04:00\n---\n\n- [ ] First acceptance item\n- [x] Second acceptance item\n");
  put("files/acceptance-document.pdf", "%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF\n");
  put("files/acceptance-shape.svg", '<svg xmlns="http://www.w3.org/2000/svg"><text y="20">Acceptance SVG</text></svg>');
  put("files/acceptance-downloads.md", "![Acceptance PDF](files/acceptance-document.pdf)\n\n![Acceptance SVG](files/acceptance-shape.svg)\n");
});

test("document controls and refusal read in both themes for notes, collections and tasks", async ({ page, request }, info) => {
  const created = await (await request.post("/api/tasks", { data: { items: [{ title: "Acceptance document task" }] } })).json();
  const task = created.targets.find((rel: string) => rel.startsWith("tasks/"));
  for (const name of ["light", "dark"]) {
    await theme(request, name);
    for (const rel of [NOTE, LIST, task]) {
      await open(page, rel); await expect(page.getByTestId("document-strip")).toBeVisible();
      await expect(page.getByTestId("edit-toggle")).toBeVisible();
      await page.getByTestId("edit-toggle").click(); await expect(page.getByTestId("document-editor")).toBeFocused();
      await page.screenshot({ path: info.outputPath(`${name}-${rel.split("/")[1]}-editor.png`) });
      await page.getByTestId("edit-toggle").click();
      await page.screenshot({ path: info.outputPath(`${name}-${rel.split("/")[1]}-preview.png`) });
    }
    await open(page, NOTE); await page.getByTestId("edit-toggle").click();
    const value = ["sk", "ant", "b".repeat(48)].join("-");
    await page.getByTestId("document-editor").fill(value); await page.getByTestId("save").click();
    await expect(page.getByTestId("save-refused")).toContainText("anthropic key");
    await page.screenshot({ path: info.outputPath(`${name}-document-refusal.png`) });
    page.once("dialog", d => void d.accept()); await page.getByTestId("back-to-chat").click();
  }
});

test("Edit focuses a long document without resetting its reading position", async ({ page }) => {
  await open(page, NOTE); await expect(page.getByTestId("document-body")).toBeVisible();
  const scroller = (await page.getByTestId("document-strip").locator("..").locator(":scope > div").first().elementHandle())!;
  await scroller.evaluate(el => { el.scrollTop = 600; });
  const before = await scroller.evaluate(el => el.scrollTop); expect(before).toBeGreaterThan(100);
  await page.getByTestId("edit-toggle").click(); await expect(page.getByTestId("document-editor")).toBeFocused();
  expect(Math.abs(await scroller.evaluate(el => el.scrollTop) - before)).toBeLessThanOrEqual(1);
});

test("dirty reload raises a Chromium beforeunload dialog; dismissal retains draft", async ({ page }) => {
  await open(page, NOTE); await page.getByTestId("edit-toggle").click();
  const text = "Acceptance unsaved dialog draft"; await page.getByTestId("document-editor").fill(text);
  const seen = page.waitForEvent("dialog");
  void page.evaluate(() => location.reload()).catch(() => null);
  const dialog = await seen; expect(dialog.type()).toBe("beforeunload"); await dialog.dismiss();
  await expect(page.getByTestId("document-editor")).toHaveValue(text);
  const leave = page.waitForEvent("dialog");
  const closed = page.close({ runBeforeUnload: true });
  const closing = await leave; expect(closing.type()).toBe("beforeunload"); await closing.dismiss(); await closed;
  expect(page.isClosed()).toBe(false); await expect(page.getByTestId("document-editor")).toHaveValue(text);
});

test("PDF and SVG document links trigger actual Chromium downloads", async ({ page }, info) => {
  await open(page, "files/acceptance-downloads.md");
  for (const kind of ["PDF", "SVG"]) {
    const event = page.waitForEvent("download"); await page.getByRole("link", { name: `Acceptance ${kind} (download)`, exact: false }).click();
    const download = await event; expect(download.suggestedFilename()).toContain(kind === "PDF" ? ".pdf" : ".svg");
    await download.saveAs(info.outputPath(download.suggestedFilename())); expect(await download.failure()).toBeNull();
  }
});

test("search panel sits below its input over Today, Calendar and Chat; outside click reaches page", async ({ page, request }, info) => {
  await request.post("/api/tasks", { data: { items: [{ title: "Acceptance searchable task" }] } });
  await request.post("/api/chats", { data: { title: "Acceptance searchable conversation" } });
  for (const url of ["/", "/calendar", "/chat"]) {
    await page.goto(url); await page.keyboard.press("Control+k");
    await page.getByTestId("search-input").fill("Acceptance");
    const results = page.getByTestId("search-results"); await expect.poll(() => results.locator('[data-result]').count()).toBeGreaterThanOrEqual(4);
    const box = (await page.getByTestId("search-input").boundingBox())!, panel = (await results.boundingBox())!;
    expect(panel.y).toBeGreaterThanOrEqual(box.y + box.height);
    expect(await results.evaluate(el => getComputedStyle(el).zIndex)).toBe("30");
    for (const kind of ["task", "note", "collection", "conversation"]) await expect(results.getByText(kind, { exact: true }).first()).toBeVisible();
    await page.screenshot({ path: info.outputPath(`search-${url.replaceAll("/", "") || "today"}.png`) });
    const target = page.getByRole("link", { name: "Settings", exact: true });
    const rect = (await target.boundingBox())!;
    expect(await target.evaluate(el => { const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); })).toBe(true);
    await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2); await expect(page).toHaveURL(/settings$/);
  }
});

test("Files note and folder menus stay inside the viewport at minimum panel width in both themes", async ({ page, request }, info) => {
  for (const name of ["light", "dark"]) {
    await theme(request, name); await page.goto("/chat"); if (await page.getByTestId("rail-files").getAttribute("aria-pressed") !== "true") await page.getByTestId("rail-files").click();
    const resize = page.getByRole("separator", { name: "Resize the panel" }); const r = (await resize.boundingBox())!;
    await page.mouse.move(r.x + 1, r.y + 10); await page.mouse.down(); await page.mouse.move(150, r.y + 10, { steps: 6 }); await page.mouse.up();
    expect((await page.getByTestId("panel").boundingBox())!.width).toBe(240);
    for (const folder of ["knowledge", "notes"]) { const folderRow = page.locator(`[data-folder="${folder === "knowledge" ? folder : "knowledge/notes"}"]`); await expect(folderRow).toBeVisible(); const expand = folderRow.getByRole("button", { name: new RegExp(`^Expand ${folder}$`, "i") }); if (await expand.count()) await expand.click(); }
    for (const row of [page.locator(`[data-file="${NOTE}"]`), page.locator('[data-folder="knowledge/notes"]')]) {
      await row.getByTestId("file-menu-button").click(); const menu = page.getByTestId("file-menu"); await expect(menu).toBeVisible();
      const rect = (await menu.boundingBox())!; expect(rect.x).toBeGreaterThanOrEqual(0); expect(rect.y).toBeGreaterThanOrEqual(0); expect(rect.x + rect.width).toBeLessThanOrEqual(page.viewportSize()!.width); expect(rect.y + rect.height).toBeLessThanOrEqual(page.viewportSize()!.height);
      await expect(menu.getByTestId("rename")).toBeDisabled();
      await page.screenshot({ path: info.outputPath(`${name}-${row === undefined ? "row" : await row.getAttribute("data-folder") ? "folder" : "note"}-menu.png`) });
      await row.getByTestId("file-menu-button").click();
    }
  }
});


for (const provider of ["OPENAI_API_KEY", "ANTHROPIC_API_KEY"]) test(`key Set/Change/Remove masks values, preserves unrelated env lines and refuses Undo: ${provider}`, async ({ page, request }) => {
  const file = path.join(SANDBOX, ".env.local"), before = existsSync(file) ? readFileSync(file) : null;
  writeFileSync(file, "ACCEPTANCE_UNRELATED=keep-this-line\n");
  try {
    await page.goto("/settings"); const keys = page.getByRole("region", { name: "API keys", exact: true }).locator(`[data-key="${provider}"]`);
    await expect(keys).toContainText("not set");
    for (const [label, value] of [["Set", "acceptance-key-1111"], ["Change", "acceptance-key-2222"]]) {
      await keys.getByRole("button", { name: label, exact: true }).click();
      await keys.locator('input[type="password"]').fill(value); await keys.getByRole("button", { name: "Save", exact: true }).click();
      await expect(keys.locator('input[type="password"]')).toHaveCount(0); await expect(keys).toContainText(value.slice(-4)); await expect(keys).not.toContainText(value);
      expect(readFileSync(file, "utf8")).toContain("ACCEPTANCE_UNRELATED=keep-this-line");
      const lines = readFileSync(path.join(SANDBOX, "data/history/actions.jsonl"), "utf8"); expect(lines).not.toContain(value);
      const entry = JSON.parse(lines.trim().split("\n").at(-1)!);
      const refusal = await (await request.post("/api/history/undo", { data: { batch: entry.batch } })).json();
      expect(refusal.ok).toBe(false); expect(refusal.reason).toContain("a key change records only the name");
      await page.getByRole("button", { name: "Open History", exact: true }).click();
      const history = page.getByRole("dialog", { name: "Action history" }); const row = history.locator(`[data-batch="${entry.batch}"]`);
      await expect(row.locator("button[aria-expanded]")).toHaveAttribute("aria-expanded", "true");
      await row.getByRole("button", { name: "Undo", exact: true }).click(); await expect(row.getByRole("alert")).toContainText("a key change records only the name");
      await history.getByRole("button", { name: "Close History" }).click();
    }
    page.once("dialog", d => void d.accept()); await keys.getByRole("button", { name: "Remove", exact: true }).click();
    await expect(keys).toContainText("not set"); expect(readFileSync(file, "utf8")).toContain("ACCEPTANCE_UNRELATED=keep-this-line");
  } finally { if (before === null) unlinkSync(file); else writeFileSync(file, before); }
});
