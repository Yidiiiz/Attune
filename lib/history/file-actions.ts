// Owns: the ActionSpec builders for files under `data/` as files — an upload stored and indexed
// (§4.8, §9.2), and the Files panel's operations: New folder, Rename, Delete (§10.2, §14's
// `/api/files/op`). Split from `actions.ts` by domain, which is the seam Decision 56 names for it:
// task builders, file builders, settings builders, never by layer. Saving a document's contents is
// the other route, `/api/files/write`, and lives in `document-actions.ts`.
//
// Each operation is logged by what it touched — `task.update` or `task.delete` for a task file,
// `knowledge.write` for the knowledge base, `file.write` under `files/` — which is §4.11's vocabulary
// as it stands; a move or a removal is a write to the tree. What each may do is `write-policy.ts`'s,
// checked inside the batch.
//
// **Rename is refused while anything links to the file**, and the refusal says why: the app cannot
// rewrite links yet, so a rename would leave each of them pointing at nothing (AGENTS.md amendment
// `v`). The link index is lenient — it skips a file it cannot parse — so it is not trusted here
// unless it read everything: with any file unreadable, the rename is refused rather than guessed at
// (AGENTS.md Conventions, a lenient reader is not an authority).
//
// Failure behavior: a builder that cannot find its target throws before writing anything, which
// `runBatch` turns into a rolled-back batch and an error the caller can show.

import { StoreError } from "../store/paths.ts";
import { looksLikeText } from "../security/raw.ts";
import { linkIndex } from "../knowledge/index.ts";
import { nodeOf, titleOf } from "../knowledge/graph.ts";
import { folderPolicy, nameProblem, policyFor, renameTarget } from "./write-policy.ts";
import type { ActionSpec, Store } from "./batch.ts";
import type { Snapshots } from "./log.ts";
import type { Policy } from "./write-policy.ts";
import type { TreeNode } from "../store/files.ts";

const MANIFEST = "files/index.md";
const INDEX = "knowledge/index.md";

const nameOf = (rel: string): string => rel.split("/").pop() ?? rel;
const parentOf = (rel: string): string => rel.slice(0, Math.max(0, rel.lastIndexOf("/")));

function refuse(why: string | null): void {
  if (why !== null) throw new StoreError("forbidden_path", why);
}

/**
 * Run `op` with every path in `paths` snapshotted before and after — and the generated file that lists
 * them, `files/index.md` or `knowledge/index.md`, regenerated and kept as a target only if it changed,
 * the way `addFile` carries its manifest.
 */
async function operate(store: Store, paths: string[], op: () => Promise<void>): Promise<{ targets: string[]; before: Snapshots; after: Snapshots }> {
  const listing = paths.some((rel) => rel.startsWith("files/")) ? MANIFEST : paths.some((rel) => rel.startsWith("knowledge/")) ? INDEX : null;
  const before: Snapshots = {};
  for (const rel of [...paths, ...(listing ? [listing] : [])]) before[rel] = await store.snapshotContent(rel);
  await op();
  if (listing === MANIFEST) await store.manifest.regenerateManifest();
  if (listing === INDEX) await store.knowledge.regenerateIndex();

  const after: Snapshots = {};
  for (const rel of [...paths, ...(listing ? [listing] : [])]) after[rel] = await store.snapshotContent(rel);
  const keep = listing !== null && JSON.stringify(after[listing]) !== JSON.stringify(before[listing]);
  const targets = keep && listing ? [...paths, listing] : paths;
  const pick = (snaps: Snapshots): Snapshots => Object.fromEntries(targets.map((rel) => [rel, snaps[rel]]));
  return { targets, before: pick(before), after: pick(after) };
}

/** What sits at `rel`: a file, a folder, or nothing — read from the listing of its parent. */
async function nodeAt(store: Store, rel: string): Promise<TreeNode | null> {
  const find = (nodes: TreeNode[]): TreeNode | null => {
    for (const node of nodes) {
      if (node.path === rel) return node;
      if (node.type === "dir" && rel.startsWith(`${node.path}/`)) return find(node.children ?? []);
    }
    return null;
  };
  return find(await store.files.listTree(parentOf(rel)));
}

const typeOf = (policy: Policy, removing = false): ActionSpec["type"] =>
  policy.kind === "task" ? (removing ? "task.delete" : "task.update") : policy.kind === "file" || policy.kind === "readonly" ? "file.write" : "knowledge.write";

/** New folder (§10.2). Git does not keep an empty folder, so the folder is made by its `.gitkeep`. */
export function folderAction(rel: string): ActionSpec {
  const keep = `${rel}/.gitkeep`;
  return {
    type: rel.startsWith("knowledge/") ? "knowledge.write" : "file.write",
    summary: `New folder '${nameOf(rel)}'`,
    apply: async (store: Store) => {
      refuse(folderPolicy(rel).create);
      const bad = nameProblem(nameOf(rel));
      if (bad) throw new StoreError("invalid", bad);
      if (await store.files.exists(rel)) throw new StoreError("exists", `${rel} already exists.`);
      await store.files.writeText(keep, "");
      return { targets: [keep], before: { [keep]: null }, after: { [keep]: await store.snapshotContent(keep) } };
    },
  };
}

