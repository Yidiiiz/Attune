// Owns: refusing a push that would put anything under `data/` onto a remote.
//
// `data/` is gitignored and `runBatch` never commits it, so nothing should be able to get there.
// This is the belt to that braces: it reads what is actually about to go out and refuses if any of
// it carries a `data/` path. The two preventions are independent on purpose — the first is a rule
// about what the app does, this is a measurement of what git holds — because the failure they guard
// against is the owner's notes, chats and profile landing on a remote, and a later commit cannot
// take a string out of a history that has already gone out.
//
// Run by .githooks/pre-push, which feeds one line per ref on stdin:
//   <local ref> <local oid> <remote ref> <remote oid>
// and by `npm run check-push [rev]`, which asks the same question of a revision by hand (HEAD by
// default) and is the readiness check to run before a remote exists at all.
//
// Failure behavior: fails loud and closed. A hit exits 1 naming the paths; a git command that will
// not run also exits 1, because a check that silently passes is worse than no check. It reports
// paths and never file contents. `git push --no-verify` skips every hook, including this one — that
// is git's design rather than a hole to plug here, and it is why this is the second line and not
// the first.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

/** The one directory that must never reach a remote. Matched at the repository root, literally. */
const GUARDED = "data";
const PATHSPEC = `:(top,literal)${GUARDED}`;
const ZERO = /^0+$/;
/** Enough to make the problem obvious without pasting a whole notes tree into a terminal. */
const SHOWN = 20;

function git(args) {
  return execFileSync("git", args, { maxBuffer: 64 * 1024 * 1024 }).toString("utf8");
}

const lines = (out) => out.split("\n").map((one) => one.trim()).filter(Boolean);

/**
 * Every `data/` path the revisions in `revs` would put on the remote. Two questions, because
 * neither answers the other: the tree check finds a tip carrying `data/` however it got there, and
 * the log check finds a commit inside the range that adds, changes or removes one even where the
 * tip is clean. A push that leaks needs only one of the two to be true.
 */
function offendingPaths(tip, revs) {
  const found = new Map(); // path -> what found it
  for (const path of lines(git(["ls-tree", "-r", "--name-only", tip, "--", PATHSPEC]))) {
    found.set(path, "in the tree being pushed");
  }
  for (const path of lines(git(["log", "--format=", "--name-only", "--no-renames", ...revs, "--", PATHSPEC]))) {
    if (!found.has(path)) found.set(path, "in a commit being pushed");
  }
  return found;
}

/**
 * The refs git is about to push. Stdin is a pipe when git runs this and a terminal when a person
 * does, which is the only reliable way to tell the two apart — reading fd 0 unconditionally would
 * hang at a prompt.
 */
function refsFromStdin() {
  if (process.stdin.isTTY) return [];
  const refs = [];
  for (const line of lines(readFileSync(0, "utf8"))) {
    const [localRef, localOid, , remoteOid = ""] = line.split(/\s+/);
    if (localOid === undefined || ZERO.test(localOid)) continue; // this ref is being deleted
    refs.push({ localRef, localOid, remoteOid });
  }
  return refs;
}

let refs;
try {
  refs = refsFromStdin();
} catch (err) {
  console.error(`check-push: could not read the refs being pushed (${err.message})`);
  process.exit(1);
}

// As a hook, git passes the remote's name and URL; by hand, the one argument is a revision.
const remote = refs.length > 0 ? process.argv[2] || "origin" : "";
const ranges =
  refs.length > 0
    ? refs.map(({ localRef, localOid, remoteOid }) => ({
        what: localRef,
        tip: localOid,
        // A remote oid of all zeroes is a ref the remote does not have yet, so everything reachable
        // from the local tip goes out, minus what the remote already has under some other ref. With
        // a remote nobody has fetched from there is nothing to subtract and the whole history is
        // scanned — the conservative direction, and exactly the case of a new GitHub repository.
        revs: ZERO.test(remoteOid)
          ? [localOid, "--not", `--remotes=${remote}`]
          : [`${remoteOid}..${localOid}`],
      }))
    : [{ what: process.argv[2] ?? "HEAD", tip: process.argv[2] ?? "HEAD", revs: [process.argv[2] ?? "HEAD"] }];

let hits = 0;
for (const { what, tip, revs } of ranges) {
  let found;
  try {
    found = offendingPaths(tip, revs);
  } catch (err) {
    console.error(`check-push: could not read what ${what} would push (${err.message.split("\n")[0]})`);
    process.exit(1);
  }
  if (found.size === 0) continue;
  hits += found.size;
  console.error(`check-push: ${what} would push ${found.size} path${found.size === 1 ? "" : "s"} under ${GUARDED}/:`);
  let shown = 0;
  for (const [path, where] of found) {
    if (shown === SHOWN) {
      console.error(`  ... and ${found.size - shown} more`);
      break;
    }
    console.error(`  ${path} (${where})`);
    shown += 1;
  }
}

if (hits > 0) {
  console.error("");
  console.error(`check-push: push refused. ${GUARDED}/ is your own notes, tasks, chats and profile, and a`);
  console.error("check-push: remote is not somewhere they can be taken back from.");
  console.error(`check-push: the app never commits ${GUARDED}/ — .gitignore, and runBatch's non-committing`);
  console.error("check-push: path — so anything here arrived by some other route and wants looking at.");
  process.exit(1);
}

console.log(`check-push: ${ranges.length} ref${ranges.length === 1 ? "" : "s"} clean of ${GUARDED}/`);
