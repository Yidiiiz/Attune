// The half of Decision 31 that can be checked without a browser: that math survives the markdown
// parser. Every case here is a string a markdown parser would have destroyed — `_` as emphasis, `^`
// as nothing, `{}` as literal braces — and the point is that the parser never sees it.
//
// Sanitizing is not here, because DOMPurify needs a DOM; `e2e/chat.spec.ts` sends a message
// containing a script tag and asserts the page did not gain one.

import { describe, expect, it } from "vitest";
import { MARK, renderUnsafe, stashMath } from "./pipeline.ts";

/** The placeholder, spelled through the module rather than as a NUL byte in this file. */
const at = (index: number): string => `${MARK}${index}${MARK}`;

describe("stashMath", () => {
  it("takes inline math out before anything can read it as markdown", () => {
    const { text, math } = stashMath("the matrix $P^{-1}AP$ is diagonal");
    expect(text).toBe(`the matrix ${at(0)} is diagonal`);
    expect(math).toEqual([{ tex: "P^{-1}AP", display: false }]);
  });

  it("takes display math out, and does not read it as two empty inline spans", () => {
    const { text, math } = stashMath("before\n\n$$\nP^{-1}AP = D\n$$\n\nafter");
    expect(text).toBe(`before

${at(0)}

after`);
    expect(math).toEqual([{ tex: "P^{-1}AP = D", display: true }]);
  });

  it("numbers several spans in order", () => {
    const { math } = stashMath("$a$ then $$b$$ then $c$");
    expect(math).toEqual([
      { tex: "b", display: true },
      { tex: "a", display: false },
      { tex: "c", display: false },
    ]);
  });

  it("leaves a dollar sign that is about money alone", () => {
    const source = "lunch was $5 and dinner was $10 for two";
    expect(stashMath(source)).toEqual({ text: source, math: [] });
  });

  it("leaves dollars inside a code fence alone", () => {
    const source = "```sh\necho $HOME and $PATH\n```";
    expect(stashMath(source)).toEqual({ text: source, math: [] });
  });

  it("leaves dollars inside an inline code span alone", () => {
    const source = "run `echo $a $b` first";
    expect(stashMath(source)).toEqual({ text: source, math: [] });
  });

  it("still finds math after a code fence, where the offsets have moved", () => {
    const { math } = stashMath("```\n$notmath$\n```\n\nbut $x_1$ is");
    expect(math).toEqual([{ tex: "x_1", display: false }]);
  });
});

describe("renderUnsafe", () => {
  it("renders the equation rather than the markdown parser's idea of it", () => {
    const html = renderUnsafe("the matrix $P^{-1}AP$ is diagonal");
    expect(html).toContain("katex");
    expect(html).not.toContain("<em>"); // `^{-1}AP$ is diagonal` has no emphasis in it
    expect(html).toContain("<p>");
  });

  it("marks display math as display", () => {
    expect(renderUnsafe("$$x = 1$$")).toContain("katex-display");
  });

  it("shows a broken equation as its own source instead of throwing", () => {
    const html = renderUnsafe("$\\notacommand{x}$");
    expect(html).toContain("katex");
    expect(html).toContain("notacommand");
  });

  it("renders ordinary markdown the ordinary way", () => {
    const html = renderUnsafe("# Heading\n\n- one\n- two\n\n`code`");
    expect(html).toContain("<h1>");
    expect(html).toContain("<li>one</li>");
    expect(html).toContain("<code>code</code>");
  });

  it("leaves a placeholder with no equation behind it alone rather than emptying it", () => {
    // A message that literally contains the placeholder bytes must not be able to inject a span.
    expect(renderUnsafe(at(99))).toContain("99");
  });
});
