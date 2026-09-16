// The browser half of Phase 8 B1 (PROJECT.md §10.2): the rail's Knowledge and Files panels, the tree
// both draw, and the document view read-only — its strip, frontmatter, math, links that open in place,
// images, backlinks, and checkboxes, including the approval's condition that a box the app cannot tie
// to its line is disabled *visibly and with the reason*. The library half is Stage A's route and
// builder tests, and `components/markdown/checkboxes.test.ts` for which box is which line.
//
// Fixtures are written straight into the sandbox, prefixed `b1-` so no other spec's files are touched,
// and a click is judged by the bytes on disk and the log's line count, not by what the page says.

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { newConversation } from "./helpers";
import { SANDBOX } from "./setup";

test.use({ testIdAttribute: "data-ui" });

const onDisk = (rel: string): string => path.join(SANDBOX, "data", rel);
const read = (rel: string): string => readFileSync(onDisk(rel), "utf8");
const put = (rel: string, text: string | Buffer): void => {
  mkdirSync(path.dirname(onDisk(rel)), { recursive: true });
  writeFileSync(onDisk(rel), text);
};
const logLines = (): string[] => read("history/actions.jsonl").split("\n").filter(Boolean);
const bodyOf = (text: string): string => text.slice(text.indexOf("\n---\n", 4) + 5);

const NOTE = "knowledge/notes/b1-basis.md";
const MAP = "knowledge/maps/b1-map.md";
const LIST = "knowledge/collections/b1-list.md";
const QUOTED = "files/b1-quoted.md";
// A 1×1 PNG: real bytes, so the raw route sniffs it as one and serves it inline.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");

const open = (page: Page, rel: string, extra = ""): Promise<unknown> => page.goto(`/chat?open=${encodeURIComponent(rel)}${extra}`);
const boxes = (page: Page) => page.locator("[data-ui='document-body'] input[type='checkbox']");

test.beforeAll(() => {
  put(MAP, "---\nschema: 1\nid: m_20260915_b1b1\ntitle: B1 map\nupdatedAt: 2026-09-15T10:00:00-04:00\n---\n\n- [B1 basis](knowledge/notes/b1-basis.md) — the note\n");
  put(
    NOTE,
    [
      "---",
      "schema: 1",
      "id: n_20260915_b1b1",
      "title: B1 basis",
      "type: fact",
      "tags: [linear-algebra, b1]",
      "links:",
      `  - ${MAP}`,
      "source: manual",
      "confidence: medium",
      "updatedAt: 2026-09-15T10:00:00-04:00",
      "---",
      "",
      "Columns of $P^{-1}$ are the new basis.",
      "",
      "![photo](files/images/b1-dot.png)",
      "",
      "![diagram](files/images/b1-shape.svg)",
      "",
      "See [the map](knowledge/maps/b1-map.md).",
      "",
    ].join("\n"),
  );
  put(
    LIST,
    "---\nschema: 1\nid: k_20260915_b1b1\ntitle: B1 list\nkind: list\ncontext: school\ntags: []\nlinks: []\ntasks: []\ncreatedAt: 2026-09-15T10:00:00-04:00\nupdatedAt: 2026-09-15T10:00:00-04:00\n---\n\n- [ ] first box\n- [x] second box\n",
  );
  put(QUOTED, "- [ ] a box the app can tie to its line\n\n> - [ ] a box inside a quote\n");
  put("files/images/b1-dot.png", PNG);
  put("files/images/b1-shape.svg", '<svg xmlns="http://www.w3.org/2000/svg"><script>document.title="svg ran"</script></svg>\n');

  // "Whole repo" is git's tracked files, with credential-shaped names left out whether tracked or not.
  mkdirSync(path.join(SANDBOX, "config"), { recursive: true });
  writeFileSync(path.join(SANDBOX, "README.md"), "# Sandbox\n\nThe checkout the browser checks run in.\n");
  writeFileSync(path.join(SANDBOX, "config", "id_ed25519"), "not a key, but named like one\n");
  writeFileSync(path.join(SANDBOX, "scratch.txt"), "untracked\n");
  const git = (...args: string[]): void => void execFileSync("git", args, { cwd: SANDBOX, stdio: "ignore" });
  git("add", "README.md", "config/id_ed25519");
  // `--allow-empty`: after a failed check Playwright starts a fresh worker, which runs this again.
  git("commit", "-q", "--allow-empty", "-m", "b1: repository files");
});

