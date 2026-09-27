// The browser half of Phase 8 B2 (PROJECT.md §10.2): everything the document view *writes* — the
// Edit/Preview toggle, Save, the frontmatter table, the guards over unsaved work, and §17's own two
// byte-for-byte items. B1's read-only half is `browser.spec.ts`; the split is read versus write
// rather than a line count, so neither file has to be read to understand the other.
//
// Every judgement here is the bytes on disk, the log's line count, or what `history undo` restores —
// never what the page says it did. Fixtures are written straight into the sandbox and prefixed
// `b2-`, so no other spec's files are touched.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { SANDBOX } from "./setup";

test.use({ testIdAttribute: "data-ui" });

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.slice(1)), "..");
const onDisk = (rel: string): string => path.join(SANDBOX, "data", rel);
const read = (rel: string): string => readFileSync(onDisk(rel), "utf8");
const sha = (rel: string): string => createHash("sha256").update(readFileSync(onDisk(rel))).digest("hex");
const put = (rel: string, text: string): void => {
  mkdirSync(path.dirname(onDisk(rel)), { recursive: true });
  writeFileSync(onDisk(rel), text);
};
const logLines = (): string[] => read("history/actions.jsonl").split("\n").filter(Boolean);
const lastBatch = (): string => JSON.parse(logLines()[logLines().length - 1]).batch as string;

/** `npm run history -- undo <batch>` against the sandbox, which is what §17's edit-save-undo means. */
function undo(batch: string): void {
  execFileSync(process.execPath, [path.join(REPO, "scripts", "history.mjs"), "undo", batch], {
    cwd: REPO,
    env: { ...process.env, ATTUNE_REPO_DIR: SANDBOX },
    stdio: "ignore",
  });
}

const NOTE = "knowledge/notes/b2-edit.md";
const MATH = "knowledge/notes/b2-math.md";
const TEXT = "files/b2-plain.txt";

const head = (id: string, title: string): string =>
  [
    "---",
    "schema: 1",
    `id: ${id}`,
    `title: ${title}`,
    "type: fact",
    "tags: [b2]",
    "links:",
    "  - knowledge/maps/b2-map.md",
    "source: manual",
    "confidence: medium",
    "updatedAt: 2026-09-20T10:00:00-04:00",
    "---",
    "",
  ].join("\n");

const open = (page: Page, rel: string): Promise<unknown> => page.goto(`/chat?open=${encodeURIComponent(rel)}`);
const editor = (page: Page) => page.getByTestId("document-editor");

test.beforeAll(() => {
  // "Whole repo" is git's tracked files, so the repository needs one that is not under `data/`.
  // Written here rather than depended on from another spec: each file's fixtures are its own.
  writeFileSync(path.join(SANDBOX, "README.md"), "# Sandbox\n\nThe checkout the browser checks run in.\n");
  const git = (...args: string[]): void => void execFileSync("git", args, { cwd: SANDBOX, stdio: "ignore" });
  git("add", "README.md");
  git("commit", "-q", "--allow-empty", "-m", "b2: repository files");
});

test.beforeEach(() => {
  put("knowledge/maps/b2-map.md", "---\nschema: 1\nid: m_20260920_b2b2\ntitle: B2 map\nupdatedAt: 2026-09-20T10:00:00-04:00\n---\n\n- [B2 edit](knowledge/notes/b2-edit.md) — the note\n- [B2 math](knowledge/notes/b2-math.md) — the sheet\n");
  put(NOTE, `${head("n_20260920_b2ed", "B2 edit")}The first line.\n\n- [ ] a box\n`);
  put(MATH, `${head("n_20260920_b2ma", "B2 math")}Columns of $P^{-1}$ are the new basis.\n\n$$\\int_0^1 x^2 \\, dx = \\tfrac13$$\n`);
  put(TEXT, "one\ntwo\n");
});

test("Edit, Save and undo leave the file byte for byte as it was", async ({ page }) => {
  const before = sha(NOTE);
  const lines = logLines().length;
  await open(page, NOTE);

  await page.getByTestId("edit-toggle").click();
  await editor(page).fill("The first line, rewritten.\n\n- [ ] a box\n");
  await expect(page.getByTestId("unsaved")).toBeVisible();
  await page.getByTestId("save").click();

  // The transition the save produces: the mark goes, because the draft is gone once the file is it.
  await expect(page.getByTestId("unsaved")).toHaveCount(0);
  expect(read(NOTE)).toContain("The first line, rewritten.");
  expect(sha(NOTE)).not.toBe(before);
  expect(logLines().length).toBe(lines + 1);

  undo(lastBatch());
  expect(sha(NOTE)).toBe(before);
});

