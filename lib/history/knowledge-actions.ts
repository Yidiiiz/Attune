// Owns: the ActionSpec builders for the knowledge base — a proposed knowledge write applied (a
// session summary is one of those), a collection appended to or created, an item promoted to a task
// (PROJECT.md §6.3, §4.5, §4.6). The fifth builder file, split by domain the way `chat-actions.ts`
// was, because `actions.ts` is at the cap and its seam is by domain (Decision 56).
//
// Every write here snapshots whole files as `{ content }`: a note or a map is small, its body is the
// point, and undo has to put it back byte for byte. When a write changes what `knowledge/index.md`
// would say — a map, a profile file, a new collection — the regenerated index is a target of the
// same action, so one undo reverses both, the way `addFile` carries its manifest.
//
// **What this file does not do is enforce §6.3.** A note created without a map link is built here
// exactly as asked, and `runBatch` refuses it (`scan.ts`) before anything is logged. The rule has to
// hold for every batch, not only for batches that came through this builder, so it lives where
// every batch passes.
//
// Failure behavior: a builder that cannot find its target, or is asked for an operation its kind
// does not allow, throws before writing, which `runBatch` turns into a rolled-back batch.

import { splitFrontmatter } from "../store/frontmatter.ts";
import { nowIso } from "../schedule/dates.ts";
import { StoreError } from "../store/paths.ts";
import { itemsOf } from "../knowledge/items.ts";
import { createTask } from "./actions.ts";
import type { ActionSpec, Store } from "./batch.ts";
import type { Snapshots } from "./log.ts";

/** A proposed write as the user approved it (§13.3's `KnowledgeWrite`, as it left the card). */
export interface ApprovedWrite {
  path: string;
  op: "create" | "append" | "replace";
  content: string;
  reason: string;
  mapLink: string | null;
}

/** Which operations each kind of file accepts. The index is generated and accepts none. */
const ALLOWED: Record<string, ReadonlyArray<ApprovedWrite["op"]>> = {
  note: ["create", "append", "replace"],
  profile: ["append", "replace"],
  map: ["append"],
  session: ["create", "replace"],
};

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((one): one is string => typeof one === "string") : [];

const nameOf = (rel: string): string => rel.split("/").pop()?.replace(/\.md$/, "") ?? rel;

/**
 * Run `write` against the store, snapshotting every file it may touch — `paths` and the index —
 * before and after. The index is kept as a target only if it actually changed.
 */
async function recorded(
  store: Store,
  paths: string[],
  write: () => Promise<void>,
): Promise<{ targets: string[]; before: Snapshots; after: Snapshots }> {
  const index = store.knowledge.INDEX_PATH;
  const before: Snapshots = {};
  for (const rel of [...paths, index]) before[rel] = await store.snapshotContent(rel);
  await write();
  const reindexed = await store.knowledge.regenerateIndex();
  const targets = reindexed ? [...paths, index] : paths;
  const after: Snapshots = {};
  for (const rel of targets) after[rel] = await store.snapshotContent(rel);
  return { targets, before: Object.fromEntries(targets.map((rel) => [rel, before[rel]])), after };
}

/**
 * Apply one approved knowledge write (§6.3). A new note gets its title persisted into frontmatter at
 * write time — from the proposal's frontmatter, else its first heading, else its filename — and its
 * map gets a link line whose reason is the proposal's.
 */
export function writeKnowledge(write: ApprovedWrite, source: string): ActionSpec {
  const verb = write.op === "create" ? "Remember" : write.op === "append" ? "Add to" : "Rewrite";
  return {
    type: "knowledge.write",
    summary: `${verb} '${nameOf(write.path)}'`,
    apply: async (store: Store) => {
      const k = store.knowledge;
      const kind = k.requireKind(write.path);
      if (!(ALLOWED[kind] ?? []).includes(write.op)) {
        throw new StoreError(
          "invalid",
          kind === "index"
            ? `${write.path} is generated from the maps and cannot be written; edit a map instead`
            : kind === "collection"
              ? `${write.path} is a collection; add to it as a collection, not as a knowledge write`
              : `a ${kind} accepts ${(ALLOWED[kind] ?? []).join(" or ")}, not ${write.op}`,
        );
      }
      const present = await store.files.exists(write.path);
      if (write.op === "create" && present) throw new StoreError("exists", `${write.path} already exists`);
      if (write.op !== "create" && !present && kind !== "session") {
        throw new StoreError("not_found", `${write.path} does not exist`);
      }

      const proposed = splitFrontmatter(write.content);
      const mapLink = write.op === "create" && kind === "note" ? write.mapLink : null;
      if (mapLink !== null && k.kindOf(mapLink) !== "map") {
        throw new StoreError("invalid", `${mapLink} is not a map; a note is linked from knowledge/maps/`);
      }

      return recorded(store, mapLink === null ? [write.path] : [write.path, mapLink], async () => {
        if (kind === "profile") {
          const current = await store.files.readText(write.path);
          await k.writeRecord(write.path, "profile", {}, write.op === "append" ? k.appendLines(current, write.content) : write.content);
          return;
        }

        if (kind === "session") {
          // §4.6's frontmatter is the store's to fill, not the proposal's: the id is the conversation's,
          // and the message count is read from it rather than taken on trust.
          const convId = nameOf(write.path);
          const { conversation, messages } = await store.chats.readConversation(convId);
          const prior = present ? (await k.readRecord(write.path)).data : {};
          const now = nowIso((await store.settings.readSettings()).timezone);
          const title = typeof proposed.data.title === "string" && proposed.data.title.trim()
            ? proposed.data.title.trim()
            : conversation.title.trim() || k.noteTitleFrom({}, proposed.body, write.path);
          await k.writeRecord(write.path, "session", {
            ...prior,
            id: convId,
            title,
            createdAt: typeof prior.createdAt === "string" ? prior.createdAt : now,
            messageCount: messages.filter((message) => !message.deleted).length,
          }, proposed.body);
          return;
        }

        if (write.op === "create") {
          const title = k.noteTitleFrom(proposed.data, proposed.body, write.path);
          const links = [...new Set([...strings(proposed.data.links), ...(mapLink === null ? [] : [mapLink])])];
          const id = await k.newKnowledgeId("n");
          await k.writeRecord(write.path, "note", { source, ...proposed.data, id, title, links }, proposed.body);
          if (mapLink !== null) {
            const map = await k.readRecord(mapLink);
            const line = `- [${title}](${write.path}) — ${write.reason.trim() || "linked when the note was made"}`;
            await k.writeRecord(mapLink, "map", map.data, k.appendLines(map.body, line));
          }
          return;
        }

        const current = await k.readRecord(write.path);
        const body = write.op === "append" ? k.appendLines(current.body, proposed.body) : proposed.body;
        // A replacement may carry frontmatter of its own; it cannot change what the file *is*.
        const data = write.op === "replace" ? { ...current.data, ...proposed.data, id: current.data.id } : current.data;
        await k.writeRecord(write.path, kind as "note" | "map", data, body);
      });
    },
  };
}