test("the rail switches between Chats, Knowledge and Files, remembers the choice, and folds the open one", async ({ page }) => {
  await page.goto("/chat");
  await page.getByTestId("rail-knowledge").click();
  await expect(page.getByTestId("knowledge-panel")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("knowledge-panel")).toBeVisible();

  await page.getByTestId("rail-files").click();
  await expect(page.getByTestId("files-panel")).toBeVisible();
  await page.getByTestId("rail-files").click();
  await expect(page.getByTestId("panel")).toHaveCount(0);
  await page.getByTestId("rail-chats").click();
  await expect(page.getByTestId("chats-panel")).toBeVisible();
});

test("the Knowledge tree lists a map by its title with the notes it links, and remembers what was expanded", async ({ page }) => {
  await page.goto("/chat");
  await page.getByTestId("rail-knowledge").click();
  const panel = page.getByTestId("knowledge-panel");
  await expect(panel.locator(`[data-file='${MAP}']`)).toContainText("B1 map");
  await expect(panel.locator(`[data-file='${NOTE}']`)).toHaveCount(0);

  await panel.getByRole("button", { name: "Expand B1 map" }).click();
  await expect(panel.locator(`[data-file='${NOTE}']`)).toContainText("B1 basis");
  await page.reload();
  await expect(page.getByTestId("knowledge-panel").locator(`[data-file='${NOTE}']`)).toContainText("B1 basis");
});

test("a note opens from the tree with its path, frontmatter and math, and Back returns to the conversation", async ({ page }) => {
  await newConversation(page);
  const conversation = new URL(page.url()).searchParams.get("c");
  await page.getByTestId("rail-knowledge").click();
  const panel = page.getByTestId("knowledge-panel");
  if ((await panel.locator(`[data-file='${NOTE}']`).count()) === 0) await panel.getByRole("button", { name: "Expand B1 map" }).click();
  await panel.locator(`[data-file='${NOTE}']`).getByRole("link").click();

  await expect(page.getByTestId("document-path")).toHaveText(NOTE);
  expect(new URL(page.url()).searchParams.get("c")).toBe(conversation);
  await expect(page.getByTestId("frontmatter").locator("[data-field='title']")).toContainText("B1 basis");
  await expect(page.getByTestId("frontmatter").locator("[data-field='tags']")).toContainText("linear-algebra, b1");
  await expect(page.getByTestId("document-body").locator(".katex").first()).toBeVisible();
  // The tree marks the open document.
  await expect(panel.locator(`[data-file='${NOTE}'] a`)).toHaveAttribute("aria-current", "page");

  await page.getByTestId("back-to-chat").click();
  await expect(page.locator("[data-ui='conversation']")).toBeVisible();
  expect(new URL(page.url()).searchParams.get("c")).toBe(conversation);
  expect(new URL(page.url()).searchParams.get("open")).toBeNull();
});

test("a link to a file in data/ opens it in place, without loading the page again", async ({ page }) => {
  await open(page, NOTE);
  await expect(page.getByTestId("document-body")).toContainText("See the map");
  await page.evaluate(() => {
    (window as unknown as { b1Marker: number }).b1Marker = 1;
  });
  await page.getByTestId("document-body").getByRole("link", { name: "the map" }).click();
  await expect(page.getByTestId("document-path")).toHaveText(MAP);
  expect(await page.evaluate(() => (window as unknown as { b1Marker?: number }).b1Marker)).toBe(1);
});

test("a raster image shows inline from the raw route, and an SVG is a download link rather than an image", async ({ page }) => {
  await open(page, NOTE);
  const body = page.getByTestId("document-body");
  const photo = body.locator("img[alt='photo']");
  await expect(photo).toHaveAttribute("src", "/api/files/raw?path=files%2Fimages%2Fb1-dot.png");
  await expect.poll(() => photo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1);

  await expect(body.locator("img[src*='b1-shape.svg']")).toHaveCount(0);
  const diagram = body.getByRole("link", { name: /diagram \(download\)/ });
  await expect(diagram).toHaveAttribute("href", "/api/files/raw?path=files%2Fimages%2Fb1-shape.svg");
  expect(await page.title()).not.toBe("svg ran");
});

