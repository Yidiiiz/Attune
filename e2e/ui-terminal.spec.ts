// Owns: week-aligned rolling, friendly file view, transport settings and compact model controls.
// Failure behavior: uses the existing isolated browser sandbox and scripted provider only.
import { expect, test } from "@playwright/test";
test.use({testIdAttribute:"data-ui",reducedMotion:"reduce"});
test("Rolling keeps complete Sun–Sat weeks and distinct past-day shading",async({page},info)=>{
 await page.goto("/calendar?view=rolling&anchor=2030-06-12");
 const dates=await page.locator("[data-date]").evaluateAll(nodes=>nodes.map(node=>node.getAttribute("data-date")));
 expect(dates).toHaveLength(28);expect(dates[0]).toBe("2030-06-09");expect(dates[6]).toBe("2030-06-15");expect(dates[27]).toBe("2030-07-06");
 const first=page.locator('[data-date="2030-06-09"]');
 expect(await first.evaluate(el=>parseFloat(getComputedStyle(el).borderTopLeftRadius))).toBeGreaterThan(0);
 for(const theme of ["light","dark"]){await page.evaluate(theme=>{document.documentElement.dataset.theme=theme;document.documentElement.dataset.themeBase=theme;},theme);await page.screenshot({path:info.outputPath(`rolling-${theme}.png`),fullPage:true});}
});
test("simple files show task titles and understandable details; technical mode is optional",async({page,request},info)=>{
 const before=(await(await request.get("/api/settings")).json()).settings.interface;
 try{
  await request.put("/api/settings",{data:{section:"interface",value:{technicalFiles:false}}});
  const created=await(await request.post("/api/tasks",{data:{items:[{title:"Prepare browser review",due:"2030-06-12"}]}})).json();const target=created.targets[0];
  await page.goto(`/chat?open=${encodeURIComponent(target)}`);
  await expect(page.getByRole("heading",{name:"Prepare browser review",exact:true})).toBeVisible();
  await expect(page.getByTestId("frontmatter")).toHaveCount(0);await expect(page.getByTestId("document-path")).toHaveText("Prepare browser review");
  await expect(page.getByText("30 min",{exact:true})).toBeVisible();
  const title=(await page.getByRole("heading",{name:"Prepare browser review",exact:true}).boundingBox())!,controls=(await page.getByTestId("task-bar").boundingBox())!;
  expect(Math.abs(title.x-controls.x)).toBeLessThanOrEqual(1);
  await expect(page.getByPlaceholder("Ask about Prepare browser review",{exact:true})).toBeVisible();
  await page.getByTestId("rail-files").click();const panel=page.getByTestId("files-panel");
  await expect(panel.getByTestId("whole-repo")).toHaveCount(0);await panel.getByRole("button",{name:"Expand Tasks",exact:true}).click();
  await expect(panel.getByRole("link",{name:"Prepare browser review",exact:true})).toBeVisible();
  await expect(panel.getByRole("button",{name:"Expand history",exact:true})).toHaveCount(0);
  await page.screenshot({path:info.outputPath("simple-files.png")});
  await page.goto("/settings");await page.getByLabel("Technical file view",{exact:true}).check();
  await expect.poll(async()=>(await(await request.get("/api/settings")).json()).settings.interface.technicalFiles).toBe(true);
  await page.goto(`/chat?open=${encodeURIComponent(target)}`);await expect(page.getByTestId("frontmatter")).toBeVisible();await expect(page.getByTestId("document-path")).toHaveText(target);
  await page.screenshot({path:info.outputPath("technical-files.png")});
 }finally{await request.put("/api/settings",{data:{section:"interface",value:before}});}
});
test("terminal is the default connection and model selection fits beside composer modes",async({page,request},info)=>{
 const before=(await(await request.get("/api/settings")).json()).settings.assistant;
 try{
  await page.goto("/settings");const connection=page.getByRole("combobox",{name:"Chat connection",exact:true});await expect(connection).toHaveValue("terminal");
  await connection.selectOption("api");await expect.poll(async()=>(await(await request.get("/api/settings")).json()).settings.assistant.transport).toBe("api");
  await connection.selectOption("terminal");await expect.poll(async()=>(await(await request.get("/api/settings")).json()).settings.assistant.transport).toBe("terminal");
  await page.goto("/");const toggle=page.locator('[data-composer="button"]');expect((await toggle.boundingBox())!.width).toBe(40);await toggle.click();
  const model=page.getByLabel("Composer model",{exact:true}),modes=page.getByRole("group",{name:"Composer mode"});await expect(model).toHaveValue("gpt-6.1-sol");
  expect(Math.abs((await model.boundingBox())!.y-(await modes.boundingBox())!.y)).toBeLessThanOrEqual(1);
  await model.selectOption("claude-opus-5-5");
  const sent=page.waitForRequest(req=>req.url().endsWith("/api/agent/extract")&&req.method()==="POST");
  await page.locator('[data-composer="input"]').fill("Prepare a review");await page.locator('[data-composer="input"]').press("Enter");expect((await sent).postDataJSON().model).toBe("claude-opus-5-5");
  await page.screenshot({path:info.outputPath("composer-model.png")});
  await page.keyboard.press("Escape");
  const search=page.getByRole("navigation",{name:"Main"}).getByPlaceholder("Search",{exact:true});const sync=page.getByRole("status",{name:/^Sync:/});
  const a=(await search.boundingBox())!,b=(await sync.boundingBox())!;expect(b.x-a.x-a.width).toBeGreaterThanOrEqual(8);
  await page.setViewportSize({width:360,height:800});await toggle.click();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:info.outputPath("composer-model-phone.png")});
 }finally{await request.put("/api/settings",{data:{section:"assistant",value:before}});}
});