/**
 * Add items to a collection, or create one (§9.5 step 6). `target` is a collection path, or
 * `new:<title>` for one that does not exist yet. Items already on the list, by text, are skipped:
 * adding "Dune" to a list that has "Dune" is a no-op, not a duplicate.
 */
export function addToCollection(target: string, items: string[]): ActionSpec {
  const creating = target.startsWith("new:");
  const title = creating ? target.slice(4).trim() : nameOf(target);
  return {
    type: "knowledge.write",
    summary: creating ? `Start the collection '${title}'` : `Add ${items.length} to '${title}'`,
    apply: async (store: Store) => {
      const k = store.knowledge;
      let rel = target;
      if (creating) {
        if (title.length === 0) throw new StoreError("invalid", "a new collection needs a title");
        const base = k.slugify(title, "collection");
        rel = `knowledge/collections/${base}.md`;
        for (let n = 2; await store.files.exists(rel); n += 1) rel = `knowledge/collections/${base}-${n}.md`;
      } else if (k.kindOf(rel) !== "collection" || !(await store.files.exists(rel))) {
        throw new StoreError("not_found", `${rel} is not a collection`);
      }

      return recorded(store, [rel], async () => {
        const current = creating ? { data: { id: await k.newKnowledgeId("k"), title }, body: "" } : await k.readRecord(rel);
        const have = new Set(itemsOf(current.body).map((item) => item.text));
        const lines = items.map((item) => item.trim()).filter((item) => item && !have.has(item));
        await k.writeRecord(rel, "collection", current.data, k.appendLines(current.body, lines.map((item) => `- [ ] ${item}`).join("\n")));
      });
    },
  };
}

/**
 * §4.5's "Make this a task", as two actions in one batch: the task, created with `source` and
 * `collection` pointing back at the item, then the collection, with the task's id in its `tasks`
 * and ` → [[t_…]]` on the item's line. Two actions rather than one so the history shows both
 * halves of the link; the second reads the id the first created.
 */
export function promoteItem(rel: string, slug: string): ActionSpec[] {
  let created: string | null = null;
  let label = slug;

  const task: ActionSpec = {
    type: "task.create",
    summary: `Make '${slug}' a task`,
    apply: async (store: Store) => {
      if (store.knowledge.kindOf(rel) !== "collection" || !(await store.files.exists(rel))) {
        throw new StoreError("not_found", `${rel} is not a collection`);
      }
      const { data, body } = await store.knowledge.readRecord(rel);
      const item = itemsOf(body).find((one) => one.slug === slug);
      if (item === undefined) throw new StoreError("not_found", `${rel} has no item '${slug}'`);
      if (item.taskId !== null) {
        throw new StoreError("exists", `'${item.title}' is already a task (${item.taskId}); an item becomes one task`);
      }
      label = item.title;
      const note = item.text.slice(item.title.length).replace(/^\s*—\s*/, "").trim();
      const result = await createTask({
        title: item.title,
        body: note,
        source: `collection:${rel}`,
        collection: `${rel}#${slug}`,
        context: typeof data.context === "string" ? data.context : null,
      }).apply(store);
      created = (await store.tasks.listTasks()).find((one) => one.path === result.targets[0])?.id ?? null;
      return result;
    },
  };

  const link: ActionSpec = {
    type: "knowledge.write",
    summary: `Link '${slug}' to its task`,
    apply: async (store: Store) => {
      if (created === null) throw new StoreError("invalid", "the task was not created, so there is nothing to link");
      const id = created;
      const k = store.knowledge;
      const before = await store.snapshotContent(rel);
      const { data, body } = await k.readRecord(rel);
      const item = itemsOf(body).find((one) => one.slug === slug);
      if (item === undefined) throw new StoreError("not_found", `${rel} lost the item '${label}'`);
      const lines = body.split("\n");
      lines[item.line] = `${lines[item.line].replace(/\s+$/, "")} → [[${id}]]`;
      await k.writeRecord(rel, "collection", { ...data, tasks: [...strings(data.tasks), id] }, lines.join("\n"));
      return { targets: [rel], before: { [rel]: before }, after: { [rel]: await store.snapshotContent(rel) } };
    },
  };

  return [task, link];
}