test("Linked from lists the files that link here", async ({ page }) => {
  await open(page, NOTE);
  const backlinks = page.getByTestId("backlinks");
  await expect(backlinks.locator(`[data-file='${MAP}']`)).toContainText("B1 map");
  await expect(page.getByTestId("backlink-errors")).toHaveCount(0);
});

test("a checkbox click saves one action that flips exactly its line", async ({ page }) => {
  await open(page, LIST);
  await expect(boxes(page)).toHaveCount(2);
  await expect(boxes(page).first()).toBeEnabled();
  await expect(page.getByTestId("checkbox-notice")).toHaveCount(0);
  const before = bodyOf(read(LIST)).split("\n");
  const logged = logLines().length;

  await boxes(page).first().click();
  await expect(boxes(page).first()).toBeChecked();
  await expect(boxes(page).first()).toBeEnabled();

  const after = bodyOf(read(LIST)).split("\n");
  expect(after).toEqual(before.map((line) => (line === "- [ ] first box" ? "- [x] first box" : line)));
  const added = logLines().slice(logged).map((line) => JSON.parse(line) as { type: string; batch: string });
  expect(added.map((entry) => entry.type)).toEqual(["knowledge.write"]);
});

test("a box whose line changed after the page was drawn is refused in place, and the other edit is kept", async ({ page }) => {
  await open(page, LIST);
  await expect(boxes(page).nth(1)).toBeEnabled();
  const elsewhere = read(LIST).replace("- [x] second box", "- [x] second box, edited elsewhere");
  writeFileSync(onDisk(LIST), elsewhere);

  await boxes(page).nth(1).click();
  await expect(page.getByTestId("checkbox-refused")).toContainText("changed after the page was drawn");
  expect(read(LIST)).toBe(elsewhere);
  // The re-read shows the file as it now is.
  await expect(page.getByTestId("document-body")).toContainText("second box, edited elsewhere");
});

test("a box the app cannot tie to its line is disabled, visibly, and says why", async ({ page }) => {
  await open(page, QUOTED);
  const notice = page.getByTestId("checkbox-notice");
  await expect(notice).toContainText("can't be ticked here");
  await expect(notice).toContainText("inside a quote");
  await expect(boxes(page)).toHaveCount(2);
  for (const box of await boxes(page).all()) {
    await expect(box).toBeDisabled();
    await expect(box).toHaveAttribute("title", /inside a quote/);
    expect(await box.evaluate((el) => Number(getComputedStyle(el).opacity))).toBeLessThan(1);
  }
  const before = read(QUOTED);
  await boxes(page).first().click({ force: true });
  expect(read(QUOTED)).toBe(before);
});

test("a generated file opens read-only, and says why", async ({ page }) => {
  await open(page, "knowledge/index.md");
  await expect(page.getByTestId("read-only")).toContainText("Read-only:");
});

test("Whole repo lists git's tracked files without the credential-shaped one, and opens a file read-only", async ({ page }) => {
  await page.goto("/chat");
  await page.getByTestId("rail-files").click();
  const panel = page.getByTestId("files-panel");
  await panel.getByTestId("whole-repo").check();
  await expect(panel.locator("[data-file='README.md']")).toBeVisible();
  await expect(panel.locator("[data-file='scratch.txt']")).toHaveCount(0);
  await expect(panel.locator("[data-folder='config']")).toHaveCount(0);
  await expect(panel.locator("[data-file='config/id_ed25519']")).toHaveCount(0);

  await panel.locator("[data-file='README.md']").getByRole("link").click();
  await expect(page.getByTestId("document-path")).toContainText("README.md");
  await expect(page.getByTestId("read-only")).toContainText("Outside data/");
  await expect(page.getByTestId("document-body")).toContainText("The checkout the browser checks run in.");
  await expect(page.getByTestId("backlinks")).toHaveCount(0);

  await panel.getByTestId("whole-repo").uncheck();
  await expect(panel.locator("[data-file='README.md']")).toHaveCount(0);
});