/** Rename within one folder (the Phase 8 approval, open call 5), refused while anything links to it. */
export function renameAction(from: string, name: string): ActionSpec {
  const to = `${parentOf(from)}/${name}`;
  return {
    type: typeOf(policyFor(from, { text: true })),
    summary: `Rename '${nameOf(from)}' to '${name}'`,
    apply: async (store: Store) => {
      const node = await nodeAt(store, from);
      if (node === null) throw new StoreError("not_found", `${from} does not exist.`);
      if (node.type === "dir") throw new StoreError("invalid", folderPolicy(from).rename);
      const policy = policyFor(from, { text: looksLikeText(await store.files.readBinary(from)) });
      refuse(policy.rename);
      const bad = renameTarget(from, name);
      if (bad) throw new StoreError("invalid", bad);
      if (to === from) throw new StoreError("invalid", `${from} already has that name.`);
      if (policyFor(to, { text: true }).kind !== policy.kind) throw new StoreError("invalid", `${name} is not a name a ${policy.kind} can have here.`);
      // A change of case only is the same file to Windows and macOS, which `exists` would report as taken.
      if (to.toLowerCase() !== from.toLowerCase() && (await store.files.exists(to))) throw new StoreError("exists", `${to} already exists.`);

      const index = await linkIndex();
      if (index.errors.length > 0) {
        throw new StoreError(
          "invalid",
          `${from} was not renamed: the app could not read ${index.errors.join(", ")}, so it cannot tell whether ` +
            "any of them links here, and a rename would break such a link. Fix or remove the unreadable file first.",
        );
      }
      // The two generated listings link everything they list and are regenerated by this very batch
      // (`operate`), so they follow a rename rather than being broken by it. Counting them would
      // refuse every map, collection and upload — each is always listed.
      const linkers = [...new Set([...(index.incoming.get(from) ?? [])].map(nodeOf))].filter(
        (rel) => rel !== nodeOf(from) && rel !== INDEX && rel !== MANIFEST,
      );
      if (linkers.length > 0) {
        const named = linkers.slice(0, 5).map((rel) => `'${titleOf(index, rel)}'`).join(", ") + (linkers.length > 5 ? `, and ${linkers.length - 5} more` : "");
        throw new StoreError(
          "invalid",
          `${from} cannot be renamed while ${linkers.length === 1 ? "a file links" : `${linkers.length} files link`} to it (${named}): ` +
            "each of those links would then point at nothing, and the app cannot rewrite links yet (AGENTS.md amendment v). " +
            "Remove the links first, or rename it in a text editor and fix them there.",
        );
      }

      return operate(store, [from, to], () => store.files.moveFile(from, to));
    },
  };
}

/** Delete a file, or a folder under `files/` with everything in it. Undo puts every file back. */
export function deleteAction(rel: string): ActionSpec {
  return {
    type: typeOf(policyFor(rel, { text: true }), true),
    summary: `Delete '${nameOf(rel)}'`,
    apply: async (store: Store) => {
      const node = await nodeAt(store, rel);
      if (node === null) throw new StoreError("not_found", `${rel} does not exist.`);

      if (node.type === "dir") {
        refuse(folderPolicy(rel).remove);
        const inside: string[] = [];
        const dirs: string[] = [rel];
        const collect = (nodes: TreeNode[]): void => {
          for (const child of nodes) {
            if (child.type === "dir") {
              dirs.push(child.path);
              collect(child.children ?? []);
            } else inside.push(child.path);
          }
        };
        collect(node.children ?? []);
        // The listing leaves `.gitkeep` out; undo has to bring an emptied folder's back too.
        for (const dir of dirs) if (await store.files.exists(`${dir}/.gitkeep`)) inside.push(`${dir}/.gitkeep`);
        return operate(store, inside, () => store.files.deleteFile(rel));
      }

      refuse(policyFor(rel, { text: looksLikeText(await store.files.readBinary(rel)) }).remove);
      return operate(store, [rel], () => store.files.deleteFile(rel));
    },
  };
}

/**
 * Store one upload and re-index it (§4.8, §9.2). Two targets, because `addFile` regenerates the
 * manifest as part of storing the file and a batch that named only one of them would leave the
 * other outside undo.
 *
 * The uploaded bytes are snapshotted as `{ git: true }`, not inline: they are binary and the inline
 * path is text (§7.1 says that snapshot is for code changes and binaries). Undo still needs no
 * commit, because `before` is null and null means delete. A re-upload of bytes already stored
 * writes nothing, so it snapshots nothing and only the manifest moves; the file stays in `targets`,
 * where the conflict check can see it.
 */
export function addFile(
  kind: "images" | "docs" | "other",
  name: string,
  bytes: Buffer,
  source: string,
): ActionSpec {
  return {
    type: "file.add",
    summary: `Add '${name}'`,
    apply: async (store: Store) => {
      const manifestPath = "files/index.md";
      const manifestBefore = await store.snapshotContent(manifestPath);
      const { rel, created } = await store.manifest.addFile(kind, name, bytes, source);

      return {
        targets: [rel, manifestPath],
        before: { ...(created ? { [rel]: null } : {}), [manifestPath]: manifestBefore },
        after: {
          ...(created ? { [rel]: { git: true } as const } : {}),
          [manifestPath]: await store.snapshotContent(manifestPath),
        },
      };
    },
  };
}
