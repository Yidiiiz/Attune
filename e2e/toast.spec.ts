// Owns: the one thing about a toast only a layout engine can prove — that it never takes a click
// meant for what is under it. The corner toasts sit in is where the chat composer's Send button is,
// and two bugs there were found by looking at the screen while `check:ui` passed through both: a
// toast paused in its fade-out that stayed as an invisible layer over Send, and seven seconds of dead
// Send after any toast at all. The first run of these checks found a third: at 800–1100 px the
// toast's own Undo sat on Send, so a click there undid the write. Toasts have had no buttons since
// (Decision 84), which is what makes all four sizes pass rather than two.
//
// **Why these checks ask the page instead of clicking.** Playwright's `click()` waits until its
// target is the thing at that point, so a check that clicks Send simply outlasts a toast lying over
// it and passes — which is how both bugs got through. These ask `elementFromPoint` what is on top at
// points across Send's box while a toast is held on screen, then click by coordinate with
// `page.mouse`, which does not wait for anything.
//
// The toast is held by pausing its animation, which is also the state the first bug left it in.

import { expect, test } from "@playwright/test";
import { exchange, messages, newConversation } from "./helpers";

test.use({ testIdAttribute: "data-ui" });

const SIZES = [
  { width: 1280, height: 720 },
  { width: 1024, height: 768 },
  { width: 800, height: 700 },
  { width: 400, height: 800 },
];

for (const size of SIZES) {
  test(`at ${size.width}×${size.height}, a click on Send reaches Send while a toast is up`, async ({ page }) => {
    await page.setViewportSize(size);
    await newConversation(page);
    await exchange(page, "[[propose-habit]] how do I usually work?");

    const toast = page.getByRole("status").filter({ hasText: "Remembered in habits.md" });
    await expect(toast).toBeVisible();
    await expect(toast.locator("button, a, input")).toHaveCount(0);
    await page.addStyleTag({ content: "[role='status'] * { animation-play-state: paused !important; }" });
    await page.locator("[data-ui='chat-input']").fill("after the toast");

    // Every sampled point on Send, and what is actually on top there. A point under anything else is
    // named, so a failure says what took the click.
    const blocked = await page.evaluate(() => {
      const send = document.querySelector("[data-ui='send']") as HTMLElement;
      const box = send.getBoundingClientRect();
      const found: string[] = [];
      for (const fx of [0.05, 0.25, 0.5, 0.75, 0.95]) {
        for (const fy of [0.15, 0.5, 0.85]) {
          const x = box.left + box.width * fx;
          const y = box.top + box.height * fy;
          const top = document.elementFromPoint(x, y);
          if (top !== null && (top === send || send.contains(top))) continue;
          const inToast = top?.closest("[role='status']") != null;
          const name =
            top?.getAttribute("data-ui") ?? top?.getAttribute("aria-label") ?? (inToast ? "the toast's body" : top?.tagName ?? "nothing");
          found.push(`(${Math.round(x)}, ${Math.round(y)}) → ${name}`);
        }
      }
      return found;
    });
    expect(blocked, "points on Send where something else takes the click").toEqual([]);

    const before = await messages(page).count();
    const box = await page.locator("[data-ui='send']").boundingBox();
    expect(box).not.toBeNull();
    await expect(toast).toBeVisible(); // still up: the click below goes through it, not after it
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await expect(page.locator("[data-message][data-role='user']").last()).toContainText("after the toast");
    expect(await messages(page).count()).toBeGreaterThan(before);
  });
}
