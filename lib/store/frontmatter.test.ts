import { describe, expect, it } from "vitest";
import { joinFrontmatter, splitFrontmatter } from "./frontmatter.ts";

const LATEX_BODY = `Change of basis, worked.

Inline: $\alpha_i \in \mathbb{R}$ and $P^{-1}AP$.

$$
\int_0^1 x^2 \, dx = \frac{1}{3}
$$

\`\`\`text
--- not a delimiter, it is inside a fence
\`\`\`

- [ ] 4.1 problems
- [x] 4.2 problems
`;

describe("splitFrontmatter", () => {
  it("keeps a LaTeX body byte-for-byte through a round trip", () => {
    const data = { schema: 1, id: "n_20260903_1a2b", title: "Change of basis", tags: ["math221"] };
    const file = joinFrontmatter(data, LATEX_BODY);

    const parsed = splitFrontmatter(file);
    expect(parsed.body).toBe(LATEX_BODY);
    expect(parsed.data).toEqual(data);

    // join(split(x)) === x: the whole file, not just the body.
    expect(joinFrontmatter(parsed.data, parsed.body)).toBe(file);
  });

  it("never touches the body, so no escaping is invented", () => {
    const body = "$$\frac{a}{b}$$\n\ntrailing spaces   \n\n\n";
    const round = splitFrontmatter(joinFrontmatter({ id: "x" }, body));
    expect(round.body).toBe(body);
  });

  it("treats a file with no frontmatter as all body", () => {
    const text = "# Just a heading\n\nNo frontmatter here.\n";
    expect(splitFrontmatter(text)).toEqual({ data: {}, body: text });
  });

  it("treats an unterminated block as body rather than guessing", () => {
    const text = "---\ntitle: never closed\n";
    expect(splitFrontmatter(text).body).toBe(text);
  });

  it("reads an empty frontmatter block as empty data", () => {
    expect(splitFrontmatter("---\n---\nbody\n")).toEqual({ data: {}, body: "body\n" });
  });

  it("writes empty values as bare keys, matching the shapes in the spec", () => {
    const file = joinFrontmatter({ title: "Pset 4", completedAt: null, repeat: null }, "");
    expect(file).toBe("---\ntitle: Pset 4\ncompletedAt:\nrepeat:\n---\n");
  });

  it("throws on frontmatter that is not a mapping", () => {
    expect(() => splitFrontmatter("---\n- a\n- b\n---\nbody\n")).toThrow(/mapping/);
  });

  it("throws on malformed YAML", () => {
    expect(() => splitFrontmatter("---\ntitle: [unclosed\n---\nbody\n")).toThrow(/not valid YAML/);
  });
});