test("a body typed into the editor is written exactly, and the frontmatter around it is kept", async ({ page }) => {
  await open(page, NOTE);
  await page.getByTestId("edit-toggle").click();
  await editor(page).fill("Exactly  this.\n\n\tand a tab line\n");
  await page.getByTestId("save").click();
  await expect(page.getByTestId("unsaved")).toHaveCount(0);

  const text = read(NOTE);
  expect(text.slice(text.indexOf("\n---\n", 4) + 5)).toBe("Exactly  this.\n\n\tand a tab line\n");
  expect(text).toContain("id: n_20260920_b2ed");
  expect(text).toContain("title: B2 edit");
});

test("a LaTeX sheet goes through the editor and back unchanged, byte for byte and with no log line", async ({ page }) => {
  const before = sha(MATH);
  const body = read(MATH).slice(read(MATH).indexOf("\n---\n", 4) + 5);
  const lines = logLines().length;
  await open(page, MATH);

  await page.getByTestId("edit-toggle").click();
  // Nothing typed yet, so there is nothing to save: Save is the dirty comparison made visible, and
  // the editor holds the raw `$…$` rather than anything the renderer produced.
  await expect(editor(page)).toHaveValue(body);
  await expect(page.getByTestId("save")).toBeDisabled();

  await editor(page).fill(`${body}\nAn added line.\n`);
  await expect(page.getByTestId("save")).toBeEnabled();

  // Typed back to what the file says: the comparison is against the bytes, so Save goes quiet again
  // and the sheet is untouched. §15's "saved unchanged keeps its SHA-256" is this, before a write
  // rather than after one — the writer stamps `updatedAt`, so a save that *did* run could not keep it.
  await editor(page).fill(body);
  await expect(page.getByTestId("save")).toBeDisabled();
  await expect(page.getByTestId("unsaved")).toHaveCount(0);
  expect(sha(MATH)).toBe(before);
  expect(logLines().length).toBe(lines);

  // And the round trip through a real save: the body written is the body typed, character for
  // character, including every `$`.
  await editor(page).fill(`${body}\nAn added line.\n`);
  await page.getByTestId("save").click();
  await expect(page.getByTestId("unsaved")).toHaveCount(0);
  const text = read(MATH);
  expect(text.slice(text.indexOf("\n---\n", 4) + 5)).toBe(`${body}\nAn added line.\n`);
  undo(lastBatch());
  expect(sha(MATH)).toBe(before);
});

test("a frontmatter value is edited in the table and saved with the body untouched", async ({ page }) => {
  const body = read(NOTE).slice(read(NOTE).indexOf("\n---\n", 4) + 5);
  const lines = logLines().length;
  await open(page, NOTE);

  await page.locator("[data-field='title'] input").fill("B2 edited title");
  await expect(page.getByTestId("unsaved")).toBeVisible();
  await page.getByTestId("save").click();
  await expect(page.getByTestId("unsaved")).toHaveCount(0);

  const text = read(NOTE);
  expect(text).toContain("title: B2 edited title");
  expect(text.slice(text.indexOf("\n---\n", 4) + 5)).toBe(body);
  expect(logLines().length).toBe(lines + 1);
});

test("a text file with no frontmatter is edited as itself", async ({ page }) => {
  await open(page, TEXT);
  await page.getByTestId("edit-toggle").click();
  await editor(page).fill("one\ntwo\nthree\n");
  await page.getByTestId("save").click();
  await expect(page.getByTestId("unsaved")).toHaveCount(0);
  expect(read(TEXT)).toBe("one\ntwo\nthree\n");
});

test("unsaved changes are guarded: the toggle asks, Back asks, and the boxes stop taking clicks", async ({ page }) => {
  await open(page, NOTE);
  await page.getByTestId("edit-toggle").click();
  await editor(page).fill("Changed, and not saved.\n\n- [ ] a box\n");

  // Cancelled: the toggle leaves the editor where it is, with every character still in it.
  page.once("dialog", (dialog) => void dialog.dismiss());
  await page.getByTestId("edit-toggle").click();
  await expect(editor(page)).toHaveValue("Changed, and not saved.\n\n- [ ] a box\n");

  // Accepted: the draft goes, so the preview is the file and its box is clickable again.
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByTestId("edit-toggle").click();
  await expect(editor(page)).toHaveCount(0);
  await expect(page.getByTestId("unsaved")).toHaveCount(0);
  expect(read(NOTE)).toContain("The first line.");

  // Dirty again, this time from the table, which is editable in preview.
  await page.locator("[data-field='title'] input").fill("B2 half-typed");
  await expect(page.getByTestId("checkbox-notice")).toContainText("unsaved changes");
  await expect(page.locator("[data-ui='document-body'] input[type='checkbox']")).toBeDisabled();

  page.once("dialog", (dialog) => void dialog.dismiss());
  await page.getByTestId("back-to-chat").click();
  await expect(page.getByTestId("document")).toBeVisible();

  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByTestId("back-to-chat").click();
  await expect(page.getByTestId("document")).toHaveCount(0);
});

