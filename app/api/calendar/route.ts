// Owns: `GET /api/calendar?from&to` (PROJECT.md §14) — the grouped tasks a date range contains.
//
// The grouping itself is `lib/schedule/calendar.ts`, which the calendar page also calls directly as
// a route-level server file (§3). Both go through the same pure function, so the page and the API
// cannot disagree about which cell a task belongs in.
//
// Failure behavior: a malformed or inverted range is a 400 rather than an empty answer, because an
// empty calendar and a mistyped query look identical on screen. The span is capped: every date in
// the range gets an entry, so an unbounded `to` is an unbounded response.

import { groupDays } from "@/lib/schedule/calendar";
import { daysBetween, todayIn } from "@/lib/schedule/dates";
import { listTasks } from "@/lib/store/tasks";
import { readSettings } from "@/lib/store/settings";
import { StoreError } from "@/lib/store/paths";
import { handle, ok } from "../respond";

export const dynamic = "force-dynamic";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Longer than any view asks for — Month is at most 42 days — and short enough to stay a response. */
const MAX_SPAN_DAYS = 400;

function date(params: URLSearchParams, name: string, fallback: string): string {
  const value = params.get(name);
  if (value === null) return fallback;
  if (!DATE.test(value)) throw new StoreError("invalid", `${name} must be YYYY-MM-DD: ${value}`);
  return value;
}

export async function GET(request: Request): Promise<Response> {
  return handle(async () => {
    const params = new URL(request.url).searchParams;
    const settings = await readSettings();
    const today = todayIn(settings.timezone);

    const from = date(params, "from", today);
    const to = date(params, "to", from);

    const span = daysBetween(from, to);
    if (span < 0) throw new StoreError("invalid", `to (${to}) is before from (${from})`);
    if (span >= MAX_SPAN_DAYS) {
      throw new StoreError("invalid", `range is ${span + 1} days; the maximum is ${MAX_SPAN_DAYS}`);
    }

    const tasks = await listTasks();
    return ok({ from, to, days: groupDays(tasks, from, to), errors: listTasks.errors });
  });
}
