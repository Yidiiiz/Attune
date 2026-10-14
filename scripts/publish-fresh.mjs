// Owns: the fresh-clone install/init/build/HTTP acceptance check (§12).
// Failure behavior: stop its server and verify cleanup containment on success, error or interruption.
import net from "node:net";
import path from "node:path";
import { once } from "node:events";
import { clone, command, npmCli, start, stopTree, temporary, removeTemporary } from "./publish-process.mjs";
async function freePort() {
  const server = net.createServer(); server.listen(0, "127.0.0.1"); await once(server, "listening");
  const port = server.address().port; await new Promise(resolve => server.close(resolve)); return port;
}
export async function freshClone(root) {
  const dir = await temporary(); let server;
  try {
    await clone(root, dir);
    await command([npmCli(), "ci", "--offline", "--no-audit", "--no-fund"], dir);
    await command(["scripts/init.mjs"], dir, 30);
    await command(["scripts/kb-check.mjs"], dir, 30);
    await command(["node_modules/next/dist/bin/next", "build"], dir, 600);
    const port = await freePort();
    server = start(["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], dir);
    let answer, lastError;
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      if (server.exitCode !== null || server.signalCode !== null) throw new Error("Fresh production server exited before readiness");
      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/tasks`, { signal: AbortSignal.timeout(2000) });
        if (response.ok) { answer = await response.json(); break; }
        lastError = `HTTP ${response.status}`;
      } catch (error) { lastError = error.message; }
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    if (!answer?.ok || !["overdue", "focus", "alsoPossible", "doneToday"].every(key => Array.isArray(answer[key]) && answer[key].length === 0)) throw new Error(`Fresh clone did not return an empty ranked app (${lastError ?? "invalid shape"})`);
    console.log("publish-check: fresh production clone returned an empty app");
  } finally {
    stopTree(server);
    if (server && server.exitCode === null && server.signalCode === null) await once(server, "close");
    await removeTemporary(dir);
  }
}
