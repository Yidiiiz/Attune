// Owns: how `/api/files/raw` hands a file's bytes to a browser — what it says the bytes are, whether
// they may be shown in the page or only downloaded, and the headers that keep a hostile upload from
// running as the app (the Phase 8 approval, "SECURITY — /api/files/raw").
//
// **Why this is a security module.** The route serves from the app's own origin. An uploaded `.html`
// or `.svg` served as what it claims to be would run script with that origin — every API route, the
// history, the key settings — the moment someone opened it. So:
//
//   - **Inline only for raster images whose bytes and extension agree**: PNG, JPEG, GIF, WebP. The
//     decision is made on the bytes (`sniff`), and a disagreement — a `.png` that is really HTML, a
//     JPEG named `.gif` — is a download. An extension-keyed rule would serve the first inline.
//   - **PDF is a download.** The plan exempted PDF from `Content-Security-Policy: sandbox` on the
//     understanding that Chromium's viewer will not run under it; that was not shown here, and a PDF
//     can carry script. Nobody has shown the viewer safe without the sandbox either, so PDF goes with
//     everything else — the approval's own fallback. §10.2's PDF `<iframe>` is a download link until
//     one of the two is shown.
//   - **Everything else is `application/octet-stream` with `attachment`**, SVG and HTML included.
//   - **Every response** carries `nosniff`, so the browser cannot promote octet-stream back into HTML,
//     and `sandbox`, so even a response opened directly runs in an opaque origin with no script.
//
// Failure behavior: none. Pure; every input gets the safest answer that still shows a real image.

export type Raster = "png" | "jpeg" | "gif" | "webp";

const TYPES: Record<Raster, { mime: string; extensions: string[] }> = {
  png: { mime: "image/png", extensions: ["png"] },
  jpeg: { mime: "image/jpeg", extensions: ["jpg", "jpeg"] },
  gif: { mime: "image/gif", extensions: ["gif"] },
  webp: { mime: "image/webp", extensions: ["webp"] },
};

const startsWith = (bytes: Uint8Array, prefix: number[], at = 0): boolean =>
  bytes.length >= at + prefix.length && prefix.every((byte, i) => bytes[at + i] === byte);

const ascii = (text: string): number[] => [...text].map((char) => char.charCodeAt(0));

/** Which raster format the bytes are, by their magic numbers, or null. */
export function sniff(bytes: Uint8Array): Raster | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "jpeg";
  if (startsWith(bytes, ascii("GIF87a")) || startsWith(bytes, ascii("GIF89a"))) return "gif";
  if (startsWith(bytes, ascii("RIFF")) && startsWith(bytes, ascii("WEBP"), 8)) return "webp";
  return null;
}

/** Text the way the pre-commit hook and the history log mean it: no NUL byte, and valid UTF-8. */
export function looksLikeText(bytes: Uint8Array): boolean {
  if (bytes.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

export interface Delivery {
  inline: boolean;
  headers: Record<string, string>;
}

/** `Content-Disposition` for a file name, with an ASCII fallback and the exact name in RFC 5987 form. */
function disposition(kind: "inline" | "attachment", name: string): string {
  const fallback = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `${kind}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/** How to serve the file at `rel` whose bytes are `bytes`. */
export function deliveryFor(rel: string, bytes: Uint8Array): Delivery {
  const name = rel.split("/").pop() ?? "file";
  const extension = (/\.([^./]+)$/.exec(name)?.[1] ?? "").toLowerCase();
  const raster = sniff(bytes);
  const inline = raster !== null && TYPES[raster].extensions.includes(extension);

  return {
    inline,
    headers: {
      "Content-Type": inline && raster !== null ? TYPES[raster].mime : "application/octet-stream",
      "Content-Disposition": disposition(inline ? "inline" : "attachment", name),
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox",
      "Cross-Origin-Resource-Policy": "same-origin",
      "Cache-Control": "private, no-cache",
    },
  };
}
