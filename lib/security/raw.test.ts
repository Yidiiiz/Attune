// The failing cases the raw route's rule exists for, kept here so the rule is not relaxed later by
// someone who does not know why it is there (the Phase 8 approval). The route itself is checked with
// real files in `app/api/files/raw.test.ts`.

import { describe, expect, it } from "vitest";
import { deliveryFor, looksLikeText, sniff } from "./raw.ts";

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 16]);
const GIF = new TextEncoder().encode("GIF89a....");
const WEBP = new TextEncoder().encode("RIFF\x10\x00\x00\x00WEBPVP8 ");
const HTML = new TextEncoder().encode("<!doctype html><script>fetch('/api/settings/keys')</script>");
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>');
const PDF = new TextEncoder().encode("%PDF-1.7\n1 0 obj << /OpenAction << /JS (app.alert(1)) >> >>");

describe("sniff", () => {
  it("knows the four raster formats by their bytes and nothing else", () => {
    expect([PNG, JPEG, GIF, WEBP, HTML, SVG, PDF].map(sniff)).toEqual(["png", "jpeg", "gif", "webp", null, null, null]);
  });
});

describe("deliveryFor", () => {
  it.each([
    ["files/images/2026-09/a1-photo.png", PNG, "image/png"],
    ["files/images/2026-09/a1-photo.JPG", JPEG, "image/jpeg"],
    ["files/images/2026-09/a1-photo.gif", GIF, "image/gif"],
    ["files/images/2026-09/a1-photo.webp", WEBP, "image/webp"],
  ])("shows %s inline as %s, because bytes and extension agree", (rel, bytes, type) => {
    const { inline, headers } = deliveryFor(rel, bytes);
    expect(inline).toBe(true);
    expect(headers["Content-Type"]).toBe(type);
    expect(headers["Content-Disposition"]).toMatch(/^inline;/);
  });

  it.each([
    ["an HTML page", "files/docs/2026-09/a1-page.html", HTML],
    ["an SVG, which can carry script", "files/images/2026-09/a1-logo.svg", SVG],
    ["a PDF, until its viewer is shown safe without the sandbox", "files/docs/2026-09/a1-paper.pdf", PDF],
    ["HTML named .png", "files/images/2026-09/a1-trick.png", HTML],
    ["a PNG named .gif", "files/images/2026-09/a1-renamed.gif", PNG],
    ["a PNG with no extension", "files/other/2026-09/a1-noext", PNG],
  ])("downloads %s as octet-stream", (_what, rel, bytes) => {
    const { inline, headers } = deliveryFor(rel, bytes);
    expect(inline).toBe(false);
    expect(headers["Content-Type"]).toBe("application/octet-stream");
    expect(headers["Content-Disposition"]).toMatch(/^attachment;/);
  });

  it("sends nosniff and the sandbox on every response, inline or not", () => {
    for (const [rel, bytes] of [["a.png", PNG], ["a.html", HTML], ["a.pdf", PDF]] as const) {
      const { headers } = deliveryFor(rel, bytes);
      expect(headers["X-Content-Type-Options"]).toBe("nosniff");
      expect(headers["Content-Security-Policy"]).toBe("sandbox");
    }
  });

  it("puts a name with quotes and non-ASCII into the header without breaking it", () => {
    const { headers } = deliveryFor('files/docs/2026-09/a1-"notes" é.txt', new TextEncoder().encode("hi"));
    expect(headers["Content-Disposition"]).toBe(
      `attachment; filename="a1-_notes_ _.txt"; filename*=UTF-8''a1-%22notes%22%20%C3%A9.txt`,
    );
  });
});

describe("looksLikeText", () => {
  it("is false for a NUL byte or invalid UTF-8, as the hook and the log treat them", () => {
    expect(looksLikeText(new TextEncoder().encode("plain é text\n"))).toBe(true);
    expect(looksLikeText(PNG)).toBe(false);
    expect(looksLikeText(Uint8Array.from([0x66, 0x6f, 0xff, 0x6f]))).toBe(false);
  });
});
