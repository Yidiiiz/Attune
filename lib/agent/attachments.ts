// Owns: turning a message's attachment paths into content the provider can read, and refusing when
// it cannot — deferred amendment `o`, and the half of PROJECT.md §13.2 that says attachments become
// image or document blocks "where the model supports them".
//
// Two halves on purpose. `refuseAttachments` is pure and decides *whether* a turn can carry these
// files at all; `loadAttachments` reads bytes and decides *how*. The refusal has to be answerable
// without touching a disk because it happens before anything is written: §16.3 says a send rejected
// before any delta leaves nothing behind, and the cheapest way to keep that promise is to know the
// answer before the first file is opened.
//
// **A model that cannot take a file refuses the send and names itself.** §10.2 says so and the
// reason is that the alternative is worse in a specific way: dropping the attachment and answering
// about the text alone produces a reply that looks like an answer and is not one, because the model
// never saw the thing being asked about. Being told "Claude Haiku 4.5 cannot read PDFs" is a fact
// someone can act on — change the model, or send something else.
//
// Failure behavior: an attachment whose file has gone is skipped with a console line rather than
// failing the turn, because a missing upload should cost the picture and not the conversation. A
// *refused* attachment is different and is not skipped: it is the whole reason the send stops.

import { readBinary } from "../store/files.ts";
import { AgentError, modelEntry } from "./registry.ts";
import type { ContentPart } from "./registry.ts";

/** What a provider can be handed, decided by extension because that is what an upload records. */
export type AttachmentKind = "image" | "pdf" | "other";

const IMAGE_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

export function kindOf(path: string): AttachmentKind {
  const extension = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  if (extension in IMAGE_TYPES) return "image";
  if (extension === "pdf") return "pdf";
  return "other";
}

/**
 * The reason this model cannot take these attachments, or null when it can.
 *
 * "other" is refused for every model rather than sent as text: a `.docx` handed to a provider as
 * base64 is not something it can read, and pretending otherwise is the silent failure above with an
 * extra step. §9.2's uploads keep the file either way — this is about what one *turn* can carry.
 */
export function refuseAttachments(model: string, paths: string[]): string | null {
  if (paths.length === 0) return null;
  const entry = modelEntry(model);
  const name = entry?.label ?? model;

  const kinds = new Set(paths.map(kindOf));
  if (kinds.has("other")) {
    const first = paths.find((path) => kindOf(path) === "other") ?? "";
    return `${name} cannot read ${first.slice(first.lastIndexOf("/") + 1)} — only images and PDFs can be sent with a message.`;
  }
  if (kinds.has("image") && entry?.images !== true) return `${name} cannot read images.`;
  if (kinds.has("pdf") && entry?.pdf !== true) return `${name} cannot read PDFs.`;
  return null;
}

/**
 * The attachments as content parts, base64 encoded. Called only after `refuseAttachments` answered
 * null, so anything left here is a kind this model accepts.
 */
export async function loadAttachments(paths: string[]): Promise<ContentPart[]> {
  const parts: ContentPart[] = [];

  for (const path of paths) {
    const kind = kindOf(path);
    if (kind === "other") continue; // refused above; belt and braces, never sent as bytes
    try {
      const bytes = await readBinary(path);
      const extension = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
      const data = bytes.toString("base64");
      if (kind === "image") {
        parts.push({ type: "image", mediaType: IMAGE_TYPES[extension], data });
      } else {
        parts.push({ type: "document", mediaType: "application/pdf", data, name: path });
      }
    } catch (err) {
      // A message keeps its attachment paths forever; the file behind one can be deleted or moved
      // (Decision 65 made that possible on purpose). Losing the picture beats losing the turn.
      console.error(`agent: skipping attachment ${path} (${(err as Error).message})`);
    }
  }

  return parts;
}

/**
 * What a turn will carry, or a refusal — the two halves above in the order a caller needs them.
 *
 * The refusal is checked before a byte is read, so a rejected send costs nothing and leaves nothing:
 * §16.3's "rejected before any delta leaves nothing behind" is easiest to keep when the decision
 * happens before the first write. `unsupported` rather than `provider` because §13.5 routes it
 * inline, beside the box that still holds the prompt — the remedy is the model selector two inches
 * away, not another screen.
 */
export async function attachmentsFor(model: string, paths: string[]): Promise<ContentPart[]> {
  const refusal = refuseAttachments(model, paths);
  if (refusal !== null) throw new AgentError("unsupported", refusal);
  return loadAttachments(paths);
}