test("a save against a file edited elsewhere is refused, keeps the typed text, and keeps the other edit", async ({ page }) => {
  await open(page, NOTE);
  // Typed into the table rather than the editor, so the preview stays on screen: the re-read below
  // has to be observable, and in Edit mode nothing about it is.
  await page.locator("[data-field='title'] input").fill("What the editor typed");

  // Someone else writes the file after this editor opened it — the whole of what a 409 is.
  put(NOTE, `${head("n_20260920_b2ed", "B2 edit")}What the other program wrote.\n`);
  const theirs = sha(NOTE);

  // And the view re-reads it, which is what makes "the bytes the editor opened" different from "the
  // bytes last read". Without this step the check passes just as well against a version taken at
  // save time — and that version is the one that would overwrite the other program's edit silently.
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByTestId("document-body")).toContainText("What the other program wrote.");

  await page.getByTestId("save").click();
  await expect(page.getByTestId("save-refused")).toContainText("changed on disk");
  await expect(page.locator("[data-field='title'] input")).toHaveValue("What the editor typed");
  expect(sha(NOTE)).toBe(theirs);
});

test("a message typed under a document starts a conversation about that document and is sent there", async ({ page }) => {
  await open(page, NOTE);
  await page.locator("[data-ui='chat-input']").fill("What is this note about?");
  await page.locator("[data-ui='send']").click();

  // The transition the send produces: the document view is gone and a conversation is on screen
  // with the message in it. The text was never in the address, which is the condition open call 3
  // attached to the handover.
  await expect(page.getByTestId("conversation")).toBeVisible();
  expect(page.url()).not.toContain("What is this");
  await expect(page.locator("[data-message][data-role='user']").last()).toContainText("What is this note about?");
  await expect(page.locator("[data-message][data-role='assistant']").last()).toHaveAttribute("data-status", "complete");

  // And the conversation records the file it is about (§16.9), on disk rather than in the page.
  const id = new URL(page.url()).searchParams.get("c") ?? "";
  expect(id).not.toBe("");
  expect(read(`chats/${id}/conversation.md`)).toContain(`file: ${NOTE}`);
});

test("an ask that arrives with nothing handed over says so instead of losing it quietly", async ({ page }) => {
  // A conversation that exists, reached with the marker and an empty store: a reload of the page
  // the handover already sent from looks exactly like this.
  await page.goto("/chat");
  await page.getByTestId("new-chat").click();
  await expect(page.getByTestId("conversation")).toBeVisible();
  const id = new URL(page.url()).searchParams.get("c") ?? "";

  await page.goto(`/chat?c=${id}&ask=1`);
  await expect(page.locator("[data-ui='composer'] [data-ui='error']")).toContainText("did not make it here");
  await expect(page.locator("[data-message]")).toHaveCount(0);
});

/** Open the Files panel and hand back its locator. */
async function filesPanel(page: Page) {
  await page.goto("/chat");
  await page.getByTestId("rail-files").click();
  const panel = page.getByTestId("files-panel");
  await expect(panel).toBeVisible();
  return panel;
}

/**
 * Expand a folder row, waiting for it to be there first. The wait is the point: the tree is read
 * after the panel mounts, so a bare `count()` on the chevron answers 0 while the panel still says
 * "Reading…" — which is a check that skips its own setup and then fails somewhere else. This one
 * cost a run to find.
 */
async function expand(panel: ReturnType<Page["getByTestId"]>, folder: string): Promise<void> {
  const row = panel.locator(`[data-folder='${folder}']`);
  await expect(row).toBeVisible();
  const chevron = row.getByRole("button", { name: /^Expand / });
  if ((await chevron.count()) > 0) await chevron.click();
}

