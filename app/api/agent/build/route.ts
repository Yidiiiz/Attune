// Owns: Build's NDJSON stream and resumable state (§14).
// Failure behavior: client cancellation aborts the SDK but drains the generator so partial edits
// receive a reviewable state; schema failures are ordinary 400 responses before the stream opens.
import { z } from "zod";
import { buildState, runBuild } from "@/lib/agent/build";
import { readConversation } from "@/lib/store/chats";
import { body, handle, ok, parseInput } from "../../respond";

export const dynamic = "force-dynamic";
const Input = z.object({ prompt: z.string().max(32000).optional(), approval: z.enum(["plan", "auto"]).optional(),
  id: z.string().uuid().optional(), approved: z.boolean().optional(), conversationId: z.string().optional() }).strict();

export async function GET(request: Request): Promise<Response> {
  return handle(async () => ok({ state: buildState(parseInput(z.string().uuid(), new URL(request.url).searchParams.get("id"))) }));
}
export async function POST(request: Request): Promise<Response> {
  return handle(async () => {
    const input = parseInput(Input, await body(request));
    if (input.conversationId) await readConversation(input.conversationId);
    const abort = new AbortController();
    let listening = true;
    const gone = (): void => { listening = false; abort.abort(); };
    if (request.signal.aborted) gone();
    request.signal.addEventListener("abort", gone, { once: true });
    const encoder = new TextEncoder();
    return new Response(new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const event of runBuild({ ...input, signal: abort.signal })) {
            if (listening) {
              try { controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`)); }
              catch { gone(); }
            }
          }
        } finally {
          request.signal.removeEventListener("abort", gone);
          if (listening) controller.close();
        }
      }, cancel: gone,
    }), { headers: { "content-type": "application/x-ndjson", "cache-control": "no-store" } });
  });
}
