// Owns: the graph's actual empty checkout, HTTP edge parity and node navigation.
// Failure behavior: restore sandbox data in finally; never touch the owner's tree.
import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { SANDBOX } from "./setup";

test.use({ testIdAttribute: "data-ui" });
const NOTE = "knowledge/notes/graph-note.md";
const MAP = "knowledge/maps/graph-map.md";

test("graph opens on a genuinely empty data directory without a simulation", async ({ page, request }) => {
  const data = path.join(SANDBOX, "data"), saved = path.join(SANDBOX, "graph-saved-data");
  renameSync(data, saved);
  mkdirSync(data);
  try {
    const answer = await request.get("/api/knowledge/graph");
    expect((await answer.json()).nodes).toEqual([]);
    await page.goto("/chat?graph=1");
    await expect(page.getByText("Nothing here yet", { exact: true })).toBeVisible();
    await expect(page.locator("canvas")).toHaveCount(0);
  } finally {
    if (path.dirname(data) !== SANDBOX) throw new Error("sandbox containment failed");
    rmSync(data, { recursive: true, force: true });
    renameSync(saved, data);
  }
});

test("populated graph edges agree with HTTP backlinks and a node opens its document", async ({ page, request }) => {
  for (const [rel, text] of [[NOTE, `# Graph note\n\n[Map](${MAP})\n`], [MAP, `# Graph map\n\n[Note](${NOTE})\n`]]) {
    const file = path.join(SANDBOX, "data", rel);
    mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, text);
  }
  const graph = await (await request.get("/api/knowledge/graph")).json();
  for (const rel of [NOTE, MAP]) {
    const backlinks = await (await request.get(`/api/knowledge/backlinks?path=${encodeURIComponent(rel)}`)).json();
    expect(graph.edges.filter((edge: { target: string }) => edge.target === rel).map((edge: { source: string }) => edge.source).sort())
      .toEqual(backlinks.linkers.map((link: { path: string }) => link.path).sort());
  }
  await page.goto("/chat");
  await page.getByTestId("rail-graph").click();
  const canvas = page.getByRole("img", { name: /Knowledge graph/ });
  await expect(canvas).toBeVisible();
  const size = await canvas.evaluate((element) => {
    const c = element as HTMLCanvasElement;
    return { width: c.width, css: c.getBoundingClientRect().width, ratio: window.devicePixelRatio };
  });
  expect(size.width).toBe(Math.round(size.css * size.ratio));
  await page.screenshot({ path: ".agent/graph-light.png" });
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
  await page.screenshot({ path: ".agent/graph-dark.png" });
  await page.locator(`[data-node='${NOTE}']`).click();
  await expect(page.getByTestId("document-body")).toContainText("Graph note");
});

test("a canvas node click opens the corresponding document", async ({ page }) => {
  await page.route("**/api/knowledge/graph", (route) => route.fulfill({ json: {
    ok: true, nodes: [{ id: NOTE, title: "Graph note", kind: "note", degree: 0 }], edges: [], errors: [],
  } }));
  await page.goto("/chat?graph=1");
  const canvas = page.getByRole("img", { name: /Knowledge graph/ });
  await expect(page.locator(`[data-node='${NOTE}']`)).toBeVisible();
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error("canvas has no layout");
  await canvas.hover({ position: { x: bounds.width / 2, y: bounds.height / 2 } });
  await expect(canvas).toHaveAttribute("title", "Graph note");
  await canvas.click({ position: { x: bounds.width / 2, y: bounds.height / 2 } });
  await expect(page.getByTestId("document-body")).toContainText("Graph note");
});

test("Show all expands the two-hop neighborhood above 400 nodes", async ({ page }) => {
  await page.route("**/api/knowledge/graph", (route) => route.fulfill({ json: {
    ok: true, nodes: Array.from({ length: 405 }, (_, i) => ({ id: `files/${i}.txt`, title: `File ${i}`, kind: "file", degree: 0 })), edges: [], errors: [],
  } }));
  await page.goto("/chat?graph=1");
  await expect(page.locator("[data-node]")).toHaveCount(1);
  await page.getByRole("button", { name: "Show all", exact: true }).click();
  await expect(page.locator("[data-node]")).toHaveCount(405);
  await page.getByRole("button", { name: "Show neighborhood", exact: true }).click();
  await expect(page.locator("[data-node]")).toHaveCount(1);
});

test("type filter removes nodes and search dims nonmatches without hiding them", async ({ page }) => {
  await page.goto("/chat?graph=1");
  const note = page.locator(`[data-node='${NOTE}']`);
  await expect(note).toBeVisible();
  await page.getByRole("searchbox", { name: "Search graph" }).fill("Graph map");
  expect(await note.evaluate((element) => Number(getComputedStyle(element).opacity))).toBeLessThan(1);
  await page.getByRole("checkbox", { name: "note", exact: true }).uncheck();
  await expect(note).toHaveCount(0);
  await page.getByRole("checkbox", { name: "note", exact: true }).check();
  await expect(note).toBeVisible();
});