test("New folder and New file create them under files/, one batch each", async ({ page }) => {
  const panel = await filesPanel(page);
  await expand(panel, "files");
  const lines = logLines().length;

  await panel.locator("[data-folder='files']").getByTestId("file-menu-button").click();
  await page.getByTestId("new-folder").click();
  await page.getByTestId("name-input").fill("b2-folder");
  await page.getByTestId("name-input").press("Enter");

  // The transition the create produces: the row is in the tree, because the tree was read again.
  await expect(panel.locator("[data-folder='files/b2-folder']")).toBeVisible();
  expect(readFileSync(onDisk("files/b2-folder/.gitkeep"), "utf8")).toBe("");
  expect(logLines().length).toBe(lines + 1);

  await expand(panel, "files/b2-folder");
  await panel.locator("[data-folder='files/b2-folder']").getByTestId("file-menu-button").click();
  await page.getByTestId("new-file").click();
  await page.getByTestId("name-input").fill("notes.txt");
  await page.getByTestId("name-input").press("Enter");

  await expect(panel.locator("[data-file='files/b2-folder/notes.txt']")).toBeVisible();
  expect(read("files/b2-folder/notes.txt")).toBe("");
  expect(logLines().length).toBe(lines + 2);
});

test("Rename moves a file inside its folder, and refuses a note with the reason", async ({ page }) => {
  const panel = await filesPanel(page);
  await expand(panel, "files");

  await panel.locator("[data-folder='files']").getByTestId("file-menu-button").click();
  await page.getByTestId("new-file").click();
  await page.getByTestId("name-input").fill("b2-before.txt");
  await page.getByTestId("name-input").press("Enter");
  await expect(panel.locator("[data-file='files/b2-before.txt']")).toBeVisible();

  await panel.locator("[data-file='files/b2-before.txt']").getByTestId("file-menu-button").click();
  await page.getByTestId("rename").click();
  await page.getByTestId("name-input").fill("b2-after.txt");
  await page.getByTestId("name-input").press("Enter");
  await expect(panel.locator("[data-file='files/b2-after.txt']")).toBeVisible();
  expect(() => read("files/b2-before.txt")).toThrow();
  expect(read("files/b2-after.txt")).toBe("");

  // A note always has a map linking it (§6.3), so a rename would leave that link pointing at
  // nothing. The refusal says so where the name was typed, and the file is untouched.
  await expand(panel, "knowledge");
  await expand(panel, "knowledge/notes");
  await panel.locator(`[data-file='${NOTE}']`).getByTestId("file-menu-button").click();
  await page.getByTestId("rename").click();
  await page.getByTestId("name-input").fill("b2-renamed.md");
  await page.getByTestId("name-input").press("Enter");
  await expect(page.getByTestId("name-error")).toContainText("cannot be renamed");
  expect(read(NOTE)).toContain("The first line.");
});

test("Delete asks first, and removes the file when it is answered", async ({ page }) => {
  const panel = await filesPanel(page);
  await expand(panel, "files");
  await panel.locator("[data-folder='files']").getByTestId("file-menu-button").click();
  await page.getByTestId("new-file").click();
  await page.getByTestId("name-input").fill("b2-doomed.txt");
  await page.getByTestId("name-input").press("Enter");
  await expect(panel.locator("[data-file='files/b2-doomed.txt']")).toBeVisible();
  const lines = logLines().length;

  // Cancelled. Nothing happens, and "nothing happened" cannot be waited on — so the proof is a
  // reload, which reads the tree from the server again: the row surviving *that* is an observation
  // rather than the absence of one. Asserting it straight after the click passed against a delete
  // that ignored the dialog entirely, because the assertion resolved before the request landed.
  page.once("dialog", (dialog) => void dialog.dismiss());
  await panel.locator("[data-file='files/b2-doomed.txt']").getByTestId("file-menu-button").click();
  await page.getByTestId("delete").click();
  await page.reload();
  const after = page.getByTestId("files-panel");
  await expect(after.locator("[data-file='files/b2-doomed.txt']")).toBeVisible();
  expect(logLines().length).toBe(lines);

  page.once("dialog", (dialog) => void dialog.accept());
  await after.locator("[data-file='files/b2-doomed.txt']").getByTestId("file-menu-button").click();
  await page.getByTestId("delete").click();
  await expect(after.locator("[data-file='files/b2-doomed.txt']")).toHaveCount(0);
  expect(() => read("files/b2-doomed.txt")).toThrow();
  expect(logLines().length).toBe(lines + 1);
});

