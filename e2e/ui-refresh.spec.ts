// Owns: owner-requested shell visibility, theme coherence, SVG icons and toggle regressions.
// Failure behavior: uses the existing isolated browser sandbox and no real provider.
import { expect, test } from "@playwright/test";
test.use({ testIdAttribute: "data-ui", reducedMotion: "reduce" });
test("top bar stays visible, themes coordinate controls, and empty composer toggles shut", async ({ page }, info) => {
 await page.goto("/");
 const toggle=page.locator('[data-composer="button"]');
 await toggle.click(); await expect(toggle).toHaveAttribute("aria-expanded","true");
 await toggle.click(); await expect(toggle).toHaveAttribute("aria-expanded","false");
 await toggle.click(); await expect(toggle).toHaveAttribute("aria-expanded","true");
 await page.keyboard.press("Escape");
 await expect(page.locator('[data-composer="sheet"]')).not.toBeVisible();
 await page.mouse.move(10,60);
 for (const theme of ["light","dark"]) {
  await page.evaluate(theme=>{document.documentElement.dataset.theme=theme;document.documentElement.dataset.themeBase=theme;},theme);
  const colors=await toggle.evaluate(el=>({actual:getComputedStyle(el).backgroundColor, expected:getComputedStyle(document.documentElement).getPropertyValue("--bg-elevated").trim()}));
  expect(colors.actual).not.toBe("rgba(0, 0, 0, 0)");
 expect(await toggle.evaluate(el=>{const probe=document.createElement("span");probe.style.color="var(--bg-elevated)";el.append(probe);const expected=getComputedStyle(probe).color;probe.remove();return getComputedStyle(el).backgroundColor===expected;})).toBe(true);
  await page.screenshot({path:info.outputPath(`today-${theme}.png`)});
 }
 await page.evaluate(()=>{const spacer=document.createElement("div");spacer.style.height="2000px";document.body.append(spacer);window.scrollTo(0,900);});
 const nav=page.getByRole("navigation").filter({has:page.getByRole("link",{name:"Today",exact:true})});
 expect((await nav.boundingBox())!.y).toBe(0); await expect(nav.getByRole("link",{name:"Calendar",exact:true})).toBeVisible();
 await nav.getByRole("link",{name:"Chat",exact:true}).click();
 await expect(page.getByTestId("rail-chats").locator("svg")).toHaveCount(1);
 await expect(page.getByTestId("rail-files").locator("svg")).toHaveCount(1);
 await expect(page.getByTestId("rail-knowledge").locator("svg")).toHaveCount(1);
 const rail=page.getByTestId("rail-chats");
 await rail.click(); await expect(page.getByTestId("panel")).toHaveCount(0);
 await rail.click(); await expect(page.getByTestId("panel")).toBeVisible();
 await page.screenshot({path:info.outputPath("chat-light.png")});
 await page.setViewportSize({width:360,height:800}); await page.goto("/");
 await expect(page.getByRole("link",{name:"Settings",exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:info.outputPath("today-phone.png")});
});
test("settings expose GPT and Opus 5.5 while Build offers only its SDK provider", async ({ page, request }) => {
 const settings=(await (await request.get("/api/settings")).json()).settings;
 expect(settings.models.default.model).toBe("gpt-6.1-sol");
 await page.goto("/settings");
 await expect(page.getByRole("combobox",{name:"default model",exact:true})).toHaveValue("gpt-6.1-sol");
 await expect(page.getByRole("combobox",{name:"default model",exact:true}).locator('option[value="claude-opus-5-5"]')).toHaveCount(1);
 await expect(page.getByRole("combobox",{name:"build model",exact:true}).locator('option[value="gpt-6.1-sol"]')).toHaveCount(0);
 await expect(page.getByText("OpenAI",{exact:true})).toBeVisible();
});

test("chat row actions and message actions close on a second click", async ({ page, request }) => {
 const created=await request.post("/api/chats",{data:{title:"Menu toggle check"}}); const id=(await created.json()).id;
 await page.goto(`/chat?c=${id}`);
 const toggle=page.getByRole("button",{name:"Actions for Menu toggle check",exact:true});
 await toggle.click(); await expect(page.getByTestId("chat-menu")).toBeVisible();
 await toggle.click(); await expect(page.getByTestId("chat-menu")).toHaveCount(0);
 await page.locator('[data-ui="chat-input"]').fill("Check message toggle");
 await page.locator('[data-ui="chat-input"]').press("Enter");
 await expect(page.locator('[data-ui="chat-input"]')).toHaveValue("");
 const prompt=page.getByRole("button",{name:"Actions for this message",exact:true});
 await prompt.click(); await expect(page.getByTestId("message-menu")).toBeVisible();
 await prompt.click(); await expect(page.getByTestId("message-menu")).toHaveCount(0);
});
