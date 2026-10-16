// Owns: neutral theme, spacing, icon alignment and hourly schedule regressions.
// Failure behavior: uses the existing sandbox; restores altered list settings and calls no provider.
import { expect, test } from "@playwright/test";
test.use({ testIdAttribute: "data-ui", reducedMotion: "reduce" });
test("empty schedules show hourly guides in neutral light and dark themes", async ({ page, request }, info) => {
 const settings=(await (await request.get("/api/settings")).json()).settings;
 await request.put("/api/settings",{data:{section:"list",value:{...settings.list,focusSize:0}}});
 try {
  await page.goto("/?date=2035-06-12");
  const schedule=page.getByRole("button",{name:"Schedule",exact:true});
  await schedule.click();
  const timeline=page.getByRole("region",{name:"Day schedule",exact:true});
  const hours=timeline.getByTestId("timeline-hour");
  expect(await hours.count()).toBeGreaterThan(4);
  for(const time of ["11:00","12:00","13:00"]) await expect(timeline.getByText(time,{exact:true})).toBeVisible();
  expect((await schedule.boundingBox())!.height).toBe(32);
  for(const theme of ["light","dark"]) {
   await page.evaluate(theme=>{document.documentElement.dataset.theme=theme;document.documentElement.dataset.themeBase=theme;},theme);
   const neutral=await page.evaluate(()=>{
    const probe=document.createElement("span");document.body.append(probe);
    const colors=["--bg","--bg-elevated","--bg-sunken","--accent"].map(token=>{probe.style.color=`var(${token})`;return getComputedStyle(probe).color.match(/\d+/g)!.slice(0,3).map(Number);});probe.remove();return colors;
   });
   for(const [r,g,b] of neutral){expect(r).toBe(g);expect(g).toBe(b);}
   await page.screenshot({path:info.outputPath(`schedule-${theme}.png`),fullPage:true});
  }
 }finally{await request.put("/api/settings",{data:{section:"list",value:settings.list}});}
});
test("new chats use GPT and adjacent controls and file icon are aligned", async ({ page, request }, info) => {
 const created=await request.post("/api/chats",{data:{title:"Neutral alignment check"}});const id=(await created.json()).id;
 const saved=await (await request.get(`/api/chats/${id}`)).json();expect(saved.conversation.model).toBe("gpt-6.1-sol");
 await page.goto(`/chat?c=${id}`);
 const header=page.getByTestId("conversation-header"), model=page.getByTestId("composer").getByTestId("model-select"), context=header.getByTestId("context-toggle");
 await expect(header.getByTestId("model-select")).toHaveCount(0);
 expect((await context.boundingBox())!.height).toBe(32);
 expect((await model.boundingBox())!.height).toBe(24);
 const input=page.getByTestId("chat-input"),send=page.getByTestId("send"),attach=page.getByTestId("composer").getByTitle("Attach a file",{exact:true});
 const i=(await input.boundingBox())!,s=(await send.boundingBox())!,a=(await attach.boundingBox())!;
 expect((await model.boundingBox())!.y).toBeGreaterThanOrEqual(i.y+i.height);
 expect(i.height).toBe(40);expect(s.height).toBe(40);expect(a.height).toBe(40);expect(Math.abs(s.y-a.y)).toBeLessThanOrEqual(1);
 const centered=await page.getByTestId("rail-files").evaluate(el=>{const button=el.getBoundingClientRect(),svg=el.querySelector("svg")!,box=svg.getBoundingClientRect(),path=svg.querySelector("path")!.getBBox();return {dx:Math.abs(button.x+button.width/2-box.x-box.width/2),dy:Math.abs(button.y+button.height/2-box.y-box.height/2),pathX:path.x+path.width/2,pathY:path.y+path.height/2};});
 expect(centered.dx).toBeLessThanOrEqual(.5);expect(centered.dy).toBeLessThanOrEqual(.5);expect(centered.pathX).toBe(12);expect(centered.pathY).toBe(12);
 for(const theme of ["light","dark"]){await page.evaluate(theme=>{document.documentElement.dataset.theme=theme;document.documentElement.dataset.themeBase=theme;},theme);await page.screenshot({path:info.outputPath(`chat-${theme}.png`)});}
 await page.getByTestId("chat-search").fill("no-conversation-matches-this-filter");
 const empty = page.getByText("Nothing matches.", {exact:true});
 await expect(empty).toBeVisible();
 expect(await empty.evaluate(el=>getComputedStyle(el).paddingLeft)).toBe("16px");
 await page.screenshot({path:info.outputPath("chat-empty-alignment.png")});
 await page.goto("/settings");
 const region=page.getByRole("region",{name:"Theme",exact:true});
 const sizes=await region.locator('button,select,input:not([type="checkbox"]):not([type="hidden"])').evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().height));
 for(const height of sizes) expect(height).toBe(32);
 await page.screenshot({path:info.outputPath("settings-spacing.png"),fullPage:true});
 await page.setViewportSize({width:360,height:800});await page.goto("/calendar?view=month&anchor=2030-06-12");
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:info.outputPath("calendar-phone.png"),fullPage:true});
});
