import { describe, expect, it } from "vitest";
import { kindOf, refuseAttachments } from "./attachments.ts";
import { MODELS } from "./registry.ts";

const IMAGE = "files/images/2026-09/a1b2c3d4-diagram.png";
const PDF = "files/documents/2026-09/e5f6a7b8-paper.pdf";
const OTHER = "files/documents/2026-09/12345678-notes.docx";

describe("kindOf", () => {
  it("reads the kind from the extension, case-insensitively", () => {
    expect(kindOf(IMAGE)).toBe("image");
    expect(kindOf("files/x/Y.JPEG")).toBe("image");
    expect(kindOf(PDF)).toBe("pdf");
    expect(kindOf(OTHER)).toBe("other");
    expect(kindOf("files/x/no-extension")).toBe("other");
  });
});

describe("refuseAttachments", () => {
  it("says nothing when there is nothing attached", () => {
    expect(refuseAttachments("claude-opus-5", [])).toBeNull();
  });

  it("allows what the registry says the model can read", () => {
    // Every model in `MODELS` currently takes both, which is exactly why the flags have to be read
    // rather than assumed: the first one that does not is the case this guards.
    for (const entry of MODELS) {
      if (entry.images) expect(refuseAttachments(entry.id, [IMAGE])).toBeNull();
      if (entry.pdf) expect(refuseAttachments(entry.id, [PDF])).toBeNull();
    }
  });

  it("refuses a kind no message can carry, naming the file", () => {
    const refusal = refuseAttachments("claude-opus-5", [OTHER]);
    expect(refusal).toContain("12345678-notes.docx");
    expect(refusal).toContain("images and PDFs");
    // The path is not echoed whole: what someone needs is the file's name, not where it lives.
    expect(refusal).not.toContain("files/documents");
  });

  it("names the model when the model is the reason", () => {
    // A model the registry does not know has no flags, so it can take neither — and the message
    // says which model, because the remedy is the selector in the conversation header (§10.2).
    expect(refuseAttachments("some-old-model", [IMAGE])).toBe("some-old-model cannot read images.");
    expect(refuseAttachments("some-old-model", [PDF])).toBe("some-old-model cannot read PDFs.");
  });

  it("uses the model's label rather than its id when it has one", () => {
    const entry = MODELS[0];
    expect(refuseAttachments(entry.id, [OTHER])).toContain(entry.label);
  });

  it("refuses a mixed set on the first thing that cannot be sent", () => {
    const refusal = refuseAttachments("some-old-model", [IMAGE, PDF, OTHER]);
    // "other" first, because it is refused for every model and no model change would fix it.
    expect(refusal).toContain("notes.docx");
  });
});
