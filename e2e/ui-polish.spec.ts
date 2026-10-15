// Owns: compact panels, Calendar alignment and configurable deadline acceptance.
// Failure behavior: all mutations use the existing isolated browser sandbox; no provider calls.
import { expect, test } from "@playwright/test";
test.use({ testIdAttribute: "data-ui", reducedMotion: "reduce" });
test("composer is compact, has no duplicate close control and retains keyboard and toggle closing", async ({ page }, info) => {
  await page.goto("/");
  const toggle = page.locator('[data-composer="button"]');
  await toggle.click();
  const sheet = page.getByRole("dialog", { name: "Composer", exact: true });
  await expect(sheet).toBeVisible();
  expect((await sheet.boundingBox())!.height).toBeLessThanOrEqual(100);
  await expect(sheet.getByRole("button", { name: "Close composer", exact: true })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("compact-composer.png") });
  await toggle.click(); await expect(sheet).not.toBeVisible();
  const selected = page.getByRole("link", { name: "Today", exact: true });
  expect((await selected.boundingBox())!.height).toBe(24);
  await page.setViewportSize({ width: 360, height: 800 }); await toggle.click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const send = sheet.locator('[data-composer="send"]');
  const hit = await send.evaluate(el => { const box=el.getBoundingClientRect(); return el.contains(document.elementFromPoint(box.x+box.width/2,box.y+box.height/2)); });
  expect(hit).toBe(true);
  await page.screenshot({ path: info.outputPath("compact-composer-phone.png") });
  await page.keyboard.press("Escape"); await expect(sheet).not.toBeVisible();
});
test("Calendar period is centered, adjacent months are muted and current date is rounded", async ({ page, request }, info) => {
  const date = (await (await request.get("/api/tasks")).json()).date;
  await page.goto(`/calendar?view=month&anchor=${date}`);
  const heading = page.getByRole("heading", { level: 1 });
  const header = heading.locator("../..");
  const center = await heading.boundingBox(), bounds = await header.boundingBox();
  expect(Math.abs(center!.x+center!.width/2-bounds!.x-bounds!.width/2)).toBeLessThanOrEqual(1);
  const today = page.locator(`[data-date="${date}"]`);
  expect(await today.evaluate(el => parseFloat(getComputedStyle(el).borderRadius))).toBeGreaterThan(0);
  const colors = await page.locator('[data-date]').evaluateAll((nodes) => nodes.map(node => ({ date:node.getAttribute("data-date")!, bg:getComputedStyle(node).backgroundColor, color:getComputedStyle(node.firstElementChild!.firstElementChild!).color })));
  const current = colors.filter(cell => cell.date.startsWith(date.slice(0,7)));
  const outside = colors.filter(cell => !cell.date.startsWith(date.slice(0,7)));
  expect(new Set(current.filter(cell=>cell.date >= date).map(cell=>cell.bg)).size).toBe(1);
  if(current.some(cell=>cell.date < date)) expect(current.find(cell=>cell.date < date)!.bg).not.toBe(current.find(cell=>cell.date === date)!.bg);
  expect(outside.length).toBeGreaterThan(0); expect(outside[0].bg).not.toBe(current[0].bg); expect(outside[0].color).not.toBe(current[0].color);
  for(const theme of ["light","dark"]){
    await page.evaluate(theme=>{document.documentElement.dataset.theme=theme;document.documentElement.dataset.themeBase=theme;},theme);
    await page.screenshot({path:info.outputPath(`calendar-${theme}.png`),fullPage:true});
  }
  await page.setViewportSize({width:360,height:800});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:info.outputPath("calendar-phone.png"),fullPage:true});
});
test("untimed cutoff saves on blur and a task keeps its explicit due time when renamed", async ({ page, request }) => {
  const original=(await (await request.get("/api/settings")).json()).settings.deadlines;
  try {
    await page.goto("/settings"); const time=page.getByLabel("Untimed due time",{exact:true});
    await expect(time).toHaveValue("00:00"); await time.fill("17:00"); await time.blur();
    await expect.poll(async()=>(await (await request.get("/api/settings")).json()).settings.deadlines.defaultTime).toBe("17:00");
    await page.reload(); await expect(time).toHaveValue("17:00");
    await (await request.post("/api/tasks",{data:{items:[{title:"Deadline edit check",due:"2030-06-12T18:30:00-04:00"}]}})).json();
    await page.goto("/calendar?view=week&anchor=2030-06-12");
    await page.getByRole("button",{name:/Deadline edit check/}).click();
    await page.getByRole("toolbar",{name:"Selected task"}).getByRole("button",{name:"Edit",exact:true}).click();
    await expect(page.getByLabel("Due time (optional)",{exact:true})).toHaveValue("18:30");
    await page.getByLabel("Title",{exact:true}).fill("Deadline edit retained");
    await page.getByRole("button",{name:"Save",exact:true}).click();
    await expect(page.getByRole("button",{name:/Deadline edit retained/})).toBeVisible();
    const ranked = await (await request.get("/api/tasks?date=2030-06-12")).json();
    expect([...ranked.focus, ...ranked.alsoPossible, ...ranked.overdue].find(task=>task.title==="Deadline edit retained").due).toBe("2030-06-12T18:30:00-04:00");
  } finally { await request.put("/api/settings",{data:{section:"deadlines",value:original}}); }
});
