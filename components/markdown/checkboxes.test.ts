// Which drawn checkbox is which body line, and when the document view refuses to guess (the Phase 8
// approval: disabling on a mismatch is the safety valve, and the disabled state says why). The
// "drawn" states are what `marked` renders for the same body, read the way the page reads its inputs.

import { marked } from "marked";
import { describe, expect, it } from "vitest";
import { checkboxPlan, taskLines } from "./checkboxes.ts";
import { renderUnsafe } from "./pipeline.ts";

/** The boxes a body draws, ticked or not, in order — what the page's `<input>`s say. */
const drawn = (body: string): boolean[] =>
  [...renderUnsafe(body).matchAll(/<input([^>]*)type="checkbox"([^>]*)>/g)].map((m) => /checked/.test(m[1] + m[2]));

describe("taskLines", () => {
  it("gives each task item its body line and text, in drawing order, nested ones included", () => {
    const body = "# Pset\n\n- [ ] one\n  - [x] one, part a\n- [ ] two\n\n1. [x] ordered\n+ [ ] plus\n";
    expect(taskLines(body)).toEqual([
      { line: 2, text: "- [ ] one" },
      { line: 3, text: "  - [x] one, part a" },
      { line: 4, text: "- [ ] two" },
      { line: 6, text: "1. [x] ordered" },
      { line: 7, text: "+ [ ] plus" },
    ]);
  });

  it("counts a display equation over several lines back out, so the lines after it are not shifted", () => {
    const body = "$$\n\\begin{aligned}\nA &= PDP^{-1}\n\\end{aligned}\n$$\n\n- [ ] after the math $x^2$\n";
    expect(taskLines(body)).toEqual([{ line: 6, text: "- [ ] after the math $x^2$" }]);
  });

  it("does not take a box inside a code fence for a task, even with the same text as a real one", () => {
    const body = "```\n- [ ] same\n```\n\n- [ ] same\n";
    expect(taskLines(body)).toEqual([{ line: 4, text: "- [ ] same" }]);
  });

  it("agrees with marked on how many task items there are, for the equation sheet", () => {
    const sheet = "- [ ] Change of basis: $[v]_B = P^{-1}[v]_{B'}$\n- [x] Determinant $\\det(AB) = \\det A \\det B$\n\n$$\n\\begin{aligned}\n  A &= PDP^{-1} \\\\\n  A^k &= PD^kP^{-1}\n\\end{aligned}\n$$\n";
    const items = marked.lexer(sheet).filter((token) => token.type === "list").flatMap((list) => (list as { items: unknown[] }).items);
    expect(taskLines(sheet)?.length).toBe(items.length);
  });
});

describe("checkboxPlan", () => {
  it("makes every box clickable when the page and the file agree", () => {
    const body = "- [ ] a\n- [x] b\n";
    expect(checkboxPlan(body, drawn(body))).toEqual({
      clickable: true,
      lines: [
        { line: 0, text: "- [ ] a" },
        { line: 1, text: "- [x] b" },
      ],
    });
  });

  it("disables them all, saying why, when raw HTML draws a box of its own", () => {
    const body = '- [ ] a\n\n<input type="checkbox">\n';
    const plan = checkboxPlan(body, drawn(body));
    expect(plan.clickable).toBe(false);
    if (!plan.clickable) expect(plan.reason).toMatch(/shows 2 boxes but the file has 1 task line/);
  });

  it("disables them all when a box sits in a quote, whose line a click cannot flip", () => {
    const body = "- [ ] a\n\n> - [ ] quoted\n";
    const plan = checkboxPlan(body, drawn(body));
    expect(plan.clickable).toBe(false);
    if (!plan.clickable) expect(plan.reason).toContain("line 3 holds a box inside a quote");
  });

  it("disables them all when a drawn box's state is not its line's", () => {
    const plan = checkboxPlan("- [ ] a\n", [true]);
    expect(plan.clickable).toBe(false);
    if (!plan.clickable) expect(plan.reason).toContain("box 1 is drawn ticked");
  });

  it("disables them when the page drew none of the file's boxes", () => {
    const plan = checkboxPlan("- [ ] a\n", []);
    expect(plan.clickable).toBe(false);
  });
});
