// Owns: one turn, streamed (PROJECT.md §14, §13.2). The body is NDJSON — one `TurnEvent` per line,
// `Content-Type: application/x-ndjson` — and **the first line is always the ids**, so the client can
// render the pair optimistically and annotation anchoring knows the assistant's id before the model
// has said anything (§16.2).
//
// The ids are minted by the client and sent with the request, which is why they are echoed rather
// than returned: by the time this route answers, the client has already drawn them.
//
// **Aborting is the client going away, and it has to reach the turn.** Stop, a navigation and a
// closed tab all arrive as the same thing: the response stream is cancelled. If that only ended the
// *route*, the turn's generator would be left suspended forever — `finalizeTurn` would never run,
// and the message would sit on disk as `status: streaming`, uncommitted, permanently. So the two
// signals that can say "nobody is listening" — `request.signal` and the stream's own `cancel` — are
// joined into one controller, and the turn is then **drained to the end** with its events
// discarded, so it takes its own abort path and writes the partial reply down as `stopped` (§16.3).
// Found by the browser check written for exactly this, which is why condition 8 asked for one.
//
// Failure behavior: two shapes, deliberately different. A failure *before the stream opens* — no
// such conversation, a body zod refuses — is an ordinary JSON error with a status, because nothing
// has been streamed and the client is still holding its request. A failure *after* is an `error`
// event inside the stream carrying `code`, because the response is already 200 and a status cannot
// be taken back; §13.5's routing reads that code, so a rejected key still lands as a toast and a
// refused credential still lands inline. `runChatTurn` has already cleaned up either way.

import { z } from "zod";
import { runChatTurn } from "@/lib/agent/turn";
import { readConversation } from "@/lib/store/chats";
import { readSettings } from "@/lib/store/settings";
import { handle, body as readBody } from "../../../respond";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const Send = z.object({
  /** Minted by the client (§16.2). Absent when regenerating: no new prompt, only a new reply. */
  userMessageId: z.string().regex(UUID).optional(),
  text: z.string().optional(),
  attachments: z.array(z.string()).default([]),
  assistantMessageId: z.string().regex(UUID),
  /** Where to hang it: absent means the current leaf; a value is an edit, regenerate, or branch. */
  parentId: z.string().regex(UUID).nullable().optional(),
  mode: z.enum(["ask", "tasks"]).default("ask"),
  model: z.string().optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params): Promise<Response> {
  return handle(async () => {
    const { id } = await params;
    const input = Send.parse(await readBody(request));
    const settings = await readSettings();

    // Read once before streaming so a missing conversation is a 404 with a body, not a stream that
    // opens and immediately says something went wrong.
    const { conversation } = await readConversation(id);

    const userMessage =
      input.userMessageId === undefined
        ? undefined
        : { id: input.userMessageId, text: input.text ?? "", attachments: input.attachments };

    const effort = settings.models.default.effort;
    // One controller for both ways of finding out that nobody is listening any more.
    const turn = new AbortController();
    if (request.signal.aborted) turn.abort();

    const events = runChatTurn({
      conversationId: id,
      ...(userMessage === undefined ? {} : { userMessage }),
      assistantMessageId: input.assistantMessageId,
      ...(input.parentId === undefined ? {} : { parentId: input.parentId }),
      mode: input.mode,
      model: input.model ?? conversation.model,
      ...(effort === undefined ? {} : { effort }),
      signal: turn.signal,
    });

    const encoder = new TextEncoder();
    const line = (value: unknown): Uint8Array => encoder.encode(`${JSON.stringify(value)}\n`);

    let listening = true;
    const gone = (): void => {
      listening = false;
      turn.abort();
    };
    request.signal.addEventListener("abort", gone);

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const push = (value: unknown): void => {
          if (!listening) return;
          try {
            controller.enqueue(line(value));
          } catch {
            gone(); // the socket closed between two events
          }
        };

        push({
          type: "ids",
          userMessageId: input.userMessageId ?? null,
          assistantMessageId: input.assistantMessageId,
        });

        try {
          // Never leave this loop early. Abandoning the generator mid-turn suspends it forever:
          // `finalizeTurn` would never run, and the message would stay `streaming` on disk with
          // nothing in the log. Draining it lets the abort above reach the provider, which is what
          // turns "the client went away" into a `stopped` message (§16.3).
          for await (const event of events) push(event);
        } catch (err) {
          // `runChatTurn` reports its own failures as events; anything reaching here is unexpected,
          // and the client still has to be told rather than left on an open socket.
          push({ type: "error", message: (err as Error).message, code: "error" });
        }

        if (listening) controller.close();
      },
      cancel() {
        // Stop, a navigation, or a closed tab. The turn keeps going just long enough to notice.
        gone();
      },
    });

    return new Response(stream, {
      headers: {
        "content-type": "application/x-ndjson",
        "cache-control": "no-store",
        // Next buffers a streamed response behind some proxies otherwise, which turns a stream into
        // one very late delivery and makes the whole feature look broken.
        "x-accel-buffering": "no",
      },
    });
  });
}
