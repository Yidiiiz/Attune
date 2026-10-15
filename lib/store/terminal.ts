// Owns: disposable terminal request artifacts and installed client discovery.
// Failure behavior: refuse missing clients; remove only this invocation's temporary directory.
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir, homedir } from "node:os";
import path from "node:path";

export async function terminalCommand(provider: "openai" | "anthropic"): Promise<{ command: string; prefix: string[] }> {
  const windows = process.platform === "win32";
  const dirs = (process.env.PATH ?? process.env.Path ?? "").split(path.delimiter);
  if (provider === "openai") {
    for (const dir of dirs) {
      const js = path.join(dir, "node_modules", "@openai", "codex", "bin", "codex.js");
      try { await access(js); return { command: process.execPath, prefix: [js] }; } catch { /* next installation */ }
    }
  }
  const name = provider === "openai" ? "codex" : "claude";
  for (const dir of [...dirs, path.join(homedir(), ".local", "bin")]) {
    const exe = path.join(dir, name + (windows ? ".exe" : ""));
    try { await access(exe); return { command: exe, prefix: [] }; } catch { /* next installation */ }
  }
  throw new Error(`Install ${name} and sign in from a terminal, or select API in Settings.`);
}

export async function terminalWorkspace(schema: unknown) {
  const dir = await mkdtemp(path.join(tmpdir(), "attune-chat-"));
  try {
    const schemaPath = path.join(dir, "response-schema.json");
    await writeFile(schemaPath, JSON.stringify(schema), { mode: 0o600 });
    return { dir, schemaPath,
      image: async (index: number, mediaType: string, data: string) => {
        const extension = ({ "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" } as Record<string,string>)[mediaType];
        if (!extension) throw new Error("Unsupported image format");
        const file = path.join(dir, `image-${index}.${extension}`);
        await writeFile(file, Buffer.from(data, "base64"), { mode: 0o600 }); return file;
      },
      result: async () => readFile(path.join(dir, "response.json"), "utf8"),
      close: async () => { await rm(dir, { recursive: true, force: true }); },
    };
  } catch (error) { await rm(dir, { recursive: true, force: true }); throw error; }
}