test("outside data/ the tree's menu says it is read-only rather than offering nothing", async ({ page }) => {
  const panel = await filesPanel(page);
  await panel.getByTestId("whole-repo").check();
  await expect(panel.locator("[data-file='README.md']")).toBeVisible();
  await panel.locator("[data-file='README.md']").getByTestId("file-menu-button").click();
  await expect(page.getByTestId("file-menu-note")).toContainText("read-only");
  await expect(page.getByTestId("rename")).toHaveCount(0);
  await expect(page.getByTestId("delete")).toHaveCount(0);
});

test("a read-only file offers no Edit and no Save", async ({ page }) => {
  await open(page, "knowledge/index.md");
  await expect(page.getByTestId("read-only")).toBeVisible();
  await expect(page.getByTestId("edit-toggle")).toHaveCount(0);
  await expect(page.getByTestId("save")).toHaveCount(0);
});

const LIST = "knowledge/collections/b2-list.md";

test("a collection's items become tasks from the row list under the preview", async ({ page }) => {
  put(
    LIST,
    "---\nschema: 1\nid: k_20260920_b2b2\ntitle: B2 list\nkind: list\ncontext: home\ntags: []\nlinks: []\ntasks: []\ncreatedAt: 2026-09-20T10:00:00-04:00\nupdatedAt: 2026-09-20T10:00:00-04:00\n---\n\n- [ ] Dune — the 2021 one first\n- [ ] Arrival\n",
  );
  await open(page, LIST);

  const row = page.locator("[data-item='dune']");
  await expect(row).toContainText("Dune");
  await row.getByTestId("make-task").click();

  // The transition the promote produces: the row says the item is a task, because the document was
  // re-read and the item's own line now carries the link.
  await expect(row.getByTestId("already-a-task")).toBeVisible();
  expect(read(LIST)).toMatch(/- \[ \] Dune — the 2021 one first → \[\[t_\d{8}_[0-9a-f]{4}\]\]/);
  expect(read(LIST)).toContain("tasks:");
  await expect(page.locator("[data-item='arrival']").getByTestId("make-task")).toBeVisible();
});

test("a task's document view completes it, and the menu is Today's", async ({ page, request }) => {
  const made = await request.post("/api/tasks", {
    data: { items: [{ title: "B2 task from the document view" }], source: "manual" },
  });
  const targets = ((await made.json()).targets as string[]).filter((one) => one.startsWith("tasks/"));
  expect(targets).toHaveLength(1);
  const rel = targets[0];

  await open(page, rel);
  await expect(page.getByTestId("task-status")).toHaveText("todo");
  await page.getByTestId("task-complete").click();

  await expect(page.getByTestId("task-status")).toHaveText("done");
  expect(read(rel)).toContain("status: done");
  await expect(page.getByTestId("task-complete")).toBeDisabled();

  // The `⋯` is the one from Today, so it carries Today's entries — and not "Ask about this", which
  // has no composer to open here (the one under the document is the Ask).
  await page.getByTestId("task-bar").getByRole("button", { name: /^Actions for/ }).click();
  await expect(page.getByRole("menuitem", { name: "Duplicate" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Ask about this" })).toHaveCount(0);
});

test("clicking a task's title on Today opens it in the document view", async ({ page, request }) => {
  const day = (await (await request.get("/api/tasks")).json()).date as string;
  const made = await request.post("/api/tasks", {
    data: { items: [{ title: "B2 task with a title link", due: day }], source: "manual" },
  });
  const rel = ((await made.json()).targets as string[]).find((one) => one.startsWith("tasks/")) ?? "";

  await page.goto("/");
  await page.getByRole("link", { name: "B2 task with a title link" }).click();
  await expect(page.getByTestId("document-path")).toContainText(rel);
  await expect(page.getByTestId("task-complete")).toBeVisible();
});

test("the document view re-reads when the window comes back", async ({ page }) => {
  await open(page, NOTE);
  await expect(page.getByTestId("document-body")).toContainText("The first line.");

  put(NOTE, `${head("n_20260920_b2ed", "B2 edit")}Changed by another program.\n`);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));

  await expect(page.getByTestId("document-body")).toContainText("Changed by another program.");
});

test("the search box finds a note, opens it, and Ctrl+K reaches the box", async ({ page }) => {
  await page.goto("/chat");
  await page.keyboard.press("Control+k");
  await expect(page.getByTestId("search-input")).toBeFocused();

  await page.getByTestId("search-input").fill("B2 edit");
  const hit = page.locator("[data-result='knowledge/notes/b2-edit.md']");
  await expect(hit).toBeVisible();
  await hit.click();

  await expect(page.getByTestId("document-path")).toContainText(NOTE);
  await expect(page.getByTestId("search-results")).toHaveCount(0);
});
