// Owns: taking a file the user dropped on the composer and putting it under `data/files/`
// (PROJECT.md §14, §9.2, §4.8). One request may carry several files; they become one batch, because
// dropping four files is one act and undoing it should be one too.
//
// Failure behavior: a request with no file is a 400 rather than an empty success, so the composer
// can say the drop did not take instead of showing a chip for nothing. Everything past that belongs
// to `runBatch`: if any file fails, the whole batch rolls back and no chip appears for any of them.

import { runBatch } from "@/lib/history/batch";
import { addFile } from "@/lib/history/file-actions";
import { StoreError } from "@/lib/store/paths";
import { handle, ok } from "../../respond";

export const dynamic = "force-dynamic";

const MANIFEST_PATH = "files/index.md";

/** §4.8's three directories. Anything not plainly an image or a document is `other`. */
const DOC_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
  "text/csv",
]);

const DOC_EXTENSIONS = /\.(pdf|docx?|txt|md|markdown|csv|rtf|odt)$/i;

// Not exported: a `route.ts` may export only the HTTP handlers and Next's own configuration.
function kindFor(name: string, type: string): "images" | "docs" | "other" {
  if (type.startsWith("image/")) return "images";
  if (DOC_TYPES.has(type) || DOC_EXTENSIONS.test(name)) return "docs";
  return "other";
}

export async function POST(request: Request): Promise<Response> {
  return handle(async () => {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new StoreError("invalid", "expected a multipart form with one or more files");
    }

    const files = form.getAll("file").filter((entry): entry is File => entry instanceof File);
    if (files.length === 0) throw new StoreError("invalid", "no file was attached");

    const source = typeof form.get("source") === "string" ? String(form.get("source")) : "upload";
    const actions = [];
    const stored: Array<{ name: string; kind: string }> = [];
    for (const file of files) {
      const kind = kindFor(file.name, file.type);
      actions.push(addFile(kind, file.name, Buffer.from(await file.arrayBuffer()), source));
      stored.push({ name: file.name, kind });
    }

    const summary =
      files.length === 1 ? `add '${files[0].name}'` : `add ${files.length} files`;

    const result = await runBatch({
      actor: "user",
      scope: "user",
      summary,
      commitPrefix: "file",
      meta: { source },
      actions,
    });

    // Where each file landed is decided by its content hash (§4.8), so it is read back out of the
    // batch rather than recomputed. Each action contributes its file and then the manifest, in
    // order, and `targets` keeps first occurrences — so dropping the manifest lines them up.
    const paths = result.targets.filter((rel) => rel !== MANIFEST_PATH);
    return ok({
      ...result,
      files: stored.map((file, index) => ({ ...file, path: paths[index] ?? null })),
    });
  });
}
